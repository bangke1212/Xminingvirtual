# ZXOXO Bot — auto-claim / monitoring di VPS kamu sendiri

Bot Node.js untuk **ZXOXO Season 1** (5 chain EVM: Arbitrum, Base, Optimism,
BNB Chain, Avalanche). Bot ini membaca status mining kamu dan — bila kamu
mengaktifkannya secara eksplisit — mengklaim mZXO on-chain secara otomatis.

> **Mode default: CHECK-ONLY.** Tanpa mengubah apa pun, bot HANYA membaca
> status dan melaporkan. Tidak ada transaksi yang dikirim. Tidak ada rig yang
> dibeli. Tidak ada mining otomatis.

---

## Yang bot ini LAKUKAN dan TIDAK LAKUKAN

| Hal | Status |
|---|---|
| Baca statistik jaringan publik (miner, hashrate, yield/chain) | ✅ Selalu |
| Baca saldo mining + saldo mZXO on-chain kamu | ✅ Bila cookie + alamat wallet diisi |
| Klaim mZXO on-chain (voucher EIP-712 dari server) | ⚠️ Hanya bila `AUTO_CLAIM=true` |
| Kirim packet LayerZero ke hub Base | ⚠️ Hanya bila `AUTO_PACKET=true` (dan setelah claim) |
| **Mining / kirim proof** | ❌ **TIDAK PERNAH** (lihat alasan di bawah) |
| Beli rig / overclock / jump otomatis | ❌ **TIDAK PERNAH** |
| Posting ke X | ❌ **TIDAK PERNAH** |

### Kenapa bot TIDAK mining?

Ini penting, dan ini hasil riset langsung dari situsnya:

1. Mining ZXOXO memakai proof SHA-256 dari perangkat (`/miner-worker.js`),
   dan klien situs **mengirim flag `navigator.webdriver`** (tanda headless
   browser) + sidik perangkat ke server setiap kali mengirim proof.
2. Update situs 16 Nov 2026 menyatakan: *"Scripts, headless browsers and
   farms running many accounts from one machine are detected and flagged."*
   Akun yang ditandai harus lolos cek gambar dalam 3 hari, kalau tidak akun
   **dijeda (paused), lalu dihapus setelah 5 hari**. Pemilik rig tidak pernah
   ditandai.
3. Server juga memisahkan `botHash` dari `playerHash` di statistik jaringan.

**Kesimpulan: mining otomatis dari VPS (headless/script) sangat berisiko
membuat akun kamu ditandai, dijeda, lalu dihapus.** Mining tetap dilakukan
dengan cara normal: buka halaman `/mine` di perangkatmu sendiri dan biarkan
terbuka — rig hanya menambang saat perangkat online. Bot ini hanya mengurus
**klaim** (transaksi on-chain normal dari wallet kamu sendiri) dan pemantauan.

---

## Keamanan — baca sebelum menjalankan

- **Pakai wallet BURNER BARU.** Buat wallet EVM baru khusus untuk bot ini,
  isi saldo KECIL saja (cukup untuk gas fee claim di 5 chain). Jangan pernah
  memakai wallet utama.
- **Private key HANYA di file `.env` di VPS kamu.** Jangan kirim ke siapa
  pun — termasuk ke saya (Beacon) — jangan paste di chat, jangan commit ke
  git. File `.env` sudah masuk `.gitignore`.
- **Link wallet dulu di situs.** Buka zxoxo.xyz/mine di browser kamu,
  Connect wallet → Link (1 tanda tangan gratis). Bot tidak bisa me-link
  wallet untukmu; klaim memakai wallet yang sudah ter-link itu.
- **Batas gas.** `MAX_GAS_PRICE_GWEI` (default 10) — klaim dilewati bila gas
  di atas batas. `MIN_CLAIM_ZXO` (default 1) — klaim receh dilewati.
- **mZXO itu soulbound** (tidak bisa ditransfer/dijual). `$ZXO` belum bisa
  diklaim/diperdagangkan; konversi mZXO → $ZXO diumumkan sebelum fase
  berikutnya. Jangan berharap nilai uang hari ini.
- **Cookie sesi bisa kedaluwarsa.** Bila log bot menampilkan `401` /
  `signed_out`, salin ulang cookie dari browser dan restart bot.

---

## Setup di VPS (langkah demi langkah)

### 1. Siapkan VPS
Butuh: Linux (Ubuntu 22.04+), Node.js 18+, git. Bot ini ringan (±512 MB RAM).

```bash
node --version   # harus >= 18
```

### 2. Salin bot ke VPS
```bash
git clone https://github.com/bangke1212/Xminingvirtual.git zxoxo-bot
cd zxoxo-bot
npm install
```

