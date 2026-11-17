// ZXOXO Bot — entry point.
// Mode default: CHECK-ONLY. Bot hanya membaca status publik + (bila ada cookie
// dan alamat wallet) status akun dan saldo on-chain, lalu melaporkan.
// Transaksi HANYA bila AUTO_CLAIM=true di .env, dan packet HANYA bila
// AUTO_PACKET=true juga. Bot TIDAK PERNAH: mining (proof), membeli rig,
// overclock, jump, atau memposting ke X.
//
// Penggunaan:
//   node src/index.js            jalan terus, cek tiap CHECK_INTERVAL_MINUTES
//   node src/index.js --once     satu siklus lalu berhenti
//   node src/index.js --validate cek konfigurasi + konektivitas, lalu berhenti
import "dotenv/config";
import { ethers } from "ethers";
import { CHAINS, CONTRACTS, loadConfig } from "./config.js";
import { initLogger, log } from "./logger.js";
import { zxoxoApi } from "./api.js";
import { claimAll, collectStatus } from "./claim.js";
import { sendPackets } from "./packets.js";
import { getClaimedBalance, getHubTotal, getProvider } from "./chain.js";
import { reportNetwork, reportResults, reportWallet } from "./report.js";
import { maskAddress, snapshot } from "./state.js";
import { renderTerminal, shouldUseTerminalUI, startTerminalUI } from "./terminal.js";
import { startWebDashboard } from "./web.js";

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const VALIDATE = args.has("--validate");

// Referensi UI yang sedang jalan (untuk dibersihkan saat berhenti/error).
let termUI = null;
let webServer = null;

async function validateConnectivity(cfg) {
  const problems = [];
  // 1) API publik situs
  for (const [name, fn] of [
    ["GET /api/chain/market", () => zxoxoApi.getMarket()],
    ["GET /api/mine/state", () => zxoxoApi.getState()],
    ["GET /api/live", () => zxoxoApi.getLive()],
  ]) {
    try {
      await fn();
      log.info(`OK  ${name}`);
    } catch (e) {
      problems.push(`${name}: ${e.message}`);
      log.error(`GAGAL ${name}: ${e.message}`);
    }
  }
  // 2) RPC + kode kontrak di tiap chain
  for (const chain of CHAINS) {
    try {
      const provider = await getProvider(chain);
      const block = await provider.getBlockNumber();
      const codeMined = await provider.getCode(CONTRACTS.MINED);
      const codeStore = await provider.getCode(CONTRACTS.RIG_STORE);
      if (codeMined === "0x" || codeStore === "0x") {
        throw new Error("kode kontrak tidak ditemukan (alamat salah / chain salah?)");
      }
      log.info(`OK  ${chain.id}: blok ${block}, kontrak mZXO + RigStore ada`);
    } catch (e) {
      problems.push(`${chain.id}: ${e.message}`);
      log.error(`GAGAL ${chain.id}: ${e.message}`);
    }
  }
  // 3) Hub Base (alamat dari docs — bila gagal, hanya peringatan)
  try {
    const total = await getHubTotal(ethers.ZeroAddress);
    log.info(`OK  hub Base totalOf(0x0) = ${total}`);
  } catch (e) {
    log.warn(`hub Base tidak bisa dibaca (alamat dari docs, belum terverifikasi): ${e.message}`);
  }
  // 4) Sesi (bila cookie diisi)
  if (cfg.cookie) {
    try {
      const st = await zxoxoApi.getChainStatus(cfg.cookie);
      if (st.auth === false) {
        problems.push("ZXO_COOKIE tidak valid (401) — perbarui cookie dari browser.");
        log.error("GAGAL sesi: cookie tidak valid (401)");
      } else {
        log.info("OK  sesi ZXO_COOKIE valid");
      }
    } catch (e) {
      problems.push(`sesi: ${e.message}`);
      log.error(`GAGAL sesi: ${e.message}`);
    }
  } else {
    log.info("INFO sesi: ZXO_COOKIE kosong — mode publik saja (tanpa status akun)");
  }
  // 5) Wallet (bila private key diisi)
  if (cfg.walletPrivateKey) {
    try {
      const w = new ethers.Wallet(cfg.walletPrivateKey);
      if (cfg.walletAddress && w.address.toLowerCase() !== cfg.walletAddress.toLowerCase()) {
        problems.push("WALLET_ADDRESS tidak cocok dengan WALLET_PRIVATE_KEY.");
        log.error("GAGAL wallet: alamat .env tidak cocok dengan private key");
      } else {
        log.info(`OK  wallet: ${w.address}`);
      }
    } catch (e) {
      problems.push(`wallet: ${e.message}`);
      log.error(`GAGAL wallet: ${e.message}`);
    }
  }
  return problems;
}

