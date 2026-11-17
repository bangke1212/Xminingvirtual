// Konfigurasi bot: rantai, kontrak, dan pembacaan .env.
// Semua alamat kontrak di bawah ini TERVERIFIKASI on-chain (Base + Arbitrum,
// 17 Nov 2026): bytecode identik di kedua chain; RigStore tierCount()=5.
// Alamat mZXO ditemukan lengkap di HTML halaman /docs situs (0x61A9...3c4C).
// Alamat hub Base berasal dari contoh `cast call` di docs/layerzero
// (BELUM diverifikasi independen — lihat RESEARCH.md).

export const SITE = "https://zxoxo.xyz";

export const CHAINS = [
  {
    id: "arbitrum",
    name: "Arbitrum",
    mark: "ARB",
    chainId: 42161,
    native: "ETH",
    explorer: "https://arbiscan.io",
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.drpc.org",
      "https://1rpc.io/arb",
    ],
    lzEid: 30110,
  },
  {
    id: "base",
    name: "Base",
    mark: "BASE",
    chainId: 8453,
    native: "ETH",
    explorer: "https://basescan.org",
    rpcs: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://1rpc.io/base",
      "https://base.drpc.org",
    ],
    lzEid: 30184,
  },
  {
    id: "optimism",
    name: "Optimism",
    mark: "OP",
    chainId: 10,
    native: "ETH",
    explorer: "https://optimistic.etherscan.io",
    rpcs: [
      "https://mainnet.optimism.io",
      "https://optimism.drpc.org",
      "https://1rpc.io/op",
    ],
    lzEid: 30111,
  },
  {
    id: "bnb",
    name: "BNB Chain",
    mark: "BNB",
    chainId: 56,
    native: "BNB",
    explorer: "https://bscscan.com",
    rpcs: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc-dataseed.bnbchain.org",
      "https://1rpc.io/bnb",
    ],
    lzEid: 30102,
  },
  {
    id: "avalanche",
    name: "Avalanche",
    mark: "AVAX",
    chainId: 43114,
    native: "AVAX",
    explorer: "https://snowtrace.io",
    rpcs: [
      "https://avalanche-c-chain-rpc.publicnode.com",
      "https://api.avax.network/ext/bc/C/rpc",
      "https://1rpc.io/avax/c",
      "https://avalanche.drpc.org",
    ],
    lzEid: 30106,
  },
];

// Kontrak — alamat SAMA di kelima chain (dokumen situs: "Same addresses").
export const CONTRACTS = {
  // ZxoMined (mZXO, soulbound). Terverifikasi: bytecode identik Base+Arbitrum.
  MINED: "0x61A9714862200409828286df635d06C1BcCf3c4C",
  // ZxoRigStore. Terverifikasi: tierCount()=5, owner()=0x443e...395e9 (Base).
  RIG_STORE: "0x974eeB1a581b0083F4FECb26139113CCA531099e",
  // ZxoPacketHub di Base (dari docs; belum diverifikasi independen).
  HUB_BASE: "0x9760c50dd855f5E2C22313211a5fE7a97b47d400",
  // Owner kontrak RigStore (EOA). Bukan alamat kontrak — jangan dipakai sbg tujuan tx.
  OWNER: "0x443e8183C38aC58a27490E8fabe031b0342395e9",
};

export const MINED_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function claim(uint256 cumulative, uint256 deadline, bytes signature)",
];

export const HUB_ABI = [
  "function totalOf(address account) view returns (uint256)",
  "function chainBalanceOf(address account, uint32 eid) view returns (uint256)",
];

function envBool(name, fallback = false) {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

function envNum(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Baca + validasi konfigurasi dari process.env. */
export function loadConfig() {
  const cfg = {
    autoClaim: envBool("AUTO_CLAIM", false),
    autoPacket: envBool("AUTO_PACKET", false),
    cookie: (process.env.ZXO_COOKIE ?? "").trim(),
    walletAddress: (process.env.WALLET_ADDRESS ?? "").trim(),
    walletPrivateKey: (process.env.WALLET_PRIVATE_KEY ?? "").trim(),
    minClaimZxo: envNum("MIN_CLAIM_ZXO", 1),
    maxGasPriceGwei: envNum("MAX_GAS_PRICE_GWEI", 10),
    packetFeeMarginPercent: envNum("PACKET_FEE_MARGIN_PERCENT", 10),
    checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES ?? 60),
    logDir: (process.env.LOG_DIR ?? "logs").trim(),
    // Dashboard terminal: aktif otomatis bila stdout adalah TTY.
    // LOG_PLAIN=true atau TERMINAL_UI=false memaksa log baris biasa.
    terminalUI: envBool("TERMINAL_UI", true),
    plainLogs: envBool("LOG_PLAIN", false),
    // Dashboard web (server HTTP built-in): aktif hanya bila true.
    webDashboard: envBool("WEB_DASHBOARD", false),
    webPort: envNum("WEB_PORT", 8787),
    webHost: (process.env.WEB_HOST ?? "127.0.0.1").trim(),
    rpcOverrides: {},
  };
  for (const c of CHAINS) {
    const key = `ZXO_RPC_${c.id.toUpperCase()}`;
    if ((process.env[key] ?? "").trim()) cfg.rpcOverrides[c.id] = process.env[key].trim();
  }

  const errors = [];
  if (cfg.autoPacket && !cfg.autoClaim) {
    errors.push("AUTO_PACKET=true butuh AUTO_CLAIM=true (packet hanya dikirim setelah claim).");
  }
  if (cfg.autoClaim) {
    if (!cfg.walletPrivateKey) errors.push("AUTO_CLAIM=true butuh WALLET_PRIVATE_KEY di .env.");
    if (!cfg.cookie) errors.push("AUTO_CLAIM=true butuh ZXO_COOKIE di .env (voucher diambil dari server).");
    if (!cfg.walletAddress && !cfg.walletPrivateKey) {
      errors.push("AUTO_CLAIM=true butuh WALLET_ADDRESS (atau WALLET_PRIVATE_KEY).");
    }
  }
  if (cfg.walletPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(cfg.walletPrivateKey)) {
    errors.push("WALLET_PRIVATE_KEY tidak valid (harus 0x + 64 karakter hex).");
  }
  if (cfg.walletAddress && !/^0x[0-9a-fA-F]{40}$/.test(cfg.walletAddress)) {
    errors.push("WALLET_ADDRESS tidak valid (harus 0x + 40 karakter hex).");
  }
  if (cfg.checkIntervalMinutes < 0 || !Number.isFinite(cfg.checkIntervalMinutes)) {
    errors.push("CHECK_INTERVAL_MINUTES harus angka >= 0.");
  }
  return { cfg, errors };
}
