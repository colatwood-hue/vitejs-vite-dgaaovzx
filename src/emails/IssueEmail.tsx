import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from '@react-email/components'
import type { IssueLink } from '@/lib/issues'

export interface IssueEmailProps {
  siteName: string
  author: string
  signoff: string
  number: number
  title: string
  preview: string
  opening: string
  bodyHtml: string
  learning: string
  links: IssueLink[]
  question: string
  webUrl?: string
  unsubscribeUrl?: string
}

const c = {
  bg: '#f4efe6',
  paper: '#fffdf8',
  ink: '#1c1917',
  body: '#33302c',
  muted: '#857d73',
  line: '#e7dfd2',
  accent: '#9a3412',
}
const serif = "Georgia, 'Times New Roman', serif"
const sans = 'Helvetica, Arial, sans-serif'

const label = { fontFamily: sans, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' as const, color: c.accent, fontWeight: 700, margin: '36px 0 12px' }
const para = { fontFamily: serif, fontSize: 18, lineHeight: '1.7', color: c.body, margin: '0 0 18px' }

/** Body HTML is generated server-side from the schema-constrained editor doc; style it for email clients. */
function styleBody(html: string) {
  return html
    .replace(/<p>/g, `<p style="font-family:${serif};font-size:18px;line-height:1.7;color:${c.body};margin:0 0 18px;">`)
    .replace(/<h2>/g, `<h2 style="font-family:${serif};font-size:22px;line-height:1.3;color:${c.ink};margin:32px 0 12px;font-weight:600;">`)
    .replace(/<h3>/g, `<h3 style="font-family:${serif};font-size:19px;color:${c.ink};margin:28px 0 10px;font-weight:600;">`)
    .replace(/<(ul|ol)>/g, `<$1 style="font-family:${serif};font-size:18px;line-height:1.7;color:${c.body};margin:0 0 18px;padding-left:24px;">`)
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 18px;padding:2px 0 2px 18px;border-left:3px solid ${c.accent};font-style:italic;color:${c.muted};">`)
    .replace(/<a /g, `<a style="color:${c.accent};text-decoration:underline;" `)
    .replace(/<hr>/g, `<hr style="border:none;border-top:1px solid ${c.line};margin:28px 0;">`)
}

const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

export default function IssueEmail(p: IssueEmailProps) {
  const links = p.links.filter((l) => l.url && l.title)
  const learning = p.learning.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  return (
    <Html lang="en">
      <Head />
      <Preview>{p.preview}</Preview>
      <Body style={{ backgroundColor: c.bg, margin: 0, padding: '32px 12px' }}>
        <Container style={{ maxWidth: 600, backgroundColor: c.paper, borderRadius: 4, padding: '44px 44px 12px' }}>
          <Text style={{ fontFamily: sans, fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', color: c.muted, margin: 0 }}>
            {p.siteName} &nbsp;·&nbsp; No. {p.number}
          </Text>
          <Heading as="h1" style={{ fontFamily: serif, fontSize: 34, lineHeight: '1.2', fontWeight: 400, color: c.ink, margin: '14px 0 30px' }}>
            {p.title}
          </Heading>
          {paragraphs(p.opening).map((t, i) => (
            <Text key={i} style={{ ...para, fontStyle: 'italic', color: c.muted }}>{t}</Text>
          ))}
          <Hr style={{ borderColor: c.line, margin: '30px 0' }} />
          <Section>
            <div dangerouslySetInnerHTML={{ __html: styleBody(p.bodyHtml) }} />
          </Section>

          {learning.length > 0 && (
            <>
              <Text style={label}>What I&apos;m learning</Text>
              {learning.map((l, i) => (
                <Text key={i} style={{ ...para, margin: '0 0 10px' }}>— {l}</Text>
              ))}
            </>
          )}

          {links.length > 0 && (
            <>
              <Text style={label}>Worth your time</Text>
              {links.map((l, i) => (
                <Text key={i} style={{ ...para, margin: '0 0 14px' }}>
                  <Link href={l.url} style={{ color: c.accent, fontWeight: 700 }}>{l.title}</Link>
                  {l.why ? ` — ${l.why}` : ''}
                </Text>
              ))}
            </>
          )}

          {p.question && (
            <>
              <Text style={label}>A question for you</Text>
              <Section style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.accent}`, padding: '16px 20px' }}>
                <Text style={{ ...para, margin: 0 }}>{p.question}</Text>
                <Text style={{ fontFamily: sans, fontSize: 13, color: c.muted, margin: '8px 0 0' }}>Just hit reply. I read every one.</Text>
              </Section>
            </>
          )}

          <Text style={{ ...para, margin: '36px 0 2px' }}>{p.signoff}</Text>
          <Text style={{ ...para, margin: '0 0 36px' }}>{p.author}</Text>

          <Hr style={{ borderColor: c.line, margin: 0 }} />
          <Text style={{ fontFamily: sans, fontSize: 12, lineHeight: '1.6', color: c.muted, margin: '18px 0 24px' }}>
            You&apos;re getting this because you asked to hear from me.
            {p.webUrl && <> <Link href={p.webUrl} style={{ color: c.muted }}>Read on the web</Link>.</>}
            {p.unsubscribeUrl && <> <Link href={p.unsubscribeUrl} style={{ color: c.muted }}>Unsubscribe</Link>.</>}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
