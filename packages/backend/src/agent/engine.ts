import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getLlmProvider } from '../lib/llm'
import { loadContext, saveMessage } from './context'
import { getOnboardingState, setOnboardingStep, buildOnboardingMessage } from './onboarding'
import { getAllTools, getTool } from './tools'

interface Integrations {
  gmailConnected: boolean
  gmailAddress: string | null
  telegramConnected: boolean
}

function buildSystemPrompt(fullName: string, businessName: string, integrations: Integrations): string {
  const gmailStatus = integrations.gmailConnected
    ? `Terhubung (${integrations.gmailAddress})`
    : 'Belum terhubung'
  const telegramStatus = integrations.telegramConnected ? 'Terhubung' : 'Belum terhubung'

  return `Kamu adalah AdminAI, asisten AI untuk usaha kecil.
Pengguna: ${fullName} | Bisnis: ${businessName}

Status integrasi saat ini:
- Gmail: ${gmailStatus}
- Telegram: ${telegramStatus}

Tugasmu: membantu mengelola keuangan dan invoice ${businessName} melalui percakapan.
Jawab dalam Bahasa Indonesia yang santai dan ramah.

Tools yang tersedia:
- create_transaction: catat pemasukan atau pengeluaran baru
- get_balance: lihat ringkasan saldo dan arus kas (semua waktu + bulan ini)
- list_transactions: tampilkan riwayat transaksi dengan filter opsional
- create_invoice: buat invoice baru (outgoing ke client, atau incoming dari supplier)
- list_invoices: lihat daftar invoice dan statusnya
- mark_invoice_paid: tandai invoice sudah lunas
- schedule_report: jadwalkan laporan keuangan otomatis (harian/mingguan/bulanan), kirim via telegram/email/both
- list_reports: tampilkan semua laporan terjadwal
- delete_report: hapus jadwal laporan berdasarkan ID
- connect_telegram: hubungkan akun Telegram user ke AdminAI menggunakan bot token dan user ID
- connect_email: generate link OAuth untuk menghubungkan Gmail user ke AdminAI
- read_emails: baca/cari email dari Gmail user yang sudah terhubung
- send_email: kirim email via Gmail user yang sudah terhubung

Panduan penggunaan tools:
- Gunakan tools secara proaktif saat user menyebut transaksi, invoice, atau minta laporan
- Jika informasi kurang lengkap (misal: jumlah uang tidak jelas), tanyakan dulu sebelum memanggil tool
- Semua amount dalam Rupiah (IDR), bilangan bulat
- Setelah berhasil, konfirmasi ke user apa yang sudah dicatat dengan format yang mudah dibaca
- Untuk schedule_report: jika tidak disebutkan jam, gunakan 08:00 sebagai default; jika tidak disebutkan delivery, gunakan telegram
- Delivery options: telegram (butuh Telegram terhubung), email (butuh Gmail terhubung), both (keduanya)

Panduan Gmail (PENTING):
- Lihat status integrasi di atas untuk tahu apakah Gmail sudah terhubung
- Jika Gmail SUDAH terhubung: langsung gunakan read_emails atau send_email TANPA bertanya apakah sudah terhubung
- Jika user minta "cek email", "baca email", "email dari X": panggil read_emails dengan query yang sesuai
- Jika user minta "kirim email ke X": panggil send_email dengan to, subject, dan body
- Jika Gmail BELUM terhubung dan user minta fitur email: panggil connect_email, lalu sampaikan link ke user

Panduan connect Gmail via chat:
- Ketika user minta connect/hubungkan email atau Gmail, langsung panggil connect_email tool (tidak perlu tanya apapun dulu)
- Jika sukses, tool mengembalikan authUrl — sampaikan ke user: "Klik link ini untuk menghubungkan Gmail kamu: [URL]"
- Setelah user klik dan approve, Gmail mereka otomatis terhubung

Panduan setup Telegram via chat (JANGAN arahkan ke halaman pengaturan — tidak ada):
- Ketika user minta setup/connect Telegram, kirim instruksi ini dalam SATU pesan dan minta mereka balas dengan kedua info sekaligus:
  "Untuk setup Telegram, ikuti 2 langkah ini:
   1. Buka @BotFather di Telegram → kirim /newbot → ikuti instruksi → copy bot token (format: 123456789:ABCdef...)
   2. Buka @userinfobot di Telegram → kirim pesan apapun → copy angka 'Id' yang muncul
   Setelah dapat keduanya, balas pesan ini dengan bot token dan user ID kamu."
- HANYA panggil connect_telegram setelah user memberikan KEDUA nilai (bot_token DAN telegram_user_id) dalam pesannya
- JANGAN panggil connect_telegram tanpa kedua nilai tersebut — tunggu user kirim datanya dulu
- Jika connect_telegram sukses, konfirmasi Telegram sudah terhubung dan sebutkan nama bot (@username)
- Jika gagal (token tidak valid dll), sampaikan pesan error secara ramah dan minta coba lagi`.trim()
}

export async function processMessage(
  userId: string,
  message: string,
  channel: 'web' | 'telegram' = 'web'
): Promise<string> {
  const [user] = await db
    .select({
      fullName: users.fullName,
      businessName: users.businessName,
      googleEmail: users.googleEmail,
      googleAccessToken: users.googleAccessToken,
      telegramUserId: users.telegramUserId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error('User not found')

  const onboarding = await getOnboardingState(userId)

  let reply: string

  if (onboarding.step === 'OFFER_INTEGRATIONS') {
    reply = buildOnboardingMessage(user.fullName, user.businessName)
    await setOnboardingStep(userId, 'ACTIVE')
  } else {
    const integrations: Integrations = {
      gmailConnected: !!(user.googleEmail && user.googleAccessToken),
      gmailAddress: user.googleEmail,
      telegramConnected: !!user.telegramUserId,
    }

    const history = await loadContext(userId)
    const tools = getAllTools()
    const llm = getLlmProvider()
    const systemPrompt = buildSystemPrompt(user.fullName, user.businessName, integrations)

    const response = await llm.chat(
      systemPrompt,
      history,
      message,
      tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    )

    if (response.toolCalls.length > 0) {
      const tc = response.toolCalls[0]
      const tool = getTool(tc.name)

      if (!tool) {
        reply = 'Maaf, fitur tersebut belum tersedia saat ini.'
      } else {
        try {
          const result = await tool.execute(tc.args, userId)
          const historyWithCurrentMessage = [
            ...history,
            { role: 'user' as const, content: message },
          ]
          const followUp = await llm.chat(
            systemPrompt,
            historyWithCurrentMessage,
            `Data dari ${tc.name}: ${JSON.stringify(result.data ?? result.error)}\nBerikan respons informatif kepada pengguna.`
          )
          reply = followUp.content ?? 'Maaf, tidak ada respons.'
        } catch (err) {
          console.error(`[engine] Tool ${tc.name} failed:`, err)
          reply = 'Maaf, terjadi kesalahan saat memproses permintaan. Silakan coba lagi.'
        }
      }
    } else {
      reply = response.content ?? 'Maaf, tidak ada respons.'
    }
  }

  await saveMessage(userId, 'user', message, channel)
  await saveMessage(userId, 'assistant', reply, channel)

  return reply
}
