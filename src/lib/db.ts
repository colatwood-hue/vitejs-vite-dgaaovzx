import 'server-only'
import postgres from 'postgres'

declare global {
  var __dashSql: ReturnType<typeof postgres> | undefined
}

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // prepare:false is required for Supabase's transaction pooler (port 6543).
  return postgres(url, { prepare: false, max: 5, onnotice: () => {} })
}

/** Single shared client; reused across hot reloads in development. */
export const sql = globalThis.__dashSql ?? (globalThis.__dashSql = create())