async function runCycle(cfg, wallet) {
  snapshot.status = "checking";
  log.info("=== siklus cek ===");
  // 1) Status jaringan publik
  try {
    const state = await zxoxoApi.getState(cfg.cookie);
    reportNetwork(state);
    const net = state?.net;
    if (net) {
      const t = net.totals ?? {};
      snapshot.network = {
        miners: t.miners ?? null,
        mined: t.mined ?? null,
        playerHash: t.playerHash ?? null,
        burned: t.burned ?? null,
        zones: (net.zones ?? []).map((z) => ({
          mark: z.mark ?? z.id ?? "?",
          miners: z.miners ?? null,
          totalHash: z.totalHash ?? null,
          yield100: z.yield100 ?? null,
        })),
      };
    }
    snapshot.signedIn = state.signedIn ?? null;
    if (state.signedIn) {
      snapshot.handle = state.me?.handle ?? state.me?.username ?? null;
      log.info(`login sebagai: ${snapshot.handle ?? "(tidak diketahui)"}`);
    } else if (cfg.cookie) {
      log.warn("cookie terisi tapi server menjawab signedIn=false — cookie mungkin kedaluwarsa");
    }
  } catch (e) {
    log.error(`gagal membaca /api/mine/state: ${e.message}`);
  }

  // 2) Status akun + saldo on-chain
  const rows = await collectStatus(cfg);
  reportWallet(rows);
  snapshot.chains = CHAINS.map((c) => {
    const row = rows.get(c.id);
    const mined = row?.server?.mined ?? null;
    const claimed =
      row?.claimedOnChain !== null && row?.claimedOnChain !== undefined
        ? Number(ethers.formatUnits(row.claimedOnChain, 18))
        : null;
    const claimable = row?.server?.balance ?? null;
    const pending = mined !== null && claimed !== null ? Math.max(0, mined - claimed) : null;
    return {
      id: c.id,
      mark: c.mark,
      mined,
      claimed,
      claimable,
      pending,
      status: row?.server ? "ok" : cfg.cookie ? "tanpa data" : "tanpa cookie",
    };
  });

  // 3) Klaim (hanya bila AUTO_CLAIM=true)
  if (cfg.autoClaim && wallet) {
    const results = await claimAll(cfg, wallet);
    reportResults("hasil klaim", results);
    snapshot.lastResults = results.map((r) => ({
      title: "klaim",
      chain: r.chain,
      ok: r.ok,
      tx: r.tx ?? null,
      reason: r.reason ?? null,
      skipped: Boolean(r.skipped),
    }));
    // 4) Packet (hanya bila AUTO_PACKET=true)
    if (cfg.autoPacket) {
      const pres = await sendPackets(cfg, wallet);
      reportResults("hasil packet", pres);
      snapshot.lastResults.push(
        ...pres.map((r) => ({
          title: "packet",
          chain: r.chain,
          ok: r.ok,
          tx: r.tx ?? null,
          reason: r.reason ?? null,
          skipped: Boolean(r.skipped),
        })),
      );
    }
  } else {
    log.info("mode CHECK-ONLY: tidak ada transaksi yang dikirim (AUTO_CLAIM=false)");
  }
  snapshot.lastCycleAt = Date.now();
  snapshot.nextCycleAt =
    cfg.checkIntervalMinutes > 0 ? Date.now() + cfg.checkIntervalMinutes * 60 * 1000 : null;
  snapshot.status = "idle";
  log.info("=== siklus selesai ===");
  if (termUI) renderTerminal(cfg);
}

