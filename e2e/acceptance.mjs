/**
 * End-to-end acceptance walkthrough against a running server with a FRESH
 * database (simulated email provider, no AI key required).
 *
 *   npm run db:migrate && npm run db:seed && npm run build && npm start
 *   SETUP_TOKEN=... node e2e/acceptance.mjs            (BASE_URL defaults to http://localhost:3000)
 *
 * Screenshots are written to e2e/screenshots/ (git-ignored).
 */
import { createRequire } from "node:module";
// Resolve Playwright from the project or a global install.
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TOKEN = process.env.SETUP_TOKEN ?? "local-setup-token";
const OUT = path.resolve("e2e/screenshots");
mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push(["FAIL", name, err.message]);
    console.log(`FAIL  ${name}\n      ${err.message.split("\n")[0]}`);
    throw err;
  }
}

/** A tiny valid WAV file (1s of silence) to exercise audio upload & storage. */
function silentWav() {
  const rate = 8000, n = rate;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write("data", 36); buf.writeUInt32LE(n, 40);
  buf.fill(128, 44);
  const p = path.join(OUT, "silence.wav");
  writeFileSync(p, buf);
  return p;
}

const BODY = `I keep catching myself saying "someday." Someday I'll slow down. Someday I'll take the trip. Someday I'll call him back.

[COL: the moment you noticed you were doing this]

${Array.from({ length: 18 }, () => "This paragraph stands in for the real essay so the acceptance test has enough words to pass the checklist.").join(" ")}

> A quotation block, to check styling.

What I don't know yet is whether wanting a bigger future and enjoying this one can live in the same person.`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
let issueUrl = "";
let slug = "";

