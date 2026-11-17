# RESEARCH.md — hasil riset ZXOXO (17 Nov 2026, ~23:20 WIB)

Riset dilakukan terhadap situs publik https://zxoxo.xyz (halaman + bundle JS
Next.js + endpoint API + panggilan RPC on-chain). Tanpa login ke akun apa pun,
tanpa transaksi.

---

## 1. Yang TERKONFIRMASI

### 1.1 Status proyek
- Season 1 **live di mainnet**, 5 chain EVM: Arbitrum (42161), Base (8453),
  Optimism (10), BNB Chain (56), Avalanche (43114). Teks "COMING SOON ON
  LAYERZERO" di beranda sudah kedaluwarsa.
- Statistik saat cek: ~7.475 miners, ~4,11 juta ZXO mined, ~2.095 rig on-chain,
  hashrate pemain ~3,37 juta TH/s, emisi 2.000 ZXO/jam per chain.
- mZXO (hasil mining on-chain) **soulbound**: tidak bisa ditransfer/dijual.
  `$ZXO` belum bisa diklaim/diperdagangkan ("mZXO becomes $ZXO at a ratio
  announced before the next phase").
- Snapshot early miner **sudah dibekukan** (maks 5.000). Omnichain record
  terkunci sampai **30 Nov 2026**. Tidak ada daily check-in / daily task.

### 1.2 Endpoint API (diuji langsung)
| Endpoint | Auth | Hasil |
|---|---|---|
| `GET /api/chain/market` | publik | 200 — harga rig live per chain + tier (wei) |
| `GET /api/mine/state` | publik* | 200 — `signedIn:false` + `net` (zones: playerHash, **botHash**, totalHash, yield100, miners; totals; leaders) |
| `GET /api/chain/activity` | publik | 200 — pembelian rig terbaru (handle, chain, hashrate, tx) |
| `GET /api/live` | publik | 200 — orang online (handle, signal) |
| `GET /api/mine/chain` | cookie | **401** tanpa sesi |
| `GET /api/mine/blocks` | cookie | **401** tanpa sesi |
| `GET /api/mine/early` | cookie | **401** tanpa sesi |
| `GET /api/mine/packets` | cookie | **401** tanpa sesi |
| `GET /api/mine/voucher` | — | **405** (POST saja) |
| `POST /api/mine/voucher {chain}` | cookie | bentuk dari kode klien (lihat 1.4) |
| `POST /api/mine/act {type,...}` | cookie | type: `start`, `claim`, `jump`, `overclock` (dari kode klien) |
| `POST /api/mine/sync {chain}` | cookie | sinkronisasi pembelian rig on-chain |
| `GET/POST /api/mine/check` | cookie | cek gambar manusia (`{token, image}` / `{token, answer}`) |
| `GET /api/wallet/link?address=` | — | `{message, token}` lalu `personal_sign`, lalu `POST /api/wallet/link {address, token, signature}` |
| `POST /api/pulse {v, p, bg}` | — | heartbeat kehadiran tiap 60 dtk (id pengunjung `zx_v` di localStorage) |
| `GET /api/auth/x/start?returnTo=%2Fmine` | — | awal login X (OAuth redirect di browser) |

\* `/api/mine/state` tanpa cookie tetap 200 (mode publik).

### 1.3 Kontrak (diverifikasi via RPC publik)
| Kontrak | Alamat (sama di 5 chain) | Verifikasi |
|---|---|---|
| ZxoMined (mZXO) | `0x61A9714862200409828286df635d06C1BcCf3c4C` | Bytecode identik Base + Arbitrum; `balanceOf(0x0)=0` |
| ZxoRigStore | `0x974eeB1a581b0083F4FECb26139113CCA531099e` | Bytecode identik Base + Arbitrum; `tierCount()=5`; `owner()=0x443e…395e9` |
| Owner RigStore | `0x443e8183C38aC58a27490E8fabe031b0342395e9` | EOA (tanpa kode) |
| ZxoPacketHub (Base) | `0x9760c50dd855f5E2C22313211a5fE7a97b47d400` | Dari contoh `cast` di docs; `totalOf(0x0)=0` lolos di selftest |

Fungsi klaim (dari docs + kode klien):
- EIP-712 domain: `{ name: "ZXOXO Mined", version: "1", chainId, verifyingContract }`
- Type: `Claim(address account, uint256 cumulative, uint256 deadline)`
- Kontrak: `claim(uint256 cumulative, uint256 deadline, bytes signature)`
  (selector `0x5eddd157` dari peta selector di bundle JS). Voucher membawa
  total kumulatif seumur hidup; kontrak hanya mencetak selisihnya (tanpa
  double-claim). Klien memakai `voucher.data` (calldata siap pakai) bila ada,
  kalau tidak ia encode sendiri.
- RigStore: `quote(uint8 tier)`, `buy(uint8 tier, uint32 usdCents, uint32
  hashrate) payable`, event `RigPurchased`. Tier: SPARK $0,50/150 TH/s …
  TITAN $10/4.200 TH/s. Harga dibayar dengan coin chain itu (kurs Chainlink).
- Gateway packet: `send() external payable` (dari docs); hub Base eid 30184;
  gateway eid ARB 30110, OP 30111, BNB 30102, AVAX 30106. Verifier 2 dari 2
  (LayerZero Labs + Horizen). Fee ±$0,24–0,26/packet; Base 0 (gas saja).
- RPC publik (dari konfigurasi situs): `arb1.arbitrum.io/rpc`,
  `mainnet.base.org`, `mainnet.optimism.io`, `bsc-rpc.publicnode.com`,
  `avalanche-c-chain-rpc.publicnode.com` (+ cadangan drpc/1rpc).

### 1.4 Mekanisme mining (dari `/miner-worker.js` + bundle)
- Proof: cari `nonce` sehingga `sha256("${work}:${nonce}")` punya `bits`
  leading zero bits. `work` + `bits` didapat dari `GET /api/mine/proof`
  (balasan `{token, work, bits}`), lalu `POST /api/mine/proof
  {token, nonce, device: {cores, mem, hps, mobile, wd}}`.
- `wd` = `navigator.webdriver` (tanda headless browser) — **dikirim eksplisit
  ke server bersama sidik perangkat** (cores, mem, hps, mobile).
- Worker hanya jalan saat halaman terlihat + wake lock layar.
- ~1 proof/menit, ~25% satu core; rig hanya menambang saat perangkat online
  (berhenti ±2 menit setelah halaman ditutup).
- Blok: 1 blok/10 menit per chain, pemenang diundi dari hashrate yang online;
  100 mZXO/blok; 1 dari 10 blok khusus free miner (50 mZXO); bonus blok tiap
  2 jam membayar coin chain itu.

### 1.5 Anti-otomatisasi (alasan bot TIDAK mining)
- Update situs 16 Nov 2026: *"Scripts, headless browsers and farms running
  many accounts from one machine are detected and flagged."* + *"We audited
  the mining. Every account, every device, every claim."*
- Akun yang ditandai mendapat cek gambar (`/api/mine/check`) — lolos dalam
  3 hari atau akun **dijeda, lalu dihapus setelah 5 hari**. Pemilik rig tidak
  pernah ditandai.
- Statistik jaringan memisahkan `botHash` dari `playerHash` (saat cek:
  `botHash: 0` di semua chain).
- **Implikasi: proof mining otomatis dari VPS hampir pasti terdeteksi dan
  berisiko menghapus akun.** Karena itu bot ini TIDAK mengimplementasikan
  proof mining sama sekali — hanya klaim on-chain (transaksi normal wallet
  sendiri) + pemantauan.

---

## 2. Yang BELUM terverifikasi / masih asumsi

1. **Nama cookie sesi X.** Cookie diset server saat callback OAuth; namanya
   tidak terlihat di kode klien. Bot memakai SELURUH string header `Cookie`
   dari `.env` (disalin dari DevTools), jadi nama persisnya tidak diperlukan.
   Masa berlaku cookie juga tidak diketahui — asumsi: bisa kedaluwarsa
   sewaktu-waktu (bot mencatat 401 bila terjadi).
2. **Bentuk respons `/api/mine/chain`.** Hanya bisa dilihat dengan sesi login.
   Bot membaca defensif (`extractChainRows`) dan mencatat peringatan bila
   bentuknya tidak dikenali. Saldo server per-chain mungkin memakai nama field
   lain dari yang ditebak (`mined`/`claimed`/`balance`).
3. **Bentuk respons `/api/mine/packets` + alamat gateway per-chain.**
   Alamat gateway TIDAK ada di bundle JS maupun docs (hanya hub + eid).
   Kemungkinan disediakan API saat login. Bot hanya mengirim packet bila API
   memberi alamat gateway + fee; bila tidak, packet dilewati. **Tidak ada
   tebakan alamat.**
4. **Fungsi `record` hub di Base** ("Record here"). Tanda tangan fungsinya
   belum terverifikasi → Base dilewati untuk packet.
5. **Bentuk persis voucher.** Disimpulkan dari kode klien:
   `{account, amountWei, cumulative, deadline, signature, contract, chainId,
   data?}`. Field `data` (calldata siap pakai) bersifat opsional — bot
   memakainya bila ada, kalau tidak encode `claim(...)` sendiri.
6. **Fungsi view `claimed(address)`** di ZxoMined belum dikonfirmasi — bot
   memakai `balanceOf` sebagai proksi "sudah diklaim" dan `cumulative`
   voucher sebagai total. Ini benar selama tidak ada mint lain ke alamat itu
   (sesuai docs: hanya voucher yang bisa mint).
7. **Apakah klaim otomatis dari VPS melanggar aturan situs?** Docs tidak
   melarang klaim via API + wallet sendiri secara eksplisit (klaim adalah
   transaksi on-chain normal; voucher terikat wallet). Yang dilarang/dideteksi
   adalah **mining** otomatis (proof palsu/headless). Risiko residual tetap
   ada (mis. pola request API yang tidak wajar) — karena itu interval default
   60 menit dan bot tidak pernah mengirim pulse/proof.

---

## 3. File riset mentah (sementara, di /tmp — bukan bagian repo)

- `/tmp/zxoxo-research/` — HTML halaman, bundle JS Next.js, `miner-worker.js`,
  dan hasil grepping endpoint/kontrak. Boleh dihapus; semua temuan penting
  sudah dirangkum di sini.
