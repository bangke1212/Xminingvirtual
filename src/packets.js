// Pengiriman packet LayerZero (opsional, flag AUTO_PACKET).
// JUJUR: alamat gateway per-chain TIDAK ditemukan di kode klien situs maupun
// di docs publik (hanya alamat hub Base + endpoint id yang tercantum).
// Modul ini HANYA jalan bila respons /api/mine/packets menyediakan alamat
// gateway + kuota fee per chain; bila tidak ada, packet dilewati dengan
// peringatan jelas (tidak ada tebakan alamat).
// Base tidak butuh packet ("Record here") — fungsi record hub di Base belum
// terverifikasi tandatangannya, jadi Base dilewati dengan catatan.
import { ethers } from "ethers";
import { zxoxoApi } from "./api.js";
import { CHAINS } from "./config.js";
import { getProvider } from "./chain.js";
import { log } from "./logger.js";

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

/** Normalisasi baris packet dari respons API (bentuk persis belum terverifikasi). */
export function extractPacketRows(packets) {
  if (!packets || typeof packets !== "object") return null;
  const list = Array.isArray(packets.packets)
    ? packets.packets
    : Array.isArray(packets.rows)
      ? packets.rows
      : Array.isArray(packets)
        ? packets
        : null;
  if (!list) return null;
  const out = new Map();
  for (const r of list) {
    const id = (r.chain ?? r.id ?? r.chainId ?? "").toString().toLowerCase();
    const chain = CHAINS.find((c) => c.id === id || c.mark.toLowerCase() === id);
    if (!chain) continue;
    out.set(chain.id, {
      chainId: chain.id,
      state: (r.state ?? r.status ?? "").toString().toLowerCase(),
      gateway: pick(r, ["gateway", "gatewayAddress", "contract", "address"]),
      feeWei: pick(r, ["feeWei", "fee", "quote", "lzFee"]),
      balance: pick(r, ["balance", "mzxO", "held"]),
      recorded: pick(r, ["recorded", "hubBalance"]),
    });
  }
  return out.size ? out : null;
}

/**
 * Kirim packet untuk chain yang: sudah klaim mZXO, hub belum mencatat saldo
 * terbaru, dan API menyediakan gateway + fee. Mengembalikan ringkasan.
 */
export async function sendPackets(cfg, wallet) {
  const results = [];
  let data;
  try {
    data = await zxoxoApi.getPackets(cfg.cookie);
  } catch (e) {
    log.error(`gagal membaca /api/mine/packets: ${e.message}`);
    return results;
  }
  if (data.auth === false) {
    log.warn("sesi ZXO_COOKIE tidak valid (401) — packet dilewati.");
    return results;
  }
  const rows = extractPacketRows(data);
  if (!rows) {
    log.warn(
      "bentuk /api/mine/packets tidak dikenali (gateway/fee tidak ditemukan) — " +
        "packet TIDAK dikirim. Kunci respons: " + Object.keys(data).join(", "),
    );
    return results;
  }

  for (const chain of CHAINS) {
    if (chain.id === "base") {
      results.push({
        chain: "base",
        ok: true,
        skipped: true,
        reason: "Base tidak butuh packet (Record here) — fungsi record hub belum terverifikasi, dilewati",
      });
      continue;
    }
    const row = rows.get(chain.id);
    if (!row) {
      results.push({ chain: chain.id, ok: true, skipped: true, reason: "tidak ada data packet" });
      continue;
    }
    const state = row.state;
    if (state && !["send", "send_update", "update", "ready"].includes(state)) {
      results.push({ chain: chain.id, ok: true, skipped: true, reason: `status packet: ${state || "?"}` });
      continue;
    }
    if (!row.gateway || !/^0x[0-9a-fA-F]{40}$/.test(row.gateway)) {
      results.push({
        chain: chain.id,
        ok: false,
        reason: "alamat gateway tidak disediakan API — packet tidak dikirim (tanpa tebakan alamat)",
      });
      continue;
    }
    if (row.feeWei === null) {
      results.push({ chain: chain.id, ok: false, reason: "kuota fee tidak disediakan API" });
      continue;
    }
    try {
      const fee = BigInt(row.feeWei);
      const margin = (fee * BigInt(Math.round(cfg.packetFeeMarginPercent))) / 100n;
      const value = fee + margin;
      const provider = await getProvider(chain);
      const signer = wallet.connect(provider);
      const tx = await signer.sendTransaction({ to: ethers.getAddress(row.gateway), value });
      log.tx(`packet ${chain.id} terkirim: ${tx.hash} (fee ~${ethers.formatEther(value)} ${chain.native})`);
      const receipt = await tx.wait(1);
      if (receipt.status !== 1n && receipt.status !== 1) {
        throw new Error(`packet ${chain.id} gagal on-chain (tx ${tx.hash})`);
      }
      results.push({ chain: chain.id, ok: true, tx: tx.hash });
    } catch (e) {
      results.push({ chain: chain.id, ok: false, reason: e.message });
      log.error(`packet ${chain.id} gagal: ${e.message}`);
    }
  }
  return results;
}
