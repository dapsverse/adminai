# AdminAI

Asisten AI untuk manajemen keuangan usaha kecil Indonesia. Catat transaksi, kelola invoice, dan terima laporan keuangan otomatis — semuanya lewat percakapan.

## Fitur

- **Chat AI** — tanya saldo, catat pemasukan/pengeluaran, buat invoice, semua via chat
- **Manajemen Transaksi** — catat income/expense dengan kategori dan deskripsi
- **Invoice** — buat dan pantau invoice outgoing (ke client) maupun incoming (dari supplier)
- **Integrasi Telegram** — chat dengan AdminAI langsung dari Telegram via bot pribadi
- **Laporan Terjadwal** — laporan keuangan harian/mingguan/bulanan otomatis via Telegram, Email, atau keduanya

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Hono v4, Node.js |
| Database | PostgreSQL + Drizzle ORM |
| AI | Google Gemini |
| Frontend | React + Vite + Tailwind CSS |
| Package Manager | pnpm workspaces |

## Struktur Project

```
adminai/
├── packages/
│   ├── backend/          # Hono API server
│   │   ├── src/
│   │   │   ├── agent/    # AI engine + tools
│   │   │   ├── db/       # Schema + migrations
│   │   │   ├── lib/      # Email, Telegram, LLM, scheduler
│   │   │   ├── middleware/
│   │   │   └── routes/
│   │   └── test/
│   └── frontend/         # React app
│       └── src/
│           ├── hooks/
│           ├── pages/
│           └── stores/
└── docker-compose.yml
```

## Setup

### Prasyarat

- Node.js 20+
- pnpm 9+
- Docker (untuk PostgreSQL)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Jalankan database

```bash
docker-compose up -d postgres postgres_test
```

### 3. Konfigurasi environment

Buat `packages/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adminai
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/adminai_test
JWT_SECRET=your-secret-key
GEMINI_API_KEY=your-gemini-api-key

# SMTP untuk pengiriman laporan via email (opsional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
EMAIL_FROM=AdminAI <reports@yourdomain.com>
```

### 4. Jalankan migrasi

```bash
pnpm --filter backend db:migrate
pnpm --filter backend db:migrate:test
```

### 5. Jalankan dev server

```bash
# Backend (port 3000)
pnpm dev:backend

# Frontend (port 5173)
pnpm dev:frontend
```

## Menjalankan Tests

```bash
pnpm test
```

103 tests, semua di backend (Vitest).

## Agent Tools

AI agent AdminAI memiliki 9 tools:

| Tool | Fungsi |
|---|---|
| `create_transaction` | Catat pemasukan atau pengeluaran |
| `get_balance` | Lihat ringkasan saldo dan arus kas |
| `list_transactions` | Tampilkan riwayat transaksi |
| `create_invoice` | Buat invoice baru |
| `list_invoices` | Lihat daftar invoice dan statusnya |
| `mark_invoice_paid` | Tandai invoice lunas |
| `schedule_report` | Jadwalkan laporan otomatis (telegram/email/both) |
| `list_reports` | Lihat semua jadwal laporan aktif |
| `delete_report` | Hapus jadwal laporan |

## Integrasi Telegram

1. Buat bot baru via [@BotFather](https://t.me/BotFather) di Telegram
2. Salin bot token
3. Dapatkan Chat ID via [@userinfobot](https://t.me/userinfobot)
4. Hubungkan di halaman **Pengaturan** aplikasi

Setelah terhubung, bisa chat dengan AdminAI langsung dari Telegram dan menjadwalkan laporan otomatis.

## Laporan Terjadwal

Jadwalkan laporan keuangan otomatis via chat:

- **Harian** — dikirim setiap hari pada jam yang ditentukan
- **Mingguan** — dikirim setiap Senin
- **Bulanan** — dikirim setiap tanggal 1

Delivery options: `telegram`, `email`, atau `both`. Semua jadwal menggunakan timezone Asia/Jakarta (WIB).

Contoh perintah via chat:
> "Jadwalkan laporan harian jam 8 pagi via email"
> "Buat laporan mingguan dikirim ke Telegram dan email"
