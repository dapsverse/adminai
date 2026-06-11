import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

;(async () => {
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') })
    await client.end()
    console.log('Migration complete')
  } catch (err) {
    console.error('Migration failed:', err)
    await client.end()
    process.exit(1)
  }
})()
