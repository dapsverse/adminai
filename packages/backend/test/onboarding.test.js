import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { getOnboardingState, setOnboardingStep, buildOnboardingMessage, } from '../src/agent/onboarding';
import { cleanDb } from './setup';
async function createUser(suffix = Date.now().toString()) {
    const [user] = await db.insert(users).values({
        email: `onb-${suffix}@test.com`,
        passwordHash: 'hash',
        fullName: 'Onb User',
        businessName: 'Toko Onb',
    }).returning();
    return user;
}
beforeEach(() => cleanDb());
describe('getOnboardingState', () => {
    it('returns OFFER_INTEGRATIONS for new user (null state)', async () => {
        const user = await createUser();
        const state = await getOnboardingState(user.id);
        expect(state.step).toBe('OFFER_INTEGRATIONS');
    });
    it('returns persisted step after setOnboardingStep', async () => {
        const user = await createUser();
        await setOnboardingStep(user.id, 'ACTIVE');
        const state = await getOnboardingState(user.id);
        expect(state.step).toBe('ACTIVE');
    });
});
describe('buildOnboardingMessage', () => {
    it('includes user fullName and businessName', () => {
        const msg = buildOnboardingMessage('Budi', 'Warung Budi');
        expect(msg).toContain('Budi');
        expect(msg).toContain('Warung Budi');
    });
    it('mentions both Telegram and email integration options', () => {
        const msg = buildOnboardingMessage('Siti', 'Toko Siti');
        expect(msg.toLowerCase()).toContain('telegram');
        expect(msg.toLowerCase()).toContain('email');
    });
});
