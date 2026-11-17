// Akses on-chain: provider per chain (dengan RPC cadangan), saldo mZXO,
// pengiriman transaksi claim, dan pembacaan hub LayerZero di Base.
import { ethers } from "ethers";
import { CHAINS, CONTRACTS, HUB_ABI, MINED_ABI } from "./config.js";
import { log } from "./logger.js";

const providerCache = new Map();

/** Provider untuk satu chain; mencoba RPC cadangan sampai ada yang menjawab. */
export async function getProvider(chain) {
  if (providerCache.has(chain.id)) return providerCache.get(chain.id);
  const rpcs = chain.rpcs;
  let lastErr = null;
  for (const url of rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url, chain.chainId, { staticNetwork: true });
      await p.getBlockNumber(); // uji koneksi
      providerCache.set(chain.id, p);
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`semua RPC ${chain.id} gagal (${lastErr?.message ?? "unknown"})`);
}

export function minedContract(chain, providerOrSigner) {
  return new ethers.Contract(CONTRACTS.MINED, MINED_ABI, providerOrSigner);
}

/** Saldo mZXO on-chain (yang SUDAH diklaim) untuk satu alamat. */
export async function getClaimedBalance(chain, address) {
  const provider = await getProvider(chain);
  const c = minedContract(chain, provider);
  return await c.balanceOf(address);
}

/** Cek gas: kembalikan { ok, gwei } — ok=false bila di atas batas. */
export async function checkGas(chain, maxGwei) {
  const provider = await getProvider(chain);
  const fee = await provider.getFeeData();
  const perGas = fee.maxFeePerGas ?? fee.gasPrice;
  if (!perGas) return { ok: true, gwei: null }; // chain tanpa data fee — lanjut dgn hati-hati
  const gwei = Number(ethers.formatUnits(perGas, "gwei"));
  return { ok: gwei <= maxGwei, gwei };
}

/**
 * Kirim transaksi claim mZXO.
 * @param {object} voucher — dari POST /api/mine/voucher: { account, amountWei,
 *   cumulative, deadline, signature, contract, chainId, data? }
 * @param {object} opts — { chain, wallet, maxGwei }
 * Memakai voucher.data (calldata siap pakai dari server) bila ada; bila tidak,
 * encode claim(cumulative, deadline, signature) sendiri via ethers.
 */
export async function sendClaim(chain, voucher, { wallet, maxGwei }) {
  const provider = await getProvider(chain);
  const signer = wallet.connect(provider);
  const to = ethers.getAddress(voucher.contract ?? CONTRACTS.MINED);

  let data = voucher.data ?? null;
  if (!data) {
    const iface = new ethers.Interface(MINED_ABI);
    data = iface.encodeFunctionData("claim", [
      BigInt(voucher.cumulative),
      BigInt(voucher.deadline),
      voucher.signature,
    ]);
  }

  // Batas waktu voucher: jangan kirim bila deadline sudah lewat / mepet.
  const nowSec = Math.floor(Date.now() / 1000);
  if (BigInt(voucher.deadline) <= BigInt(nowSec + 60)) {
    throw new Error(`voucher ${chain.id} kedaluwarsa (deadline ${voucher.deadline})`);
  }

  const gas = await checkGas(chain, maxGwei);
  if (!gas.ok) {
    throw new Error(
      `gas ${chain.id} ${gas.gwei?.toFixed(2) ?? "?"} gwei > batas ${maxGwei} gwei — dilewati`,
    );
  }

  const tx = await signer.sendTransaction({ to, data });
  log.tx(`claim ${chain.id} terkirim: ${tx.hash} (${chain.explorer}/tx/${tx.hash})`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1n && receipt.status !== 1) {
    throw new Error(`claim ${chain.id} gagal on-chain (tx ${tx.hash})`);
  }
  return { hash: tx.hash, receipt };
}

/** Total omnichain tercatat di hub Base (bila hub bisa dibaca). */
export async function getHubTotal(address) {
  const base = CHAINS.find((c) => c.id === "base");
  const provider = await getProvider(base);
  const hub = new ethers.Contract(CONTRACTS.HUB_BASE, HUB_ABI, provider);
  const total = await hub.totalOf(address);
  return total;
}

/** Rekaman hub untuk satu chain (per eid LayerZero). */
export async function getHubChainBalance(address, eid) {
  const base = CHAINS.find((c) => c.id === "base");
  const provider = await getProvider(base);
  const hub = new ethers.Contract(CONTRACTS.HUB_BASE, HUB_ABI, provider);
  return await hub.chainBalanceOf(address, eid);
}