### 3. Buat wallet burner + link di situs (di browser kamu, BUKAN di VPS)
1. Buat wallet EVM baru (mis. di MetaMask / Rabby — akun baru, bukan akun utama).
2. Isi saldo kecil untuk gas di tiap chain yang kamu minati (ETH di ARB/Base/OP,
   BNB di BNB Chain, AVAX di Avalanche).
3. Buka https://zxoxo.xyz/mine → **Connect wallet** → **Link** (1 tanda tangan
   gratis). Pastikan alamat wallet yang di-link SAMA dengan yang dipakai bot.
4. Pastikan kamu sudah **login dengan X** dan rig gratis 100 TH/s sudah aktif.

### 4. Isi `.env`
```bash
cp .env.example .env
nano .env
```
Isi minimal:
```ini
# Mode: biarkan false dulu untuk uji coba check-only.
AUTO_CLAIM=false
AUTO_PACKET=false

# Cookie sesi X (lihat cara ambil di bawah).
ZXO_COOKIE=...

# Wallet burner (alamat publik + private key).
WALLET_ADDRESS=0x...
WALLET_PRIVATE_KEY=0x...

# Batas keamanan (sesuaikan bila perlu).
MIN_CLAIM_ZXO=1
MAX_GAS_PRICE_GWEI=10
CHECK_INTERVAL_MINUTES=60
```
Lindungi file-nya:
```bash
chmod 600 .env
```

#### Cara mengambil `ZXO_COOKIE` (dari browser kamu sendiri)
1. Buka https://zxoxo.xyz/mine — pastikan sudah login dengan X.
2. Tekan **F12** → tab **Network** → muat ulang halaman (F5).
3. Klik salah satu request ke `/api/mine/state` → bagian **Request Headers**.
4. Salin **seluruh nilai** header `Cookie:` ke `ZXO_COOKIE` (satu baris panjang).
5. Bila bot mencatat `401 / signed_out`, ulangi langkah ini (cookie kedaluwarsa).

### 5. Uji dulu (tanpa transaksi)
```bash
npm run selftest   # cek API publik + RPC + kontrak (tanpa kredensial)
npm run check      # validasi .env + konektivitas + sesi
npm run once       # satu siklus check-only, lalu berhenti
```
Periksa log di `logs/` — pastikan status akun dan saldo terbaca dengan benar
sebelum mengaktifkan auto-claim.

### 6. Aktifkan auto-claim (bila sudah yakin)
```ini
AUTO_CLAIM=true
```
Lalu jalankan ulang `npm run once` dan periksa log: bot hanya klaim bila
mZXO tertunda ≥ `MIN_CLAIM_ZXO` dan gas ≤ batas. Setelah yakin, jalankan
sebagai service (langkah 7).

> `AUTO_PACKET=true` hanya bila kamu juga mau packet LayerZero dikirim
> otomatis setelah claim. Perhatian: alamat gateway per-chain **belum
> terverifikasi** dari sumber publik (lihat RESEARCH.md) — bot hanya mengirim
> packet bila API situs menyediakan alamat gateway + kuota fee; bila tidak
> ada, packet dilewati dengan peringatan. Base tidak butuh packet.

### 7. Jalankan sebagai service (systemd)
```bash
sudo cp zxoxo-bot.service /etc/systemd/system/zxoxo-bot.service
sudo nano /etc/systemd/system/zxoxo-bot.service   # sesuaikan User + WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable zxoxo-bot
sudo systemctl start zxoxo-bot
sudo systemctl status zxoxo-bot
sudo journalctl -u zxoxo-bot -f   # lihat log live
```
Log harian bot juga tersimpan di `logs/zxoxo-bot-YYYY-MM-DD.log`.

> **Service vs terminal:** service jalan tanpa TTY, jadi log di `journalctl`
> otomatis berupa baris biasa (tanpa kode warna/ANSI). Dashboard terminal
> yang dipercantik hanya muncul bila kamu menjalankan bot langsung di
> terminal/SSH — lihat bagian di bawah.

---

## Dashboard terminal (saat jalan di terminal / SSH)

Bila kamu menjalankan bot langsung di terminal (mis. `npm start` lewat SSH),
bot menampilkan **dashboard live** yang diperbarui berkala, bukan sekadar
baris log:

- **Header** — nama bot, mode (CHECK-ONLY / AUTO-CLAIM), uptime, jam, status.
- **Statistik jaringan** — miners, ZXO mined, hashrate pemain, burned, dan
  yield per chain (ZXO/jam per 100 TH).
- **Tabel per-chain** — mined (server), sudah diklaim (on-chain), claimable,
  dan status (tertunda / ok).
- **Panel wallet** — alamat terpotong, ada/tidaknya cookie, ambang klaim,
  batas gas, interval.
- **Hasil terakhir** — klaim/packet terakhir (OK / dilewati / gagal).
- **Log terakhir** — beberapa baris log terbaru.
- **Footer** — jadwal siklus berikut, lokasi log, dan alamat dashboard web
  bila aktif.

