import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { signJwt } from '../src/lib/jwt';
import { setTelegramClient } from '../src/lib/telegram';
import { setLlmProvider } from '../src/lib/llm';
import { cleanDb, createTestUser } from './setup';
const mockLlm = {
    async chat() {
        return { content: 'Mock LLM reply', toolCalls: [] };
    },
};
function makeMockBot() {
    return {
        getMe: vi.fn().mockResolvedValue({ id: 123456789, username: 'mytestbot', firstName: 'My Test Bot' }),
        setWebhook: vi.fn().mockResolvedValue(undefined),
        deleteWebhook: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
    };
}
let mockBot;
beforeEach(async () => {
    await cleanDb();
    mockBot = makeMockBot();
    setTelegramClient(mockBot);
    setLlmProvider(mockLlm);
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com';
});
afterEach(() => {
    delete process.env.WEBHOOK_BASE_URL;
});
async function createUserAndToken() {
    const user = await createTestUser();
    const token = await signJwt({ userId: user.id, email: user.email });
    return { user, token };
}
describe('PUT /auth/telegram', () => {
    it('returns 401 without auth token', async () => {
        const res = await app.request('/auth/telegram', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
        });
        expect(res.status).toBe(401);
    });
    it('returns 400 when botToken is missing', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/auth/telegram', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramChatId: '987654321' }),
        });
        expect(res.status).toBe(400);
    });
    it('returns 400 when telegramChatId is missing', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/auth/telegram', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: 'bot123:ABC' }),
        });
        expect(res.status).toBe(400);
    });
    it('returns 422 when Telegram rejects the bot token', async () => {
        mockBot.getMe = vi.fn().mockRejectedValue(new Error('Unauthorized'));
        const { token } = await createUserAndToken();
        const res = await app.request('/auth/telegram', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: 'invalid:TOKEN', telegramChatId: '987654321' }),
        });
        expect(res.status).toBe(422);
    });
    it('stores bot token and chat id, calls getMe and setWebhook, returns connected status', async () => {
        const { token, user } = await createUserAndToken();
        const res = await app.request('/auth/telegram', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.telegramConnected).toBe(true);
        expect(body.botUsername).toBe('mytestbot');
        expect(mockBot.getMe).toHaveBeenCalledWith('bot123:ABC');
        expect(mockBot.setWebhook).toHaveBeenCalledWith('bot123:ABC', expect.stringContaining(`/telegram/webhook/`));
        const [updated] = await db.select().from(users).where(eq(users.id, user.id));
        expect(updated.telegramBotToken).toBe('bot123:ABC');
        expect(updated.telegramUserId).toBe('987654321');
    });
});
describe('DELETE /auth/telegram', () => {
    it('returns 401 without auth token', async () => {
        const res = await app.request('/auth/telegram', { method: 'DELETE' });
        expect(res.status).toBe(401);
    });
    it('returns 400 when telegram is not connected', async () => {
        const { token } = await createUserAndToken();
        const res = await app.request('/auth/telegram', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(400);
    });
    it('calls deleteWebhook, clears telegram fields, returns disconnected status', async () => {
        const { token, user } = await createUserAndToken();
        await db.update(users)
            .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
            .where(eq(users.id, user.id));
        const res = await app.request('/auth/telegram', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.telegramConnected).toBe(false);
        expect(mockBot.deleteWebhook).toHaveBeenCalledWith('bot123:ABC');
        const [updated] = await db.select().from(users).where(eq(users.id, user.id));
        expect(updated.telegramBotToken).toBeNull();
        expect(updated.telegramUserId).toBeNull();
    });
});
describe('POST /telegram/webhook/:userId', () => {
    function makeUpdate(chatId, text) {
        return {
            update_id: 1,
            message: {
                message_id: 1,
                from: { id: chatId },
                chat: { id: chatId },
                text,
                date: 1718000000,
            },
        };
    }
    it('returns 200 and ignores updates with no message or no text', async () => {
        const res = await app.request('/telegram/webhook/any-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ update_id: 1 }),
        });
        expect(res.status).toBe(200);
        expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
    it('returns 200 and does not call sendMessage for unknown userId', async () => {
        const res = await app.request('/telegram/webhook/nonexistent-user-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(makeUpdate(999999, 'halo')),
        });
        expect(res.status).toBe(200);
        expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
    it('returns 200 and does not call sendMessage when sender is not the registered telegram user', async () => {
        const user = await createTestUser();
        await db.update(users)
            .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
            .where(eq(users.id, user.id));
        const res = await app.request(`/telegram/webhook/${user.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(makeUpdate(111111111, 'spoofed')),
        });
        expect(res.status).toBe(200);
        expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });
    it('processes message from registered user and calls sendMessage with reply', async () => {
        const user = await createTestUser();
        await db.update(users)
            .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
            .where(eq(users.id, user.id));
        const res = await app.request(`/telegram/webhook/${user.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(makeUpdate(987654321, 'halo dari telegram')),
        });
        expect(res.status).toBe(200);
        expect(mockBot.sendMessage).toHaveBeenCalledWith('bot123:ABC', '987654321', expect.any(String));
    });
});
