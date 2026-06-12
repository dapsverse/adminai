import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { loadContext, saveMessage } from '../src/agent/context';
import { cleanDb } from './setup';
async function createUser(suffix = Date.now().toString()) {
    const [user] = await db.insert(users).values({
        email: `ctx-${suffix}@test.com`,
        passwordHash: 'hash',
        fullName: 'Ctx User',
        businessName: 'Toko Ctx',
    }).returning();
    return user;
}
beforeEach(() => cleanDb());
describe('loadContext', () => {
    it('returns empty array for user with no messages', async () => {
        const user = await createUser();
        const msgs = await loadContext(user.id);
        expect(msgs).toEqual([]);
    });
    it('returns messages in chronological order', async () => {
        const user = await createUser();
        await saveMessage(user.id, 'user', 'pertanyaan pertama');
        await saveMessage(user.id, 'assistant', 'jawaban pertama');
        const msgs = await loadContext(user.id);
        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('pertanyaan pertama');
        expect(msgs[1].role).toBe('assistant');
    });
    it('returns at most 20 messages (sliding window of most recent)', async () => {
        const user = await createUser();
        for (let i = 0; i < 25; i++) {
            await saveMessage(user.id, 'user', `msg ${i}`);
        }
        const msgs = await loadContext(user.id);
        expect(msgs.length).toBe(20);
        // Most recent 20: msg 5 through msg 24
        expect(msgs[19].content).toBe('msg 24');
    });
});
describe('saveMessage', () => {
    it('persists user message', async () => {
        const user = await createUser();
        await saveMessage(user.id, 'user', 'hello');
        const msgs = await loadContext(user.id);
        expect(msgs[0].content).toBe('hello');
        expect(msgs[0].role).toBe('user');
    });
    it('persists assistant message', async () => {
        const user = await createUser();
        await saveMessage(user.id, 'assistant', 'Halo!');
        const msgs = await loadContext(user.id);
        expect(msgs[0].content).toBe('Halo!');
        expect(msgs[0].role).toBe('assistant');
    });
});
