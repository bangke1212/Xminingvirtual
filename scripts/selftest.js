// Self-test publik — TIDAK butuh kredensial apa pun.
// Memeriksa: API publik situs, RPC tiap chain, keberadaan kode kontrak
// (mZXO + RigStore) di kelima chain, dan pembacaan hub Base.
//   node scripts/selftest.js   (exit 0 = lolos, 1 = ada yang gagal)
import { ethers } from "ethers";
import { CHAINS, CONTRACTS, HUB_ABI } from "../src/config.js";
import { zxoxoApi } from "../src/api.js";

let failures = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`  GAGAL ${m}`);
};

console.log("== 1) API publik zxoxo.xyz ==");
for (const [name, fn, check] of [
  ["GET /api/chain/market", () => zxoxoApi.getMarket(), (j) => j.ok && j.chains?.length === 5],
  ["GET /api/mine/state", () => zxoxoApi.getState(), (j) => j.ok && j.net?.zones?.length === 5],
  ["GET /api/chain/activity", () => zxoxoApi.getActivity(), (j) => j.ok && Array.isArray(j.activity)],
  ["GET /api/live", () => zxoxoApi.getLive(), (j) => j.ok && Array.isArray(j.people)],
]) {
  try {
    const j = await fn();
    if (check(j)) ok(`${name} (bentuk respons sesuai)`);
    else bad(`${name} (bentuk respons berubah!)`);
  } catch (e) {
    bad(`${name}: ${e.message}`);
  }
}

console.log("== 2) RPC + kontrak per chain ==");
for (const chain of CHAINS) {
  try {
    let provider = null;
    let lastErr = null;
    for (const url of chain.rpcs) {
      try {
        const p = new ethers.JsonRpcProvider(url, chain.chainId, { staticNetwork: true });
        await p.getBlockNumber();
        provider = p;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!provider) throw lastErr ?? new Error("semua RPC gagal");
    const codeMined = await provider.getCode(CONTRACTS.MINED);
    const codeStore = await provider.getCode(CONTRACTS.RIG_STORE);
    const bal0 = await new ethers.Contract(CONTRACTS.MINED, ["function balanceOf(address) view returns (uint256)"], provider).balanceOf(ethers.ZeroAddress);
    if (codeMined === "0x") throw new Error("mZXO tidak ada kode di chain ini");
    if (codeStore === "0x") throw new Error("RigStore tidak ada kode di chain ini");
    if (bal0 !== 0n) throw new Error("balanceOf(0x0) bukan 0 — alamat mZXO mencurigakan");
    ok(`${chain.id}: RPC ok, mZXO + RigStore ada, balanceOf(0x0)=0`);
  } catch (e) {
    bad(`${chain.id}: ${e.message}`);
  }
}

console.log("== 3) Hub Base (alamat dari docs) ==");
try {
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true });
  const hub = new ethers.Contract(CONTRACTS.HUB_BASE, HUB_ABI, provider);
  const total = await hub.totalOf(ethers.ZeroAddress);
  const arb = await hub.chainBalanceOf(ethers.ZeroAddress, 30110);
  ok(`hub totalOf(0x0)=${total}, chainBalanceOf(0x0, ARB)=${arb}`);
} catch (e) {
  bad(`hub Base: ${e.message}`);
}

console.log(failures === 0 ? "\nSELFTEST LOLOS" : `\nSELFTEST GAGAL (${failures} masalah)`);
process.exit(failures === 0 ? 0 : 1);