try {
  await step("1. Create the studio owner via /studio/setup", async () => {
    await page.goto(`${BASE}/studio/setup`);
    await page.fill("#token", TOKEN);
    await page.fill("#email", "col@example.com");
    await page.fill("#password", "a-very-long-passphrase");
    await page.click("text=Create account");
    await page.waitForURL(/\/studio\?welcome=1/);
    await page.getByText("Getting set up").waitFor();
    await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
  });

  await step("2. Configure sender identity (CASL fields)", async () => {
    await page.goto(`${BASE}/studio/settings`);
    await page.fill("#senderName", "Col from The Dash");
    await page.fill("#senderEmail", "letters@example.com");
    await page.fill("#replyToEmail", "col@example.com");
    await page.fill("#contactEmail", "col@example.com");
    await page.fill("#mailingAddress", "PO Box 123\nToronto ON M5V 1A1\nCanada");
    await page.locator("#sender").getByRole("button", { name: "Save" }).click();
    await page.locator("#sender").getByText("Saved.").waitFor();
  });

  await step("3. Capture a text thought in under 30 seconds", async () => {
    const t0 = Date.now();
    await page.goto(`${BASE}/studio/inbox`);
    await page.fill("#capture-content", "Someday is where I park the things I say matter most. Why do I keep postponing the present for a future version of me?");
    await page.click("text=Save to inbox");
    await page.getByText("Captured.").waitFor();
    if (Date.now() - t0 > 30000) throw new Error("Capture took longer than 30s");
  });

  await step("4. Upload an audio note: original preserved; transcription state reported honestly", async () => {
    await page.goto(`${BASE}/studio/inbox`);
    await page.setInputFiles('input[name="audio"]', silentWav());
    await page.click("text=Save to inbox");
    await page.getByText(/Saved\./).waitFor();
    await page.getByRole("link", { name: "Open" }).click();
    await page.locator("audio").first().waitFor();
    await page.getByText(/Transcription isn.t configured|transcrib/i).first().waitFor();
  });

  await step("5. Turn a thought into an idea", async () => {
    await page.goto(`${BASE}/studio/inbox?q=Someday`);
    await page.locator("ul a", { hasText: "Someday is where" }).first().click();
    await page.click("text=Turn into an idea");
    await page.waitForURL(/\/studio\/ideas\//);
    await page.getByRole("heading", { name: "Editorial partner" }).waitFor();
    await page.getByText("AI not configured").waitFor();
  });

  await step("6. Seeded concept 001 is ready for an interview", async () => {
    await page.goto(`${BASE}/studio/ideas?view=list&sort=concept`);
    await page.getByText("Someday Is a Dangerous Place to Put Your Happiness").first().click();
    await page.getByText("Concept 001").waitFor();
    await page.getByText(/Write it myself/).waitFor();
  });

  await step("7. Start the issue and write in the editor (autosave)", async () => {
    await page.click("text=Write it myself →");
    await page.waitForURL(/\/studio\/issues\//);
    issueUrl = page.url();
    await page.fill("#ed-body", BODY);
    await page.fill("#ed-close", "What are you postponing until someday?");
    await page.fill("#ed-subject", "Someday is a dangerous place");
    await page.fill("#ed-preview", "On the habit of postponing the present.");
    await page.getByText(/^Saved \d/).waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${OUT}/02-editor.png`, fullPage: false });
  });

  await step("8. Preview as web and as email (desktop + mobile)", async () => {
    await page.click("role=tab[name='Email · mobile']");
    const frame = page.frameLocator("iframe[title='Preview']");
    await frame.getByText("Unsubscribe").waitFor();
    await frame.getByText("PO Box 123").waitFor();
    await page.screenshot({ path: `${OUT}/03-email-mobile.png` });
    await page.click("role=tab[name='Web preview']");
    await page.frameLocator("iframe[title='Preview']").getByText("Something to sit with").waitFor();
    await page.click("role=tab[name='Write']");
  });

  await step("9. Send a test email (simulated, clearly labelled)", async () => {
    await page.reload();
    await page.click("text=Send test");
    await page.getByText(/Simulated test to 1 address/).waitFor({ timeout: 15000 });
  });

  await step("10. Broadcast is blocked before approval", async () => {
    await page.reload();
    await page.getByText("Approve the final version to unlock sending.").waitFor();
  });

  await step("11. Approval is refused while [COL: …] placeholders remain, then succeeds", async () => {
    await page.click("text=Approve this version");
    await page.getByText(/Fill or remove 1 placeholder/).waitFor();
    await page.fill("#ed-body", BODY.replace(/\[COL:[^\]]*\]/, "It was a Tuesday when I noticed."));
    await page.getByText(/^Saved \d/).waitFor({ timeout: 10000 });
    await page.reload();
    await page.click("text=Approve this version");
    await page.getByText("Any edit removes approval.").waitFor();
  });

  await step("12. Add a consented subscriber (with evidence)", async () => {
    await page.goto(`${BASE}/studio/subscribers`);
    await page.click("text=Add a subscriber by hand");
    await page.fill("#a-email", "reader@example.com");
    await page.fill("#a-evidence", "Asked to be added at the March community dinner; confirmed by text.");
    await page.click("text=Add subscriber");
    await page.getByText("Added reader@example.com.").waitFor();
  });

  await step("13. Send to the consented list with typed confirmation (simulated)", async () => {
    await page.goto(issueUrl);
    await page.fill("#confirmation", "SEND 2");
    await page.click("text=Simulate send");
    await page.getByText(/Type "SEND 1" exactly/).waitFor();
    await page.fill("#confirmation", "SEND 1");
    await page.click("text=Simulate send");
    await page.getByText(/Broadcast sent/).waitFor({ timeout: 15000 });
  });

  await step("14. Publish to the public archive", async () => {
    await page.reload();
    await page.click("text=Publish to website");
    await page.getByText(/Live since/).waitFor();
    const link = page.locator("#web").locator("..").getByRole("link", { name: /\/issues\// });
    slug = (await link.textContent()).split("/issues/")[1].trim();
  });

  await step("15. Review delivery results and log reader feedback", async () => {
    await page.reload();
    await page.getByText("Simulated: no email was delivered.").first().waitFor();
    await page.goto(`${BASE}/studio/analytics`);
    await page.getByText("No email provider is connected").waitFor();
    await page.locator('textarea[name="content"]').fill("Sam replied: this one landed. Wants a follow-up on ambition vs. presence.");
    await page.click("text=Log it");
    await page.getByText("Logged.").waitFor();
    await page.screenshot({ path: `${OUT}/04-analytics.png`, fullPage: true });
  });

  await step("16. Save a LinkedIn derivative linked to the issue (manual; AI optional)", async () => {
    await page.goto(issueUrl);
    await page.locator("#new-kind").selectOption("linkedin");
    await page.locator("#new-kind").locator("..").locator('textarea[name="content"]').fill("I keep catching myself saying someday…");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Saved.").first().waitFor();
  });

  await step("17. Public site renders the published issue (desktop)", async () => {
    const pub = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await pub.goto(`${BASE}/`);
    await pub.getByRole("heading", { name: "The latest letter" }).waitFor();
    await pub.screenshot({ path: `${OUT}/05-home.png`, fullPage: true });
    await pub.goto(`${BASE}/issues/${slug}`);
    await pub.getByText("Something to sit with").waitFor();
    const canonical = await pub.locator('link[rel="canonical"]').getAttribute("href");
    if (!canonical?.endsWith(`/issues/${slug}`)) throw new Error(`Bad canonical: ${canonical}`);
    await pub.screenshot({ path: `${OUT}/06-issue.png`, fullPage: true });
    const rss = await (await fetch(`${BASE}/rss.xml`)).text();
    if (!rss.includes(slug)) throw new Error("RSS missing issue");
    await pub.close();
  });

  await step("18. Public site on a phone + subscribe with consent", async () => {
    const m = await browser.newContext({ ...devices["iPhone 13"] });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/issues/${slug}`);
    await mp.screenshot({ path: `${OUT}/07-issue-mobile.png`, fullPage: false });
    await mp.goto(`${BASE}/subscribe`);
    await mp.fill('input[name="email"]', "new.reader@example.com");
    // Consent checkbox is required (browser blocks submission until ticked; server re-validates).
    if ((await mp.locator('input[name="consent"]').getAttribute("required")) === null) throw new Error("consent not required");
    await mp.check('input[name="consent"]');
    await mp.click("text=Subscribe to The Dash");
    await mp.getByText(/Check your inbox/).waitFor();
    await m.close();
  });

  await step("19. Studio works on a phone (capture screen)", async () => {
    const m = await browser.newContext({ ...devices["iPhone 13"], storageState: await ctx.storageState() });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/studio/inbox`);
    await mp.getByText("Record voice note").waitFor();
    await mp.screenshot({ path: `${OUT}/08-studio-mobile.png`, fullPage: false });
    await m.close();
  });

  await step("20. Studio is private when signed out", async () => {
    const anon = await browser.newPage();
    await anon.goto(`${BASE}/studio/issues`);
    await anon.waitForURL(/\/studio\/login/);
    const audio = await fetch(`${BASE}/api/audio/00000000-0000-0000-0000-000000000000`);
    if (audio.status !== 404) throw new Error("audio endpoint not protected");
    const exp = await fetch(`${BASE}/studio/subscribers/export`, { redirect: "manual" });
    if (exp.status === 200 && (await exp.text()).includes("@")) throw new Error("subscriber export leaked");
    await anon.close();
  });
} finally {
  await browser.close();
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  process.exitCode = failed ? 1 : 0;
}
