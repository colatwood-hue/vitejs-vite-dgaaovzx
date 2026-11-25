# Running the local beta (no API keys)

The whole studio and public site run on your computer with **no outside services**:

| | In the beta |
|---|---|
| Thought Inbox, voice recording, ideas, pipeline, search | ✅ fully working |
| Issue editor, previews, version history, approval, publishing to the local site | ✅ fully working |
| Subscribers, consent records, CSV import/export | ✅ fully working |
| Sending email (tests and broadcasts) | 🟡 **simulated**: recorded in the send log, never delivered |
| AI editorial partner, AI analysis, AI repurposing | ⚪ off: write and repurpose by hand |
| Voice transcription | ⚪ off: recordings are saved and playable, not transcribed |

## One-time setup (about 5 minutes)

You need **Node.js 20+** ([nodejs.org](https://nodejs.org)) and **Docker Desktop** ([docker.com](https://www.docker.com/products/docker-desktop/)), which runs the database.

```bash
git clone https://github.com/colatwood-hue/vitejs-vite-dgaaovzx.git the-dash
cd the-dash
git checkout claude/the-dash-newsletter-3xglv2
npm install
docker compose up -d        # starts the database
npm run beta                # creates .env, sets up the database, builds and starts
```

`npm run beta` prints a **setup token**. Open <http://localhost:3000/studio/setup>, paste the token, and create your account. Then you're in the studio. Concept 001 is waiting on the dashboard.

## Day to day

```bash
docker compose up -d        # if the database isn't already running (Docker Desktop restarts it automatically)
npm run beta                # start the app (Ctrl+C to stop)
```

- Studio: <http://localhost:3000/studio> · Public site: <http://localhost:3000>
- Prefer instant reloads while changing code? Use `npm run beta:dev`.
- **Your data stays** between runs (it lives in a Docker volume). `docker compose down -v` erases it completely, so only do that to start over.
- **On your phone:** while your computer is on the same Wi-Fi, open `http://<your-computer's-IP>:3000/studio` (the address is printed as "Network" when the app starts). Phones only allow microphone access on `https` or `localhost`, so **voice recording from a phone needs the deployed version**. Typing works fine. Uploading audio files works too.

## Things to try

1. Capture a few thoughts: typed, and a voice note from your computer's microphone.
2. Turn one into an idea; search for a word you used.
3. Open concept 001, choose **Write it myself**, draft a letter, and look at the **Email · mobile** preview.
4. Settings → fill in sender details and a mailing address (any placeholder for now).
5. Send yourself a test (simulated), approve, publish, and read it at <http://localhost:3000>.
6. Add yourself as a subscriber and "send" it. Check the send log and Analytics.

## Turning features on later

Everything is controlled by `.env` (restart after editing):

- AI partner: `ANTHROPIC_API_KEY=…`
- Transcription: `TRANSCRIPTION_PROVIDER=openai` + `OPENAI_API_KEY=…`
- Real email: see [SETUP.md §4](SETUP.md). Don't do this until you deploy, since email links would point at `localhost`.

## Troubleshooting

- **"Can't reach the database"**: Docker Desktop isn't running, or the database container isn't up. Run `docker compose up -d`, then `npm run beta` again.
- **Port 3000 in use**: `PORT=3001 npm run beta` and set `APP_URL=http://localhost:3001` in `.env`.
- **Forgot the setup token**: it's `SETUP_TOKEN` in `.env`.
- **Forgot your password**: `docker compose down -v` resets everything (beta data is lost), or ask for a reset script.
