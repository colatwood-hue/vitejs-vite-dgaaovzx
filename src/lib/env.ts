/** Central, typed access to configuration. Secrets stay server-side. */

export const env = {
  appUrl: () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  authSecret: () => {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be at least 32 characters");
      return "dev-only-insecure-secret-change-me-0000000000";
    }
    return s;
  },
  emailProvider: () => (process.env.EMAIL_PROVIDER ?? "console").toLowerCase(),
  allowBroadcasts: () => process.env.ALLOW_BROADCASTS === "true",
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  aiModel: () => process.env.AI_MODEL || "claude-opus-5-5",
  transcriptionProvider: () => (process.env.TRANSCRIPTION_PROVIDER ?? "").toLowerCase(),
  cronSecret: () => process.env.CRON_SECRET ?? "",
  setupToken: () => process.env.SETUP_TOKEN ?? "",
};
