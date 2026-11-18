/**
 * Privacy policy TEMPLATE. This is a starting point, not legal advice.
 * Review it (ideally with a lawyer familiar with PIPEDA and CASL) before relying on it.
 */
export const PRIVACY_TEMPLATE = `_Last updated: [DATE]_

The Dash is a personal newsletter written by {{author}}{{brandClause}}. This page explains what information is collected when you subscribe or read, why, and what you can do about it.

## Who is responsible

{{author}} is responsible for the personal information described here. Contact: {{contact}}. Mailing address: {{address}}.

## What we collect

- **When you subscribe:** your email address, your first name if you choose to give it, the date and time you subscribed, the page you subscribed from, and a record of the consent statement you agreed to. When you confirm your subscription we record the time, IP address and browser information of that confirmation as evidence of consent.
- **When we send letters:** delivery status from our email provider (for example: delivered, bounced, or marked as spam) and, where the provider supports it, whether links were clicked. Open tracking is unreliable and we treat it as approximate at best.
- **When you read on the website:** a count of page views by page address. We do not set tracking cookies, and we don't store your IP address for page views.
- **When you reply:** whatever you choose to write to us.

## Why

To send you the newsletter you asked for, to prove you consented (as required by Canada's Anti-Spam Legislation, CASL), to stop sending to addresses that bounce or complain, and to understand in broad terms what readers find valuable.

## Who we share it with

We don't sell, rent or trade your information. We use a small number of service providers to operate the newsletter: an email delivery provider ({{emailProvider}}), a hosting provider, and a database provider. They process data on our behalf and may store it outside Canada (for example, in the United States).

If AI tools are used to help draft letters, subscriber information is **not** sent to them.

## How long we keep it

While you're subscribed, and for a reasonable period afterwards to keep a record of your consent and unsubscribe request (so we never email you again by mistake).

## Your choices

- **Unsubscribe** at any time using the link at the bottom of every letter. It takes effect immediately.
- **Update your preferences** from the "Email preferences" link in any letter.
- **Access or delete your information** by writing to {{contact}}. We'll respond within 30 days.

## Changes

If this policy changes in a meaningful way, we'll say so in a letter.
`;

export function fillPrivacyTemplate(t: string, v: { author: string; brand: string; contact: string; address: string; emailProvider: string }) {
  return t
    .replaceAll("{{author}}", v.author)
    .replaceAll("{{brandClause}}", v.brand ? `, as part of ${v.brand}` : "")
    .replaceAll("{{contact}}", v.contact || "[CONTACT EMAIL]")
    .replaceAll("{{address}}", v.address || "[MAILING ADDRESS]")
    .replaceAll("{{emailProvider}}", v.emailProvider);
}
