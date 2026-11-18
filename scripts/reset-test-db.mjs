// Drops and rebuilds the TEST database schema. Refuses to touch anything not named *_test.
import { execFileSync } from 'node:child_process'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url || !/\/[^/]*_test(\?|$)/.test(url)) {
  console.error('reset-test-db: DATABASE_URL must point at a database whose name ends in _test')
  process.exit(1)
}
const sql = postgres(url, { max: 1, onnotice: () => {} })
await sql.unsafe('drop schema public cascade; create schema public;')
await sql.end()
execFileSync('node', ['scripts/migrate.mjs'], { stdio: 'inherit' })
