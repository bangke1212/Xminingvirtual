// Alur klaim mZXO: baca status -> (bila AUTO_CLAIM) minta voucher -> kirim tx.
// Voucher HANYA diminta saat akan klaim (mode CHECK-ONLY tidak pernah meminta
// voucher dan tidak pernah mengirim transaksi).
import { ethers } from "ethers";
import { zxoxoApi } from "./api.js";
import { CHAINS } from "./config.js";
import { getClaimedBalance, sendClaim } from "./chain.js";
import { log } from "./logger.js";

/**
 * Baca baris per-chain dari respons /api/mine/chain secara defensif.
 * Bentuk persis respons TIDAK terverifikasi tanpa sesi login, jadi parser ini
 * mencoba beberapa bentuk umum dan mengembalikan null bila tidak dikenali.
 * Bentuk yang dicoba: array di .chains/.rows/.status, atau objek yang
 * kuncinya id chain (arbitrum/base/...), dengan field mined/claimed/balance.
 */
export function extractChainRows(status) {
  if (!status || typeof status !== "object") return null;
  const candidates = [];
  for (const key of ["chains", "rows", "status", "perChain"]) {
    if (Array.isArray(status[key])) candidates.push(...status[key]);
  }
  if (status.me && typeof status.me === "object") {
    for (const key of ["chains", "rows", "balances"]) {
      if (Array.isArray(status.me[key])) candidates.push(...status.me[key]);
    }
  }
  for (const c of CHAINS) {
    const row = status[c.id] ?? status.me?.[c.id];
    if (row && typeof row === "object") candidates.push({ id: c.id, ...row });
  }
  if (!candidates.length) return null;
  const out = new Map();
  for (const r of candidates) {
    const id = (r.id ?? r.chain ?? r.chainId ?? "").toString().toLowerCase();
    const chain = CHAINS.find((c) => c.id === id || c.mark.toLowerCase() === id);
    if (!chain) continue;
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
    out.set(chain.id, {
      chainId: chain.id,
      mined: num(r.mined ?? r.totalMined ?? r.earned),
      claimed: num(r.claimed ?? r.claimedOnChain ?? r.onchain),
      balance: num(r.balance ?? r.claimable),
    });
  }
  return out.size ? out : null;
}

/** Kumpulkan status per-chain: server (bila ada cookie) + on-chain (bila ada alamat). */
export async function collectStatus(cfg) {
  const rows = new Map();
  for (const c of CHAINS) rows.set(c.id, { chain: c, server: null, claimedOnChain: null });

  if (cfg.cookie) {
    try {
      const st = await zxoxoApi.getChainStatus(cfg.cookie);
      if (st.auth === false) {
        log.warn("sesi ZXO_COOKIE tidak valid (401) — status server dilewati; perbarui cookie.");
      } else {
        const parsed = extractChainRows(st);
        if (parsed) {
          for (const [id, r] of parsed) {
            const row = rows.get(id);
            if (row) row.server = r;
          }
        } else {
          log.warn(
            "bentuk /api/mine/chain tidak dikenali — saldo server tidak bisa dibaca. " +
              "Kunci respons: " + Object.keys(st).join(", "),
          );
        }
        // Tandai bila akun sedang dalam pemeriksaan (cek manusia).
        const me = st.me ?? st;
        if (me && typeof me === "object" && (me.check || me.stage)) {
          log.warn(`akun dalam status pemeriksaan server: ${JSON.stringify(me.check ?? me.stage)}`);
        }
      }
    } catch (e) {
      log.warn(`gagal membaca /api/mine/chain: ${e.message}`);
    }
  }

  if (cfg.walletAddress) {
    for (const c of CHAINS) {
      try {
        const bal = await getClaimedBalance(c, cfg.walletAddress);
        rows.get(c.id).claimedOnChain = bal;
      } catch (e) {
        log.warn(`gagal membaca saldo mZXO ${c.id}: ${e.message}`);
      }
    }
  }
  return rows;
}

/**
 * Klaim semua chain yang memenuhi syarat.
 * Urutan aman per chain: voucher -> verifikasi akun -> hitung tertunda ->
 * cek ambang + gas -> kirim tx -> tunggu konfirmasi.
 */
export async function claimAll(cfg, wallet) {
  const results = [];
  const minWei = ethers.parseUnits(String(cfg.minClaimZxo), 18);
  for (const chain of CHAINS) {
    const label = chain.id;
    try {
      const voucher = await zxoxoApi.getVoucher(cfg.cookie, chain.id);
      if (!voucher || voucher.account?.toLowerCase() !== wallet.address.toLowerCase()) {
        results.push({
          chain: label,
          ok: false,
          reason: `voucher untuk akun lain (${voucher?.account ?? "?"}) — cek wallet yang di-link`,
        });
        continue;
      }
      if (Number(voucher.chainId) !== chain.chainId) {
        results.push({ chain: label, ok: false, reason: "voucher chainId tidak cocok" });
        continue;
      }
      const cumulative = BigInt(voucher.cumulative);
      const onChain = await getClaimedBalance(chain, wallet.address);
      const pending = cumulative - onChain;
      const pendingZxo = Number(ethers.formatUnits(pending < 0n ? 0n : pending, 18));
      if (pending <= 0n) {
        results.push({ chain: label, ok: true, skipped: true, reason: "tidak ada yang tertunda" });
        continue;
      }
      if (pending < minWei) {
        results.push({
          chain: label,
          ok: true,
          skipped: true,
          reason: `tertunda ${pendingZxo.toFixed(4)} ZXO < ambang ${cfg.minClaimZxo} ZXO`,
        });
        continue;
      }
      log.info(
        `klaim ${label}: tertunda ${pendingZxo.toFixed(4)} ZXO ` +
          `(kumulatif ${ethers.formatUnits(cumulative, 18)}, sudah diklaim ${ethers.formatUnits(onChain, 18)})`,
      );
      const { hash } = await sendClaim(chain, voucher, { wallet, maxGwei: cfg.maxGasPriceGwei });
      const after = await getClaimedBalance(chain, wallet.address);
      results.push({
        chain: label,
        ok: true,
        tx: hash,
        claimed: pendingZxo,
        balanceAfter: Number(ethers.formatUnits(after, 18)),
      });
      log.tx(`klaim ${label} BERHASIL: ${pendingZxo.toFixed(4)} ZXO (tx ${hash})`);
    } catch (e) {
      results.push({ chain: label, ok: false, reason: e.message });
      log.error(`klaim ${label} gagal: ${e.message}`);
    }
  }
  return results;
}
