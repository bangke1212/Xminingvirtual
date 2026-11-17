// Dashboard terminal live — HANYA bila stdout adalah TTY.
// Bila bukan TTY (mis. jalan sebagai systemd service, atau output dialihkan
// ke file/pipe), modul ini TIDAK PERNAH dipakai: log baris biasa seperti
// biasa, tanpa satu pun escape sequence ANSI ke journal log.
// Paksa mode log biasa dengan env: LOG_PLAIN=true atau TERMINAL_UI=false.
import chalk from "chalk";
import Table from "cli-table3";
import { snapshot } from "./state.js";
import { setConsoleMuted } from "./logger.js";

const SEPARATOR = "─".repeat(76);

/** True bila dashboard terminal boleh dipakai (TTY + tidak dipaksa mati). */
export function shouldUseTerminalUI(cfg) {
  if (cfg.plainLogs) return false;
  if (!cfg.terminalUI) return false;
  return Boolean(process.stdout.isTTY);
}

function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString("id-ID", { hour12: false });
}

function fmtUptime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v) => String(v).padStart(2, "0");
  return h > 0 ? `${h}j ${pad(m)}m ${pad(sec)}d` : `${pad(m)}m ${pad(sec)}d`;
}

function statusColor(st) {
  const s = String(st ?? "").toLowerCase();
  if (s === "ok" || s === "idle") return chalk.green(st);
  if (s === "checking") return chalk.yellow(st);
  if (s === "error") return chalk.red(st);
  if (s === "starting") return chalk.dim(st);
  return st;
}

