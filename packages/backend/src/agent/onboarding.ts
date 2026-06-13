import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export interface OnboardingState {
  step: 'OFFER_INTEGRATIONS' | 'ACTIVE'
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [user] = await db
    .select({ onboardingState: users.onboardingState })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.onboardingState) return { step: 'ACTIVE' }
  return user.onboardingState as OnboardingState
}

export async function setOnboardingStep(
  userId: string,
  step: OnboardingState['step']
): Promise<void> {
  await db
    .update(users)
    .set({ onboardingState: { step } })
    .where(eq(users.id, userId))
}

export function buildOnboardingMessage(fullName: string, businessName: string): string {
  return `Halo, ${fullName}! Selamat datang di AdminAI.

Saya siap membantu kamu mengelola keuangan dan invoice untuk ${businessName}.

Sebelum mulai, ada 2 hal yang bisa membuat pengalamanmu lebih lengkap:

📱 Telegram — Akses saya langsung dari HP, terima notifikasi invoice dan laporan otomatis kapan saja. Ketik "setup telegram" untuk memulai.

📧 Email — Saya bisa otomatis mendeteksi notifikasi transfer masuk dan invoice dari supplier. Ketik "connect email" untuk memulai.

Atau langsung mulai saja — ketik apa yang ingin kamu catat atau tanyakan seputar keuangan ${businessName}!`
}
