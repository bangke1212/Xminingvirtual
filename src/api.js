// Klien HTTP untuk API zxoxo.xyz.
// Bentuk respons di bawah ini TERVERIFIKASI untuk endpoint publik (17 Nov 2026):
//   GET  /api/chain/market   -> { ok, chains: [{ id, name, chainId, native,
//                              usdPrice, paused, tiers: [{ tier, usdCents,
//                              hashrate, active, wei }], live }] }
//   GET  /api/mine/state     -> tanpa cookie: { ok, signedIn:false,
//                              official:false, net: { at, zones: [{ id, name,
//                              mark, playerHash, botHash, totalHash, yield100,
//                              miners }], totals: { miners, playerHash, mined,
//                              burned }, leaders: [...] } }
//   GET  /api/chain/activity -> { ok, activity: [{ handle, avatar, chain,
//                              hashrate, tx, at }] }
//   GET  /api/live           -> { ok, people: [{ handle, avatar, signal, at }] }
// Endpoint ber-cookie (401 tanpa sesi — terverifikasi):
//   GET  /api/mine/chain     -> status per-chain akun (rig, saldo mining)
//   GET  /api/mine/packets   -> status packet per-chain
//   GET  /api/mine/early     -> status early miner
//   GET  /api/mine/blocks    -> blok mining akun
//   POST /api/mine/voucher   { chain } -> { ok, voucher: { account, amountWei,
//                              cumulative, deadline, signature, contract,
//                              chainId, data? } }   (bentuk voucher dari kode
//                              klien situs; BELUM bisa dites tanpa sesi login)
//   POST /api/mine/act       { type: "start"|"claim"|"jump"|"overclock", ... }
//   POST /api/mine/sync      { chain } -> { ok, status: { rigs: [...] } }
//   GET  /api/mine/check     -> { token, image } (cek manusia untuk akun
//                              yang ditandai); POST { token, answer }
//   GET  /api/wallet/link?address=0x.. -> { ok, message, token }
//   POST /api/wallet/link    { address, token, signature }
//   POST /api/pulse          { v, p, bg } (heartbeat kehadiran — tidak dipakai bot)
// Sesi login X memakai cookie yang diset server saat OAuth callback.
// NAMA cookie tidak terlihat di kode klien situs, jadi bot mengirim SELURUH
// string header Cookie dari .env apa adanya (ZXO_COOKIE).

import { SITE } from "./config.js";

const TIMEOUT_MS = 15000;

async function req(path, { method = "GET", body = null, cookie = "" } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${SITE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Respons bukan JSON (mis. halaman error) — kembalikan mentah.
  }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 500) };
}

export const zxoxoApi = {
  /** Statistik jaringan publik (tanpa login). */
  async getState(cookie = "") {
    const r = await req("/api/mine/state", { cookie });
    if (!r.ok) throw new Error(`GET /api/mine/state -> HTTP ${r.status}`);
    return r.json;
  },

  /** Harga rig live per chain (publik). */
  async getMarket() {
    const r = await req("/api/chain/market");
    if (!r.ok) throw new Error(`GET /api/chain/market -> HTTP ${r.status}`);
    return r.json;
  },

  /** Aktivitas pembelian rig terbaru (publik). */
  async getActivity() {
    const r = await req("/api/chain/activity");
    if (!r.ok) throw new Error(`GET /api/chain/activity -> HTTP ${r.status}`);
    return r.json;
  },

  /** Orang yang sedang online (publik). */
  async getLive() {
    const r = await req("/api/live");
    if (!r.ok) throw new Error(`GET /api/live -> HTTP ${r.status}`);
    return r.json;
  },

  /**
   * Status per-chain milik akun yang login (butuh cookie).
   * Bentuk persis respons TIDAK terverifikasi tanpa sesi — bot membaca
   * defensif: cari field rig/balance/mined/claimed apa pun bentuknya.
   * Mengembalikan null bila sesi tidak valid (401).
   */
  async getChainStatus(cookie) {
    const r = await req("/api/mine/chain", { cookie });
    if (r.status === 401) return { auth: false };
    if (!r.ok) throw new Error(`GET /api/mine/chain -> HTTP ${r.status}`);
    return { auth: true, ...(r.json ?? {}) };
  },

  /** Status packet LayerZero per-chain (butuh cookie). 401 -> { auth:false }. */
  async getPackets(cookie) {
    const r = await req("/api/mine/packets", { cookie });
    if (r.status === 401) return { auth: false };
    if (!r.ok) throw new Error(`GET /api/mine/packets -> HTTP ${r.status}`);
    return { auth: true, ...(r.json ?? {}) };
  },

  /**
   * Minta voucher claim ke server (butuh cookie).
   * Voucher ditandatangani server (EIP-712) untuk total kumulatif akun.
   * Mengembalikan { voucher } atau melempar Error dengan pesan server.
   */
  async getVoucher(cookie, chainId) {
    const r = await req("/api/mine/voucher", {
      method: "POST",
      body: { chain: chainId },
      cookie,
    });
    if (r.status === 401) throw new Error("sesi kedaluwarsa (401) — perbarui ZXO_COOKIE");
    if (!r.ok || !r.json?.ok) {
      throw new Error(`voucher ${chainId} gagal: ${r.json?.error ?? `HTTP ${r.status}`}`);
    }
    return r.json.voucher;
  },
};
