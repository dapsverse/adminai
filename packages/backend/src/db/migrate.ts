import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../drizzle') })
await client.end()
console.log('Migration complete')
