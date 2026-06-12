import 'dotenv/config';
import { db } from '../src/db';
import { toolUsageLog, customTools, scheduledReports, conversationMessages, invoices, transactions, users, } from '../src/db/schema';
import { createId } from '@paralleldrive/cuid2';
export async function cleanDb() {
    await db.delete(toolUsageLog);
    await db.delete(customTools);
    await db.delete(scheduledReports);
    await db.delete(conversationMessages);
    await db.delete(invoices);
    await db.delete(transactions);
    await db.delete(users);
}
export async function createTestUser(overrides) {
    const [user] = await db.insert(users).values({
        email: `${createId()}@test.com`,
        passwordHash: 'hash',
        fullName: overrides?.fullName ?? 'Test User',
        businessName: overrides?.businessName ?? 'Toko Test',
    }).returning();
    return user;
}
