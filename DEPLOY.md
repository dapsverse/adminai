# Deploy AdminAI ke Production

Stack: **Neon** (PostgreSQL) + **Render** (Backend) + **Vercel** (Frontend) + **UptimeRobot** (Keep-alive)

---

## Step 1 — Setup Database di Neon

1. Buka https://neon.tech dan buat akun (gratis)
2. Klik **New Project**
   - Project name: `adminai`
   - Region: **AWS Singapore** (paling dekat ke Indonesia)
   - Klik **Create Project**
3. Setelah project dibuat, buka tab **Connection Details**
4. Pastikan dropdown pilihan ada di **Direct connection** (bukan Pooled)
5. Copy **Connection string** — formatnya:
   ```
   postgresql://neondb_owner:xxxx@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   > Simpan string ini, akan dipakai di Step 2 dan Step 4.

6. **Jalankan migrasi database dari lokal:**
   ```bash
   DATABASE_URL="postgresql://neondb_owner:xxxx@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
   pnpm --filter backend db:migrate
   ```
   Output yang diharapkan: `Migrations applied successfully` (atau pesan sukses serupa)

---

## Step 2 — Deploy Backend ke Render

1. Buka https://render.com dan buat akun (gratis)
2. Klik **New +** → **Web Service**
3. Pilih **Build and deploy from a Git repository** → Connect GitHub
4. Pilih repo `dapsverse/adminai` → klik **Connect**
5. Isi konfigurasi:

   | Field | Value |
   |-------|-------|
   | **Name** | `adminai-backend` |
   | **Region** | Singapore |
   | **Branch** | `main` |
   | **Root Directory** | *(kosongkan)* |
   | **Runtime** | Node |
   | **Build Command** | `pnpm install` |
   | **Start Command** | `pnpm --filter backend start` |
   | **Instance Type** | Free |

6. Scroll ke bawah ke bagian **Environment Variables**, tambahkan:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Connection string Neon dari Step 1 |
   | `JWT_SECRET` | String random 32 karakter (generate di https://generate-secret.vercel.app/32) |
   | `GROQ_API_KEY` | API key Groq kamu |
   | `WEBHOOK_BASE_URL` | `https://adminai-backend.onrender.com` (URL backend Render ini sendiri) |
   | `GOOGLE_CLIENT_ID` | Client ID dari Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | Client Secret dari Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | `https://adminai-backend.onrender.com/auth/google/callback` |
   | `FRONTEND_URL` | URL Vercel frontend kamu, misal: `https://adminai-xxxx.vercel.app` |
   | `NODE_ENV` | `production` |

   > **Catatan:** `FRONTEND_URL` dipakai untuk redirect setelah user approve Gmail OAuth.
   > Isi dulu dengan URL Vercel setelah Step 4 selesai, lalu update di Render → Environment.

   > Untuk SMTP (laporan via email), tambahkan juga:
   > `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

7. Klik **Create Web Service**
8. Tunggu deploy selesai (biasanya 2-5 menit). Status akan berubah dari `Building` → `Live`
9. **Catat URL backend** yang muncul di bagian atas — formatnya:
   ```
   https://adminai-backend.onrender.com
   ```
   > Jika nama service sudah dipakai orang lain, Render akan tambahkan suffix random seperti `adminai-backend-abc1`.

10. Test backend berjalan dengan buka URL ini di browser:
    ```
    https://adminai-backend.onrender.com/health
    ```
    Harus muncul: `{"ok":true}`

---

## Step 3 — Authorize Redirect URI Production di Google Cloud Console

> Langkah ini wajib agar fitur "Connect Gmail" berfungsi di production.

1. Buka https://console.cloud.google.com dan masuk ke project yang dipakai
2. Navigasi ke **APIs & Services** → **Credentials**
3. Klik nama OAuth 2.0 Client ID yang kamu buat sebelumnya
4. Di bagian **Authorized redirect URIs**, klik **Add URI**
5. Tambahkan:
   ```
   https://adminai-backend.onrender.com/auth/google/callback
   ```
   > Ganti `adminai-backend` dengan nama service Render kamu jika berbeda.
6. Klik **Save**

---

## Step 4 — Update URL Backend di Frontend

1. Buka file `packages/frontend/vercel.json` di repo lokal
2. Ganti URL backend dengan URL backend dari Step 2 (tanpa `https://`):
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://adminai-backend.onrender.com/:path*"
       }
     ]
   }
   ```
3. Commit dan push:
   ```bash
   git add packages/frontend/vercel.json
   git commit -m "chore: set render backend url for vercel proxy"
   git push origin main
   ```

---

## Step 5 — Deploy Frontend ke Vercel

1. Buka https://vercel.com dan buat akun (gratis, login via GitHub)
2. Klik **Add New...** → **Project**
3. Import repo `dapsverse/adminai` dari GitHub
4. Vercel akan mendeteksi otomatis. Pastikan konfigurasi ini:

   | Field | Value |
   |-------|-------|
   | **Framework Preset** | Vite |
   | **Root Directory** | `packages/frontend` |
   | **Build Command** | `pnpm build` |
   | **Output Directory** | `dist` |
   | **Install Command** | `pnpm install` |

   > Klik **Edit** di Root Directory dan ketik `packages/frontend`

5. Tidak perlu tambah environment variable apapun
6. Klik **Deploy**
7. Tunggu deploy selesai (~1-2 menit)
8. Vercel akan kasih URL seperti `https://adminai-xxxx.vercel.app`
9. **Test full flow:**
   - Buka URL Vercel → halaman login harus muncul
   - Register akun baru
   - Masuk ke halaman chat → pesan sambutan AdminAI harus tampil

---

## Step 6 — Setup UptimeRobot (Keep-alive Render)

> Render free tier mematikan server setelah 15 menit idle. UptimeRobot akan ping setiap 5 menit agar server tidak pernah tidur.

1. Buka https://uptimerobot.com dan buat akun (gratis)
2. Klik **Add New Monitor**
3. Isi konfigurasi:

   | Field | Value |
   |-------|-------|
   | **Monitor Type** | HTTP(S) |
   | **Friendly Name** | `AdminAI Backend` |
   | **URL** | `https://adminai-backend.onrender.com/health` |
   | **Monitoring Interval** | `5 minutes` |

4. Klik **Create Monitor**
5. Status akan berubah menjadi **Up** (hijau) dalam beberapa menit

> Setelah ini backend tidak akan pernah sleep, sehingga laporan terjadwal (cron jobs) akan selalu berjalan tepat waktu.

---

## Selesai

| Layer | URL |
|-------|-----|
| Frontend | `https://adminai-xxxx.vercel.app` |
| Backend | `https://adminai-backend.onrender.com` |
| Database | Neon Dashboard: https://console.neon.tech |

### Auto-deploy

Setiap kali push ke branch `main`:
- **Vercel** otomatis redeploy frontend
- **Render** otomatis redeploy backend

### Menambahkan custom domain (opsional)

- Vercel: Settings → Domains → Add domain
- Render: Settings → Custom Domains → Add custom domain
