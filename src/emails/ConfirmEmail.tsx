import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

const serif = "Georgia, 'Times New Roman', serif"
const sans = 'Helvetica, Arial, sans-serif'

export default function ConfirmEmail({ siteName, author, confirmUrl, description }: { siteName: string; author: string; confirmUrl: string; description: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>One click to confirm, then you&apos;re in.</Preview>
      <Body style={{ backgroundColor: '#f4efe6', margin: 0, padding: '32px 12px' }}>
        <Container style={{ maxWidth: 520, backgroundColor: '#fffdf8', borderRadius: 4, padding: '40px' }}>
          <Text style={{ fontFamily: sans, fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', color: '#857d73', margin: 0 }}>{siteName}</Text>
          <Heading as="h1" style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, color: '#1c1917', margin: '12px 0 20px' }}>Please confirm your subscription</Heading>
          <Text style={{ fontFamily: serif, fontSize: 17, lineHeight: '1.7', color: '#33302c' }}>{description}</Text>
          <Button href={confirmUrl} style={{ backgroundColor: '#1c1917', color: '#fffdf8', fontFamily: sans, fontSize: 15, padding: '12px 22px', borderRadius: 6, margin: '12px 0 20px' }}>
            Yes, send me {siteName}
          </Button>
          <Text style={{ fontFamily: sans, fontSize: 13, lineHeight: '1.6', color: '#857d73' }}>
            If you didn&apos;t ask for this, ignore this email and you won&apos;t hear from {author} again. The link expires in 48 hours.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
