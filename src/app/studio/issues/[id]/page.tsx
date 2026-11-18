import { notFound } from 'next/navigation'
import { getIssue, getSources } from '@/lib/issues'
import { requireStudio } from '@/lib/session'
import { site } from '@/lib/site'
import { uuid } from '@/lib/validation'
import { emailConfig } from '@/lib/mailer'
import { activeSubscriberCount, getSendSummary } from '@/lib/sending'
import { IssueEditor } from './IssueEditor'
import { SendPanel } from './SendPanel'

export const metadata = { title: 'Edit letter' }

export default async function EditIssuePage(props: PageProps<'/studio/issues/[id]'>) {
  await requireStudio()
  const { id } = await props.params
  if (!uuid.safeParse(id).success) notFound()
  const issue = await getIssue(id)
  if (!issue) notFound()
  const [sources, send, activeCount] = await Promise.all([getSources(id), getSendSummary(id), activeSubscriberCount()])
  const testIsCurrent = !!(issue.test_sent_at && issue.approved_at && issue.test_sent_at >= issue.approved_at)

  return (
    <IssueEditor
      siteUrl={site.url}
      issue={{
        id: issue.id,
        number: issue.number,
        slug: issue.slug,
        status: issue.status,
        subject: issue.subject,
        preview: issue.preview,
        title: issue.title,
        opening: issue.opening,
        body: issue.body,
        learning: issue.learning,
        links: issue.links,
        question: issue.question,
        updatedAt: issue.updated_at.toISOString(),
      }}
      sources={sources.map((s) => ({ id: s.id, body: s.body, kind: s.kind, pillar: s.pillar }))}
      sendPanel={
        <SendPanel
          issueId={issue.id}
          status={issue.status}
          ownerEmail={emailConfig().owner ?? null}
          testIsCurrent={testIsCurrent}
          activeCount={activeCount}
          send={send && { id: send.id, status: send.status, recipients: send.recipients, createdAt: send.created_at.toISOString(), counts: send.counts }}
        />
      }
    />
  )
}