async function main() {
  const { cfg, errors } = loadConfig();
  initLogger(cfg.logDir);

  log.info("ZXOXO Bot mulai — mode " + (cfg.autoClaim ? "AUTO-CLAIM" : "CHECK-ONLY") +
    (cfg.autoPacket ? " + AUTO-PACKET" : ""));
  if (cfg.autoClaim) {
    log.warn("PERINGATAN: AUTO_CLAIM aktif. Pastikan wallet adalah BURNER dengan saldo kecil.");
  }
  if (errors.length) {
    for (const e of errors) log.error("konfigurasi: " + e);
    process.exitCode = 2;
    return;
  }

  // Turunkan alamat wallet dari private key bila alamat kosong.
  let wallet = null;
  if (cfg.walletPrivateKey) {
    wallet = new ethers.Wallet(cfg.walletPrivateKey);
    if (!cfg.walletAddress) cfg.walletAddress = wallet.address;
  }

  // Isi snapshot awal untuk dashboard (tanpa secret — alamat terpotong).
  snapshot.mode = cfg.autoClaim ? "AUTO-CLAIM" : "CHECK-ONLY";
  snapshot.autoPacket = cfg.autoPacket;
  snapshot.wallet = {
    address: maskAddress(cfg.walletAddress),
    hasCookie: Boolean(cfg.cookie),
  };

  if (VALIDATE) {
    const problems = await validateConnectivity(cfg);
    if (problems.length) {
      log.error(`validasi GAGAL (${problems.length} masalah)`);
      process.exitCode = 1;
    } else {
      log.info("validasi BERHASIL — semua pemeriksaan lolos");
    }
    return;
  }

  // Dashboard web (bila WEB_DASHBOARD=true) — jalan juga dalam mode --once.
  if (cfg.webDashboard) {
    webServer = startWebDashboard(cfg);
  }

  // Dashboard terminal (hanya mode jalan-terus + stdout TTY).
  // Mode --once / --validate tetap log baris biasa.
  if (!ONCE && shouldUseTerminalUI(cfg)) {
    termUI = startTerminalUI(cfg);
  }

  const intervalMs = cfg.checkIntervalMinutes * 60 * 1000;
  const loop = async () => {
    try {
      await runCycle(cfg, wallet);
    } catch (e) {
      snapshot.status = "error";
      log.error(`siklus gagal: ${e.message}`);
    }
  };
  await loop();
  if (!ONCE && intervalMs > 0) {
    log.info(`jadwal berikutnya dalam ${cfg.checkIntervalMinutes} menit`);
    const timer = setInterval(loop, intervalMs);
    const stop = () => {
      clearInterval(timer);
      if (termUI) {
        termUI.stop();
        termUI = null;
      }
      if (webServer) {
        webServer.close();
        webServer = null;
      }
      log.info("bot berhenti");
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } else {
    // Mode --once (atau interval 0): bersihkan UI lalu berhenti.
    if (termUI) {
      termUI.stop();
      termUI = null;
    }
    if (webServer) {
      webServer.close();
      webServer = null;
    }
  }
}

main().catch((e) => {
  // Pastikan error fatal terlihat: matikan dashboard terminal dulu.
  if (termUI) {
    termUI.stop();
    termUI = null;
  }
  if (webServer) {
    webServer.close();
    webServer = null;
  }
  log.error(`fatal: ${e.stack ?? e.message}`);
  process.exit(1);
});