Berhenti dengan `Ctrl+C` — layar dibersihkan dan bot keluar dengan rapi.

**Mode log biasa dipaksa dengan env (bila kamu tidak mau dashboard):**

```bash
LOG_PLAIN=true npm start        # atau
TERMINAL_UI=false npm start
```

Sebagai service (systemd), bot otomatis memakai log baris biasa — file
`zxoxo-bot.service` juga sudah mengatur `TERMINAL_UI=false`, jadi tidak ada
escape sequence ANSI yang masuk ke journal log.

## Dashboard web (halaman status + API)

Nyalakan dengan:

```bash
WEB_DASHBOARD=true npm start
# atau: npm run dashboard
```

Lalu buka di browser: **http://127.0.0.1:8787** (di VPS yang sama).
Dari laptop kamu, pakai SSH tunnel:

```bash
ssh -L 8787:127.0.0.1:8787 user@vps-kamu
```

lalu buka http://127.0.0.1:8787 di browser laptop.

Halaman menampilkan data yang sama seperti dashboard terminal (statistik,
tabel per-chain, wallet, hasil terakhir, log terakhir) dan refresh otomatis
tiap 5 detik. Endpoint JSON tersedia di **/api/status**.

**Keamanan dashboard web:**
- Bind default `127.0.0.1` — hanya bisa diakses dari VPS itu sendiri
  (atau lewat SSH tunnel). Jangan ubah `WEB_HOST` ke `0.0.0.0` kecuali kamu
  membatasi akses dengan firewall.
- Yang ditampilkan hanya status publik + alamat wallet **terpotong**.
  Cookie sesi (`ZXO_COOKIE`) dan private key **tidak pernah** dikirim ke
  halaman atau endpoint mana pun.
- Port bisa diubah lewat `WEB_PORT` di `.env` (default 8787).

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Jalan terus (cek tiap `CHECK_INTERVAL_MINUTES`); dashboard terminal bila di TTY |
| `npm run dashboard` | Sama seperti `npm start`, tapi dashboard web juga aktif (`WEB_DASHBOARD=true`) |
| `npm run once` | Satu siklus lalu berhenti (log baris biasa) |
| `npm run check` | Validasi config + konektivitas + sesi |
| `npm run selftest` | Tes publik tanpa kredensial (API/RPC/kontrak) |

---

## Cara kerja klaim (singkat)

1. Bot meminta **voucher** ke server: `POST /api/mine/voucher { chain }`.
   Voucher berisi total kumulatif mining kamu (`cumulative`), `deadline`, dan
   tanda tangan EIP-712 server — terikat ke wallet + chain + kontrak kamu.
2. Bot memverifikasi `voucher.account` sama dengan wallet bot.
3. Bot menghitung yang tertunda = `cumulative − balanceOf(wallet)` on-chain.
   Bila di bawah ambang → dilewati.
4. Bot mengirim `claim(cumulative, deadline, signature)` ke kontrak mZXO
   (`0x61A9…3c4C`, sama di 5 chain) — hanya network fee, tanpa pembayaran lain.
5. Bot menunggu 1 konfirmasi dan memeriksa saldo sesudahnya.

Detail riset (endpoint, kontrak, batasan, asumsi): lihat **RESEARCH.md**.

---

## Batasan yang diketahui

- **Mining tidak otomatis** (alasan anti-bot di atas). Rig hanya menambang saat
  halaman `/mine` terbuka di perangkatmu.
- **Cookie sesi X rapuh**: bisa kedaluwarsa sewaktu-waktu; bot tidak bisa
  login ulang sendiri (login X butuh browser + interaksi manusia). Perbarui
  manual bila log menunjukkan 401.
- **Bentuk respons `/api/mine/chain` dan `/api/mine/packets` belum
  terverifikasi** (butuh sesi login untuk melihatnya). Bot membaca secara
  defensif dan mencatat peringatan bila bentuknya tidak dikenali — laporkan
  ke pengembang bila itu terjadi.
- **Alamat gateway LayerZero per-chain belum terverifikasi** dari sumber
  publik; packet otomatis hanya jalan bila API menyediakannya.
- **Alamat hub Base** (`0x9760…d400`) berasal dari contoh `cast` di docs dan
  sudah lolos `totalOf(0x0)` di selftest, tapi fungsi `record` di Base belum
  diuji — Base dilewati untuk packet.
- **Tidak ada daily check-in** di ZXOXO — tidak ada yang perlu di-claim harian
  selain mZXO hasil mining.
- Snapshot early miner sudah dibekukan; omnichain record terkunci sampai
  30 Nov 2026.

---

## Lisensi

Kode bot ini untuk pemakaian pribadi Ariel. Bukan produk resmi ZXOXO.
Gunakan dengan risiko sendiri; jangan pernah mempertaruhkan dana utama.
