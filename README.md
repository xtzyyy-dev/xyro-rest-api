# Heyyarya Rest API

Platform REST API real-time di Cloudflare. Satu repo berisi UI (hitam premium), API, dan hub real-time.

- `public/` UI: halaman utama (`index.html`) dan dashboard (`dashboard.html`)
- `src/index.js` semua route API (`/api/*`)
- `src/hub.js` Durable Object: counter global, stream SSE, notifikasi real-time
- `src/data.js` daftar endpoint dan paket harga

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka http://localhost:8787

## Deploy: GitHub ke Cloudflare

Satu deploy sudah mencakup Workers (API) dan static assets (UI, pengganti Pages).

### Cara 1: Git integration (paling mudah)

1. Push repo ke GitHub.
2. Cloudflare Dashboard, **Workers & Pages**, **Create**, **Import a repository**, pilih repo ini.
3. Build command kosongkan, deploy command `npx wrangler deploy`.
4. Setiap `git push` ke `main` otomatis deploy.

### Cara 2: GitHub Actions

Workflow sudah ada di `.github/workflows/deploy.yml`. Tambahkan dua secret di GitHub
(Settings, Secrets and variables, Actions):

- `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers")
- `CLOUDFLARE_ACCOUNT_ID`

## Sebelum deploy

1. Ganti `REPO` di `public/app.js` dengan URL GitHub kamu.
2. Ubah harga di `src/data.js` sesuai kebutuhan.

## Catatan penting

- **Real-time**: stream `/api/stream` memakai SSE dari Durable Object. Angka request dihitung global, bukan per server.
- **Login dan API keys** di dashboard adalah demo (disimpan di browser). Pasang auth sungguhan sebelum menerima pelanggan.
- **Express**: Cloudflare Workers tidak menjalankan Express. Express dipakai di sisi kamu sebagai klien, lihat `examples/express.mjs`.
- **Scraper** hanya untuk halaman HTML publik dan memblokir host internal. Patuhi robots.txt dan ketentuan situs target.
- Request dari dashboard untuk polling memakai header `x-hy-internal` agar tidak menambah angka Top endpoints.

## Tambah endpoint baru

1. Tambahkan objek di `ENDPOINTS` (`src/data.js`).
2. Tambahkan handler `"GET /api/nama"` di `routes` (`src/index.js`).

Dashboard, Playground, dan Top endpoints ikut otomatis.
