# AdminAI — Design Spec
**Date:** 2026-06-11  
**Status:** Approved

---

## Overview

AdminAI adalah AI agent berbasis chat untuk membantu usaha kecil (UMKM) mengelola keuangan dan invoice secara otomatis. User berinteraksi melalui web chatbox atau Telegram. Agent dapat terhubung ke email user untuk auto-detect transaksi dan invoice masuk.

**MVP Scope:** Keuangan (catat pemasukan/pengeluaran, ringkasan saldo) + Invoice (buat, kirim, track status). Stock management masuk fase 2.

---

## Tech Stack

| Layer | Pilihan |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Backend | Hono (TypeScript) |
| Queue & Cron | BullMQ + Redis |
| Database | PostgreSQL |
| LLM | Gemini (MVP) → OpenRouter (production) |
| Telegram | Telegram Bot API (webhook) |
| Email | Gmail API + Microsoft Graph (OAuth) |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────┐
│                    User Channels                     │
│   [Web Chatbox]              [Telegram Bot]          │
└────────┬─────────────────────────┬───────────────────┘
         │                         │ webhook
         ▼                         ▼
┌─────────────────────────────────────────────────────┐
│              Hono Backend (TypeScript)               │
│                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────┐ │
│  │  Agent      │   │  REST API    │   │ Webhook  │ │
│  │  Engine     │   │  (auth, data)│   │ Handler  │ │
│  └──────┬──────┘   └──────────────┘   └──────────┘ │
│         │                                           │
│  ┌──────┴──────────────────────────────────────┐   │
│  │  Tool Registry (keuangan, invoice, email...) │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────┐   ┌─────────────────────────────┐ │
│  │  BullMQ      │   │  Onboarding State Machine   │ │
│  │  (cron/queue)│   │  (step-based, resumable)    │ │
│  └──────────────┘   └─────────────────────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    [PostgreSQL]     [Redis]    [Gmail/Outlook OAuth]
```

**Prinsip utama:**
- Agent Engine adalah satu entry point — tidak peduli pesan datang dari web atau Telegram
- Onboarding State Machine terpisah dari agent conversational — lebih terkontrol dan tidak bisa nyasar
- Semua async work (cron, email polling, report generation) lewat BullMQ

---

## Onboarding Flow

Prinsip: **user bisa langsung chatting dan pakai fitur setelah registrasi**. Setup lanjutan ditawarkan aktif di awal dengan penjelasan value, tapi bisa di-skip.

```
[Register: email + password]
         │
         ▼
[Web Chatbox terbuka]
Agent: "Halo! Nama lengkap dan nama bisnis kamu apa?"
         │
         ▼
Agent tawarkan 2 fitur utama dengan penjelasan:

  "Sebelum mulai, ada 2 hal yang bisa bikin pengalamanmu
   jauh lebih powerful:"

  📱 Telegram — akses agent langsung dari HP,
     terima laporan otomatis, notifikasi invoice

  📧 Email — auto-detect tagihan masuk, notifikasi
     transfer bank, dan invoice dari supplier

  [Setup Telegram]  [Connect Email]  [Nanti saja →]
         │                    │
    user setup           user skip
         │                    │
         ▼                    ▼
  guided step by step    Langsung ke chatbox
  (resumable kapanpun)   (agent ingatkan sekali
                          di sesi berikutnya)
```

**Setup Telegram:**
1. Agent berikan instruksi singkat cara buat bot di BotFather
2. User paste bot token ke chatbox
3. Agent minta user tekan `/start` di bot mereka sendiri → backend auto-capture Telegram User ID

**Setup Email:**
1. Agent tampilkan tombol "Connect Gmail" atau "Connect Outlook"
2. OAuth flow standar
3. Agent tanya frekuensi polling email (default: 60 menit, minimum: 30 menit)

**State machine resumable** — kalau user keluar di tengah setup, state tersimpan di `onboarding_state` (JSONB) dan bisa dilanjutkan kapanpun. User juga bisa trigger ulang via percakapan: *"setup telegram"*, *"connect email"*.

---

## Agent Engine

### Dua Mode

```
Pesan masuk (web / Telegram)
         │
         ▼
Apakah user sedang dalam onboarding state?
         │
    ya ──┤── tidak
         │         │
         ▼         ▼
[State Machine]   [Tool-Calling Agent]
- step terkontrol  - LLM bebas pilih tool
- tidak bisa nyasar - multi-turn natural
- resumable        - context-aware
```

### Tool Registry (MVP)

| Tool | Fungsi |
|---|---|
| `create_transaction` | Catat pemasukan / pengeluaran |
| `get_balance` | Ringkasan saldo & arus kas |
| `list_transactions` | Riwayat transaksi dengan filter |
| `create_invoice` | Buat invoice baru |
| `list_invoices` | Lihat status invoice (paid/unpaid) |
| `mark_invoice_paid` | Tandai invoice lunas |
| `parse_email` | Ekstrak data dari email bank/invoice |
| `schedule_report` | Buat jadwal laporan otomatis |
| `get_report` | Generate laporan on-demand |
| `create_custom_tool` | Buat composite tool baru (dynamic tooling) |

### Conversation Context
- History tersimpan di PostgreSQL per user
- Sliding window: N pesan terakhir + summary lama — mencegah context membengkak
- Pesan dari Telegram dan web masuk ke thread yang sama — seamless antar channel

---

## Dynamic Tool System

Agent dapat membuat tool baru saat user membutuhkan sesuatu di luar kemampuan tool yang ada.

**Lifecycle:**
```
Agent identifikasi kebutuhan baru
         │
         ▼
