import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { users, conversationMessages } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { processMessage } from '../src/agent/engine';
import { setLlmProvider } from '../src/lib/llm';
import { cleanDb } from './setup';
const mockLlm = {
    async chat() {
        return { content: 'Mock response dari LLM', toolCalls: [] };
    },
};
async function createUser(suffix = Date.now().toString()) {
    const [user] = await db.insert(users).values({
        email: `eng-${suffix}@test.com`,
        passwordHash: 'hash',
        fullName: 'Engine User',
        businessName: 'Toko Engine',
    }).returning();
    return user;
}
beforeEach(async () => {
    await cleanDb();
    setLlmProvider(mockLlm);
});
describe('processMessage', () => {
    it('returns onboarding message on very first message', async () => {
        const user = await createUser();
        const reply = await processMessage(user.id, 'halo');
        expect(reply).toContain('Selamat datang');
        expect(reply).toContain('Toko Engine');
        expect(reply).toContain('Telegram');
    });
    it('calls LLM for messages after onboarding completes', async () => {
        const user = await createUser();
        await processMessage(user.id, 'halo'); // triggers onboarding → sets ACTIVE
        const reply = await processMessage(user.id, 'apa yang bisa kamu bantu?');
        expect(reply).toBe('Mock response dari LLM');
    });
    it('saves both user and assistant messages to conversation_messages', async () => {
        const user = await createUser();
        await processMessage(user.id, 'halo');
        const msgs = await db
            .select()
            .from(conversationMessages)
            .where(eq(conversationMessages.userId, user.id));
        expect(msgs.some(m => m.role === 'user')).toBe(true);
        expect(msgs.some(m => m.role === 'assistant')).toBe(true);
    });
    it('passes accumulated conversation history to LLM', async () => {
        let capturedHistoryLength = 0;
        const spyLlm = {
            async chat(_, history) {
                capturedHistoryLength = history.length;
                return { content: 'ok', toolCalls: [] };
            },
        };
        setLlmProvider(spyLlm);
        const user = await createUser();
        await processMessage(user.id, 'pesan pertama'); // onboarding
        await processMessage(user.id, 'pesan kedua'); // LLM, history = [pesan1, onboarding-reply]
        await processMessage(user.id, 'pesan ketiga'); // LLM, history = [pesan1, onboarding-reply, pesan2, llm-reply]
        expect(capturedHistoryLength).toBeGreaterThanOrEqual(4);
    });
});
