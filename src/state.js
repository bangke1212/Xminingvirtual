// Status bersama (snapshot) yang dibaca dashboard terminal + dashboard web.
// Modul ini TIDAK PERNAH menyimpan secret: tanpa cookie, tanpa private key.
// Alamat wallet hanya disimpan dalam bentuk terpotong (0x1234…abcd).
// Tidak ada import — logger.js dan modul lain boleh mengimpor modul ini
// tanpa risiko circular import.

export const snapshot = {
  startedAt: Date.now(),
  mode: "CHECK-ONLY", // CHECK-ONLY | AUTO-CLAIM
  autoPacket: false,
  status: "starting", // starting | checking | idle | error
  network: null, // { miners, mined, playerHash, burned, zones: [{mark, miners, totalHash, yield100}] }
  signedIn: null, // true | false | null (belum dicek)
  handle: null,
  chains: [], // [{ id, mark, mined, claimed, claimable, pending, status }]
  wallet: null, // { address: "0x1234…abcd" | null, hasCookie: bool }
  lastCycleAt: null,
  nextCycleAt: null,
  lastResults: [], // [{ title, chain, ok, tx, reason, skipped }]
  logs: [], // ring buffer baris log terakhir (teks biasa, tanpa secret)
};

const MAX_LOGS = 100;

/** Potong alamat wallet untuk tampilan: 0x1234…abcd. */
export function maskAddress(addr) {
  if (!addr) return null;
  const a = String(addr);
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Simpan satu baris log ke ring buffer (dipakai dashboard). */
export function pushLogLine(line) {
  snapshot.logs.push(line);
  if (snapshot.logs.length > MAX_LOGS) {
    snapshot.logs.splice(0, snapshot.logs.length - MAX_LOGS);
  }
}

/** Salinan snapshot yang aman dipublikasikan (JSON / web). Tanpa secret. */
export function publicSnapshot() {
  return {
    ok: true,
    startedAt: snapshot.startedAt,
    uptimeSec: Math.floor((Date.now() - snapshot.startedAt) / 1000),
    mode: snapshot.mode,
    autoPacket: snapshot.autoPacket,
    status: snapshot.status,
    network: snapshot.network,
    signedIn: snapshot.signedIn,
    handle: snapshot.handle,
    chains: snapshot.chains,
    wallet: snapshot.wallet,
    lastCycleAt: snapshot.lastCycleAt,
    nextCycleAt: snapshot.nextCycleAt,
    lastResults: snapshot.lastResults,
    logs: snapshot.logs.slice(-30),
  };
}