Agent panggil create_custom_tool()
→ status: TEMPORARY (hanya aktif untuk creator)
         │
         ▼
BullMQ cron (weekly) evaluasi TEMPORARY tools:
         │
    ┌────┴────┐
    ▼              ▼
>= 5 unique    < 5 unique users
users          & > 60 hari
    │              │
    ▼              ▼
PERMANENT       DELETED
```

**Implementasi:** Tool baru didefinisikan sebagai **composite workflow** — rangkaian tool yang sudah ada dengan parameter tertentu. Bukan raw code execution (security concern).

**System prompt instruction:**
> *"Jika user membutuhkan sesuatu di luar kemampuan tools yang ada, kamu boleh membuat custom tool menggunakan `create_custom_tool()`. Definisikan sebagai workflow dari tools yang sudah ada."*

**Threshold promotion:** 5 unique users dalam 30 hari (dapat dikonfigurasi).

---

## Data Model

```sql
users
  id, email, password_hash
  full_name, business_name
  invoice_sender_name          -- preferensi: full_name atau business_name
  telegram_bot_token, telegram_user_id
  email_oauth_token            -- encrypted at rest
  email_poll_interval_minutes  -- default: 60, minimum: 30
  onboarding_state             -- JSONB, resumable state machine
  tier                         -- 'free' | 'premium' (untuk future billing)
  created_at

transactions
  id, user_id
  type                         -- 'income' | 'expense'
  amount, currency
  category, description
  source                       -- 'manual' | 'email_parsed' | 'agent'
  date, created_at

invoices
  id, user_id
  direction                    -- 'outgoing' (user buat untuk klien) | 'incoming' (dari supplier via email)
  invoice_number, client_name, client_email
  items                        -- JSONB (line items)
  total_amount
  status                       -- outgoing: 'draft'|'sent'|'paid'|'overdue' / incoming: 'received'|'paid'
  due_date, paid_at, created_at

conversation_messages
  id, user_id
  channel                      -- 'web' | 'telegram'
  role                         -- 'user' | 'assistant' | 'tool'
  content, tool_calls          -- JSONB
  created_at

scheduled_reports
  id, user_id
  type                         -- 'daily' | 'weekly' | 'monthly' | 'custom'
  cron_expression
  delivery                     -- 'telegram' | 'email' | 'both'
  last_run_at, next_run_at

custom_tools
  id, name, description
  definition                   -- JSONB (composite workflow steps)
  status                       -- 'temporary' | 'permanent'
  creator_user_id, created_at

tool_usage_log
  tool_id, user_id, used_at
```

**Catatan:**
- `email_oauth_token` di-encrypt at rest
- `invoice_sender_name` ditanyakan agent saat pertama kali buat invoice, tersimpan untuk selanjutnya
- `source` di transactions penting untuk audit trail

---

## Scheduled Reports

User bisa minta laporan otomatis via percakapan natural:
> *"kirim laporan bulanan tiap tanggal 15 ke Telegram"*

Agent panggil `schedule_report()` → BullMQ repeatable job terdaftar dengan cron expression yang sesuai.

Laporan dikirim sebagai pesan Telegram natural language + tabel ringkas, atau email HTML.

---

## Email Integration

**Polling:** BullMQ cron per-user berdasarkan `email_poll_interval_minutes`. Bukan satu cron global.

**Flow:**
```
BullMQ worker jalan sesuai interval user
→ poll email baru via Gmail API / Microsoft Graph
→ filter: notifikasi bank, invoice, tagihan
→ kirim ke LLM parser (prompt khusus ekstraksi)
         │
    ┌────┴────────┐
    ▼             ▼
Notif bank     Invoice masuk
create_        simpan ke invoices
transaction()  (status: received)
               → notif user
```

**Parser:** LLM-based — lebih flexible daripada regex untuk berbagai format email bank Indonesia yang berbeda-beda.

**Privacy:** Raw email tidak disimpan. Hanya data hasil ekstraksi yang masuk ke DB.

**Future premium:** Interval polling < 30 menit tersedia untuk tier premium.

---

## Multi-Tenant & Auth

- Setiap user memiliki data terisolasi (user_id sebagai foreign key di semua tabel)
- Auth: email + password, JWT-based session
- Beta: tidak ada billing/subscription logic
- `tier` field sudah ada di schema untuk memudahkan penambahan billing nanti

---

## Out of Scope (MVP)

- Stock management → fase 2
- Billing / subscription
- Email polling interval < 30 menit
- WhatsApp integration
- Multi-user per bisnis (tim)
