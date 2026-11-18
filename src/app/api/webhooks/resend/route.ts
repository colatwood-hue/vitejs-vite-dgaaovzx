import { sql } from '@/lib/db'
import { verifySvix } from '@/lib/webhooks'

type ResendEvent = { type: string; data?: { email_id?: string } }

const DELIVERY_STATUS: Record<string, 'delivered' | 'bounced' | 'complained'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })
  const body = await req.text()
  if (body.length > 1_000_000 || !verifySvix(body, req.headers, secret)) return new Response('Invalid signature', { status: 401 })

  let event: ResendEvent
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }
  const eventId = req.headers.get('svix-id')!
  const first = await sql`insert into webhook_events (id, type) values (${eventId}, ${String(event.type).slice(0, 100)}) on conflict do nothing returning id`
  if (!first.length) return new Response('Already processed', { status: 200 })

  const status = DELIVERY_STATUS[event.type]
  const emailId = event.data?.email_id
  if (status && emailId) {
    const [d] = await sql<{ subscriber_id: string }[]>`
      update deliveries set status = ${status} where provider_id = ${emailId} returning subscriber_id`
    // Suppress addresses that bounce or complain, so we never mail them again.
    if (d && status !== 'delivered') {
      await sql`update subscribers set status = ${status} where id = ${d.subscriber_id} and status <> 'unsubscribed'`
    }
  }
  return new Response('ok', { status: 200 })
}
