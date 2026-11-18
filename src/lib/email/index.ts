import { env } from "@/lib/env";
import type { EmailProvider } from "./provider";
import { ResendProvider } from "./resend";
import { SimulatedProvider } from "./simulated";

let override: EmailProvider | null = null;

/** Tests can inject a fake provider. */
export function setEmailProviderForTests(p: EmailProvider | null) {
  override = p;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  switch (env.emailProvider()) {
    case "resend":
      return new ResendProvider();
    case "console":
    case "":
      return new SimulatedProvider();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${env.emailProvider()}". Use "resend" or "console".`);
  }
}

export * from "./provider";
