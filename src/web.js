// Dashboard web kecil — server HTTP built-in Node (tanpa dependensi).
// Aktif hanya bila WEB_DASHBOARD=true. Bind localhost secara default
// (127.0.0.1), port dari env WEB_PORT (default 8787).
//
// KEAMANAN: yang disajikan HANYA snapshot publik dari src/state.js —
// statistik jaringan, tabel per-chain, alamat wallet TERPOTONG, dan log
// terakhir. Cookie sesi dan private key TIDAK PERNAH masuk ke respons
// mana pun. Bila WEB_HOST diubah ke 0.0.0.0, bot mencatat peringatan.
import http from "node:http";
import { publicSnapshot } from "./state.js";
import { log } from "./logger.js";

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZXOXO Bot — Dashboard</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #FAF9F6; color: #0F172A; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #64748B; font-size: 13px; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge.check { background: #DCFCE7; color: #166534; }
  .badge.auto { background: #FEF3C7; color: #92400E; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; min-width: 150px; }
  .card .label { font-size: 12px; color: #64748B; }
  .card .value { font-size: 20px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #E2E8F0; font-size: 14px; }
  th { background: #F1F5F9; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
  .pend { color: #B45309; font-weight: 700; }
  .ok { color: #15803D; font-weight: 700; }
  pre { background: #0F172A; color: #E2E8F0; padding: 14px; border-radius: 12px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 15px; margin: 0 0 8px; }
  .muted { color: #64748B; font-size: 13px; }
</style>
</head>
<body>
<h1>⛏ ZXOXO Bot</h1>
<div class="sub">Dashboard status — refresh otomatis tiap 5 detik · <span id="clock">…</span></div>
<div class="section">
  <span id="mode" class="badge check">…</span>
  <span class="muted" id="statusline">memuat…</span>
</div>
<div class="cards" id="cards"></div>
<div class="section">
  <h2>Per-chain</h2>
  <table>
    <thead><tr><th>Chain</th><th>Mined (server)</th><th>Diklaim (on-chain)</th><th>Claimable</th><th>Status</th></tr></thead>
    <tbody id="chains"><tr><td colspan="5" class="muted">memuat…</td></tr></tbody>
  </table>
</div>
<div class="section">
  <h2>Wallet</h2>
  <div id="wallet" class="muted">memuat…</div>
</div>
<div class="section">
  <h2>Hasil terakhir</h2>
  <div id="results" class="muted">—</div>
</div>
<div class="section">
  <h2>Log terakhir</h2>
  <pre id="logs">memuat…</pre>
</div>
<noscript><p class="muted">JavaScript mati — muat ulang halaman secara manual untuk memperbarui data.</p></noscript>
<script>
async function refresh() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    const s = await r.json();
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
    const mode = document.getElementById('mode');
    mode.textContent = s.mode + (s.autoPacket ? ' + AUTO-PACKET' : '');
    mode.className = 'badge ' + (s.mode === 'AUTO-CLAIM' ? 'auto' : 'check');
    document.getElementById('statusline').textContent =
      'status: ' + s.status + ' · uptime: ' + Math.floor(s.uptimeSec / 60) + ' mnt' +
      (s.lastCycleAt ? ' · siklus terakhir: ' + new Date(s.lastCycleAt).toLocaleTimeString('id-ID') : '') +
      (s.signedIn === true ? ' · login: ' + (s.handle || 'masuk') : s.signedIn === false ? ' · login: tidak masuk' : '');
    const net = s.network || {};
    const cards = [
      ['Miners', (net.miners ?? '-')],
      ['ZXO mined', (net.mined ?? '-')],
      ['Hashrate pemain', (net.playerHash ? Number(net.playerHash).toLocaleString('en-US') + ' TH/s' : '-')],
      ['Burned', (net.burned ?? '-')],
    ];
    document.getElementById('cards').innerHTML = cards.map(([l, v]) =>
      '<div class="card"><div class="label">' + l + '</div><div class="value">' + v + '</div></div>').join('');
    const rows = (s.chains || []).map(c => {
      const pend = (c.pending === null || c.pending === undefined) ? '-' :
        (c.pending > 0 ? '<span class="pend">tertunda ' + Number(c.pending).toFixed(2) + '</span>' : '<span class="ok">ok</span>');
      return '<tr><td>' + c.mark + '</td><td>' + (c.mined ?? '-') + '</td><td>' +
        (c.claimed ?? '-') + '</td><td>' + (c.claimable ?? '-') + '</td><td>' + pend + '</td></tr>';
    }).join('');
    document.getElementById('chains').innerHTML = rows || '<tr><td colspan="5" class="muted">belum ada data</td></tr>';
    const w = s.wallet || {};
    document.getElementById('wallet').textContent =
      (w.address ? 'alamat: ' + w.address : 'tanpa alamat') +
      ' · cookie: ' + (w.hasCookie ? 'ada' : 'tidak ada');
    document.getElementById('results').innerHTML = (s.lastResults || []).length
      ? (s.lastResults || []).map(r =>
          (r.ok ? '✓ ' : '✗ ') + r.title + ' ' + r.chain + ': ' + (r.skipped ? 'dilewati' : r.ok ? 'OK' : 'GAGAL') +
          (r.tx ? ' (tx ' + String(r.tx).slice(0, 18) + '…)' : r.reason ? ' — ' + r.reason : '')
        ).join('<br>')
      : '— belum ada (mode CHECK-ONLY tidak mengirim transaksi)';
    document.getElementById('logs').textContent = (s.logs || []).slice(-15).join('\\n') || '(belum ada log)';
  } catch (e) {
    document.getElementById('statusline').textContent = 'gagal memuat status: ' + e.message;
  }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

/** Nyalakan dashboard web. Mengembalikan http.Server (atau null bila gagal). */
export function startWebDashboard(cfg) {
  const host = cfg.webHost || "127.0.0.1";
  const port = cfg.webPort || 8787;
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/status") {
        const body = JSON.stringify(publicSnapshot());
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(pageHtml());
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("tidak ditemukan");
    } catch (e) {
      try {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("error server");
      } catch {
        // Respons sudah terkirim sebagian — abaikan.
      }
      log.error(`dashboard web error: ${e.message}`);
    }
  });
  server.on("error", (e) => {
    log.error(`dashboard web gagal jalan (${host}:${port}): ${e.message}`);
  });
  server.listen(port, host, () => {
    log.info(`dashboard web aktif: http://${host}:${port} (bind ${host} saja)`);
    if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
      log.warn(
        `WEB_HOST=${host} — dashboard bisa dijangkau dari jaringan. ` +
          "Dashboard tidak menampilkan secret apa pun, tapi batasi aksesnya (mis. firewall / SSH tunnel).",
      );
    }
  });
  return server;
}
