import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { app } from '../src/index';
import { signJwt } from '../src/lib/jwt';
import { setLlmProvider } from '../src/lib/llm';
import { cleanDb } from './setup';
const mockLlm = {
    async chat() {
        return { content: 'Respons dari agent', toolCalls: [] };
    },
};
async function createUserAndToken(suffix = Date.now().toString()) {
    const [user] = await db.insert(users).values({
        email: `chat-${suffix}@test.com`,
        passwordHash: 'hash',
        fullName: 'Chat User',
        businessName: 'Toko Chat',
    }).returning();
    const token = await signJwt({ userId: user.id, email: user.email });
    return { user, token };
}
beforeEach(async () => {
    await cleanDb();
    setLlmProvider(mockLlm);
});
describe('POST /chat', () => {
    it('returns onboarding reply for first message of a new user', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'halo' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reply).toContain('Selamat datang');
    });
    it('returns LLM reply for subsequent messages', async () => {
        const { token } = await createUserAndToken();
        // First message triggers onboarding
        await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'halo' }),
        });
        // Second message goes through LLM
        const res = await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'apa yang bisa kamu bantu?' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reply).toBe('Respons dari agent');
    });
    it('returns 401 without Authorization header', async () => {
        const res = await app.request('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'halo' }),
        });
        expect(res.status).toBe(401);
    });
    it('returns 400 when message field is missing', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });
    it('returns 400 when message is an empty string', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '   ' }),
        });
        expect(res.status).toBe(400);
    });
});
describe('GET /chat/history', () => {
    it('returns empty messages for new user', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/chat/history', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.messages).toEqual([]);
    });
    it('returns saved conversation history', async () => {
        const { token } = await createUserAndToken();
        // Send first message (triggers onboarding)
        await app.request('/chat', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'halo' }),
        });
        const res = await app.request('/chat/history', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.messages.length).toBeGreaterThanOrEqual(2);
        expect(body.messages[0].role).toBe('user');
        expect(body.messages[0].content).toBe('halo');
        expect(body.messages.every((m) => m.id && m.role && m.content !== undefined)).toBe(true);
    });
    it('returns 401 without Authorization header', async () => {
        const res = await app.request('/chat/history');
        expect(res.status).toBe(401);
    });
});