/** Satu frame dashboard (string lengkap, tanpa menulis ke stdout). */
export function renderFrame(cfg) {
  const s = snapshot;
  const lines = [];

  // Header
  const modeBadge =
    s.mode === "AUTO-CLAIM"
      ? chalk.bgYellow.black(" AUTO-CLAIM ")
      : chalk.bgGreen.black(" CHECK-ONLY ");
  const packetBadge = s.autoPacket ? chalk.yellow(" + AUTO-PACKET") : "";
  lines.push(
    `${chalk.bold.cyan("⛏  ZXOXO BOT")}  ${modeBadge}${packetBadge}` +
      chalk.dim(`   uptime ${fmtUptime(Date.now() - s.startedAt)} · ${fmtTime(Date.now())} · status ${statusColor(s.status)}`),
  );
  lines.push(chalk.dim(SEPARATOR));

  // Statistik jaringan
  const net = s.network;
  if (net) {
    lines.push(
      chalk.bold("JARINGAN  ") +
        `${fmtNum(net.miners)} miners · ${fmtNum(net.mined)} ZXO mined · ` +
        `${fmtNum(net.playerHash)} TH/s · burned ${fmtNum(net.burned)}`,
    );
    const zones = (net.zones ?? [])
      .map((z) => `${z.mark}: ${fmtNum(z.yield100, 2)} ZXO/jam per 100 TH`)
      .join(chalk.dim("  ·  "));
    if (zones) lines.push(chalk.dim(`yield    ${zones}`));
    if (s.signedIn === true) {
      lines.push(chalk.green(`login    ${s.handle ? `masuk sebagai ${s.handle}` : "masuk (X)"}`));
    } else if (s.signedIn === false) {
      lines.push(chalk.yellow("login    tidak masuk — cookie kosong/kedaluwarsa (mode publik saja)"));
    }
  } else {
    lines.push(chalk.dim("JARINGAN  memuat data…"));
  }
  lines.push(chalk.dim(SEPARATOR));

  // Tabel per-chain
  const table = new Table({
    head: [
      chalk.bold("Chain"),
      chalk.bold("Mined (server)"),
      chalk.bold("Diklaim (on-chain)"),
      chalk.bold("Claimable"),
      chalk.bold("Status"),
    ],
    style: { head: [], border: [] },
    colWidths: [14, 18, 20, 14, 14],
  });
  if (s.chains.length) {
    for (const c of s.chains) {
      const pending = c.pending;
      // Kolom Status: tunjukkan yang tertunda (kuning) bila ada, "ok" bila tidak ada.
      let statusCell;
      if (pending === null || pending === undefined) {
        statusCell = c.status === "ok" ? chalk.green("ok") : chalk.dim(c.status ?? "-");
      } else if (pending > 0) {
        statusCell = chalk.yellow(`tertunda ${fmtNum(pending, 2)}`);
      } else {
        statusCell = chalk.green("ok");
      }
      table.push([
        c.mark,
        c.mined === null || c.mined === undefined ? "-" : `${fmtNum(c.mined, 4)} ZXO`,
        c.claimed === null || c.claimed === undefined ? "-" : `${fmtNum(c.claimed, 4)} mZXO`,
        c.claimable === null || c.claimable === undefined ? "-" : `${fmtNum(c.claimable, 4)}`,
        statusCell,
      ]);
    }
  } else {
    table.push([chalk.dim("(belum ada data — siklus pertama sedang jalan)"), "", "", "", ""]);
  }
  lines.push(table.toString());

  // Panel wallet
  const w = s.wallet ?? {};
  lines.push(
    chalk.bold("WALLET   ") +
      (w.address ? `${w.address}` : chalk.dim("tanpa alamat")) +
      chalk.dim(` · cookie: ${w.hasCookie ? "ada" : "tidak ada"}`) +
      chalk.dim(` · ambang klaim ${cfg.minClaimZxo} ZXO · gas maks ${cfg.maxGasPriceGwei} gwei · interval ${cfg.checkIntervalMinutes} mnt`),
  );
  lines.push(chalk.dim(SEPARATOR));

  // Hasil terakhir (klaim / packet)
  if (s.lastResults.length) {
    lines.push(chalk.bold("HASIL TERAKHIR"));
    for (const r of s.lastResults.slice(-5)) {
      const mark = r.ok ? chalk.green("✓") : chalk.red("✗");
      const extra = r.tx
        ? chalk.dim(`tx ${String(r.tx).slice(0, 18)}…`)
        : r.reason
          ? chalk.dim(r.reason)
          : "";
      lines.push(`  ${mark} ${r.title} ${r.chain}: ${r.ok ? (r.skipped ? "dilewati" : "OK") : "GAGAL"} ${extra}`);
    }
  } else {
    lines.push(chalk.dim("HASIL TERAKHIR  — belum ada (mode CHECK-ONLY tidak mengirim transaksi)"));
  }
  lines.push(chalk.dim(SEPARATOR));

  // Log terakhir
  lines.push(chalk.bold("LOG TERAKHIR"));
  const tail = s.logs.slice(-8);
  if (tail.length) {
    for (const line of tail) lines.push(chalk.dim(`  ${line}`));
  } else {
    lines.push(chalk.dim("  (belum ada log)"));
  }
  lines.push(chalk.dim(SEPARATOR));

  // Footer petunjuk
  const webHint = cfg.webDashboard
    ? chalk.dim(` · web: http://${cfg.webHost}:${cfg.webPort}`)
    : "";
  lines.push(
    chalk.dim(`Ctrl+C berhenti · siklus berikut: ${s.nextCycleAt ? fmtTime(s.nextCycleAt) : "-"} · log harian: ${cfg.logDir || "logs"}/${webHint}`),
  );

  return lines.join("\n");
}

/** Gambar satu frame ke layar (bersihkan layar dulu). Hanya dipanggil bila TTY. */
export function renderTerminal(cfg) {
  process.stdout.write("\x1b[2J\x1b[0;0H" + renderFrame(cfg) + "\n");
}

let timer = null;

/**
 * Nyalakan dashboard terminal: matikan console biasa (log tetap ke file +
 * ring buffer), gambar frame pertama, lalu refresh tiap 2 detik.
 * Mengembalikan { stop() }.
 */
export function startTerminalUI(cfg) {
  setConsoleMuted(true);
  renderTerminal(cfg);
  timer = setInterval(() => renderTerminal(cfg), 2000);
  return {
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      setConsoleMuted(false);
      // Bersihkan layar supaya log penutup terbaca normal.
      process.stdout.write("\x1b[2J\x1b[0;0H");
    },
  };
}
