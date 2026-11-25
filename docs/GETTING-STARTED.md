# Getting started

Two tracks. Start the first today; the second takes about 30 minutes of clicking.

## Track 1: start the habit today (no app needed)
1. **Write your one-sentence "why".** For example: *"I write to think more clearly about how to live, and share what I find with people I care about."*
2. **Capture 5 things this week** in your phone's notes app: a thought, a quote, a moment. Write what it was, where it came from, and why it stopped you. These go into the app later.
3. **List 15–30 people** you'd send a letter to, and send each a personal invite (template in `framework/launch-invite.md`). Note who says yes.
4. **Pick a send day**, e.g. every other Sunday.

## Track 2: put The Dash online (free tiers)

You'll create two free accounts. Never paste passwords or keys into a chat: they go only into the Supabase and Vercel dashboards.

### A. Database: Supabase (~10 min)
1. Go to **supabase.com** → sign up → **New project**. Name: `the-dash`. Choose a strong database password and save it in your password manager. Pick the region closest to you.
2. When it's ready, open **SQL Editor** → **New query**. Paste the entire contents of [`supabase/setup.sql`](../supabase/setup.sql) and click **Run**. You should see "Success".
3. Click **Connect** (top of the page) → **Transaction pooler** → copy the URI. It looks like
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:6543/postgres`.
   Replace `[YOUR-PASSWORD]` with your database password. This is your **DATABASE_URL**.

### B. Website: Vercel (~10 min)
1. Go to **vercel.com** → sign up **with GitHub**.
2. **Add New → Project** → import **vitejs-vite-dgaaovzx**.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the URI from step A3 |
   | `STUDIO_PASSWORD` | the password you'll use to sign in to the studio |
   | `SESSION_SECRET` | a random string of 40+ characters (use your password manager's generator) |
   | `TOKEN_SECRET` | a *different* random string of 40+ characters. Keep it forever: unsubscribe links depend on it |

4. Click **Deploy**. When it finishes, open **Settings → Environment Variables** and add `NEXT_PUBLIC_SITE_URL` = your site address (e.g. `https://the-dash-xyz.vercel.app`), then **Deployments → ⋯ → Redeploy**.
5. If the project builds an old version, the new app isn't on the `main` branch yet: either merge it into `main`, or set **Settings → Git → Production Branch** to `claude/hopeful-newton-e5stds` and redeploy.

### C. Use it
- On your phone, open `https://<your-site>/studio/capture`, sign in, then use **Share → Add to Home Screen** so it opens like an app.
- **Capture** anything; find it later in **Library**; **Promote to newsletter** when something is worth writing about.
- Write a letter under **Ideas → Start a letter**; approve; publish. Until email is set up, use **Download HTML** and send it with any email tool you like.

### D. Later: real email (Resend)
Sign up at **resend.com**, verify a domain you own, then add `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `Col <letters@yourdomain.com>`) and `OWNER_EMAIL` in Vercel and redeploy. The subscribe form then appears on your homepage, and you can send yourself a test of each letter. For bounce handling, add a Resend webhook pointing to `https://<your-site>/api/webhooks/resend` and put its signing secret in `RESEND_WEBHOOK_SECRET`.

### Backups
In the studio, **Export** downloads everything. Do it monthly. See `docs/DATA.md`.
