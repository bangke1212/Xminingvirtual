// Logger sederhana: console + file harian (bila LOG_DIR diisi) + ring buffer
// untuk dashboard terminal/web (src/state.js).
// Saat dashboard terminal aktif, console dimatikan (setConsoleMuted) supaya
// frame dashboard tidak rusak — log tetap masuk file + ring buffer.
import fs from "node:fs";
import path from "node:path";
import { pushLogLine } from "./state.js";

let logDir = "";
let fileStream = null;
let currentDay = "";
let consoleMuted = false;

/** Matikan/nyalakan output console (dipakai dashboard terminal). */
export function setConsoleMuted(muted) {
  consoleMuted = Boolean(muted);
}

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function initLogger(dir) {
  logDir = (dir ?? "").trim();
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    console.error(`[logger] tidak bisa membuat folder log ${logDir}: ${e.message}`);
    logDir = "";
  }
}

function writeLine(line) {
  if (!logDir) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== currentDay || !fileStream) {
      fileStream?.end?.();
      currentDay = day;
      fileStream = fs.createWriteStream(path.join(logDir, `zxoxo-bot-${day}.log`), { flags: "a" });
    }
    fileStream.write(line + "\n");
  } catch {
    // Logging tidak boleh mematikan bot.
  }
}

function emit(level, msg) {
  const line = `[${ts()}] [${level}] ${msg}`;
  if (!consoleMuted) {
    if (level === "ERROR") console.error(line);
    else console.log(line);
  }
  pushLogLine(line);
  writeLine(line);
}

export const log = {
  info: (m) => emit("INFO", m),
  warn: (m) => emit("WARN", m),
  error: (m) => emit("ERROR", m),
  tx: (m) => emit("TX", m),
};
