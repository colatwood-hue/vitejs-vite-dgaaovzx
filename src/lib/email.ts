import 'server-only'
import { render } from '@react-email/render'
import IssueEmail from '@/emails/IssueEmail'
import type { Issue } from './issues'
import { docToHtml } from './render'
import { site } from './site'

export function issueEmailProps(issue: Issue) {
  return {
    siteName: site.name,
    author: site.author,
    signoff: site.signoff,
    number: issue.number,
    title: issue.title || issue.subject || 'Untitled',
    preview: issue.preview,
    opening: issue.opening,
    bodyHtml: docToHtml(issue.body),
    learning: issue.learning,
    links: issue.links,
    question: issue.question,
    webUrl: issue.status === 'published' ? `${site.url}/issues/${issue.slug}` : undefined,
  }
}

export const renderIssueEmail = (issue: Issue) => render(IssueEmail(issueEmailProps(issue)))
export const renderIssueText = (issue: Issue) => render(IssueEmail(issueEmailProps(issue)), { plainText: true })
