export const site = {
  name: 'The Dash',
  author: 'Col',
  tagline: 'Notes on how to live, from the space between the dates.',
  description:
    'A letter every other Sunday: one idea I am working through, what I am learning, and a question for you.',
  signoff: 'Until next time,',
  pillars: ['Philosophy', 'Learning', 'Living', 'Noticing'] as const,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
}
