// Format laporan status sekali siklus (console + log).
import { ethers } from "ethers";
import { CHAINS } from "./config.js";
import { log } from "./logger.js";

export function reportNetwork(state) {
  const net = state?.net;
  if (!net) {
    log.warn("tidak ada data jaringan dari /api/mine/state");
    return;
  }
  const t = net.totals ?? {};
  log.info(
    `jaringan: ${t.miners ?? "?"} miners · ${Number(t.mined ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ZXO mined · ` +
      `${Number(t.playerHash ?? 0).toLocaleString("en-US")} TH/s · burned ${Number(t.burned ?? 0).toLocaleString("en-US")}`,
  );
  for (const z of net.zones ?? []) {
    log.info(
      `  ${z.mark ?? z.id}: ${z.miners ?? "?"} miners · ${Number(z.totalHash ?? 0).toLocaleString("en-US")} TH/s · ` +
        `${Number(z.yield100 ?? 0).toFixed(2)} ZXO/jam per 100 TH`,
    );
  }
}

export function reportWallet(rows) {
  for (const chain of CHAINS) {
    const row = rows.get(chain.id);
    if (!row) continue;
    const parts = [];
    if (row.server) {
      const s = row.server;
      parts.push(
        `server: mined ${s.mined ?? "?"} · claimed ${s.claimed ?? "?"}` +
          (s.balance !== null && s.balance !== undefined ? ` · claimable ${s.balance}` : ""),
      );
    } else {
      parts.push("server: - (tanpa cookie / tidak terbaca)");
    }
    if (row.claimedOnChain !== null && row.claimedOnChain !== undefined) {
      parts.push(`on-chain sudah diklaim: ${Number(ethers.formatUnits(row.claimedOnChain, 18)).toFixed(4)} mZXO`);
    } else {
      parts.push("on-chain: - (tanpa alamat wallet)");
    }
    if (row.server && row.server.mined != null && row.claimedOnChain !== null) {
      const pending = row.server.mined - Number(ethers.formatUnits(row.claimedOnChain, 18));
      parts.push(`perkiraan tertunda: ${pending > 0 ? pending.toFixed(4) : "0"} ZXO`);
    }
    log.info(`[${chain.mark}] ${parts.join(" | ")}`);
  }
}

export function reportResults(title, results) {
  if (!results?.length) return;
  log.info(`--- ${title} ---`);
  for (const r of results) {
    if (r.ok && r.tx) log.info(`  ${r.chain}: OK (tx ${r.tx})`);
    else if (r.ok) log.info(`  ${r.chain}: dilewati — ${r.reason ?? ""}`);
    else log.warn(`  ${r.chain}: GAGAL — ${r.reason ?? "?"}`);
  }
}
