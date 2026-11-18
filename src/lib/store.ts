import { useEffect, useState } from 'react'

export type Stage = 'seed' | 'sprouting' | 'ready' | 'used'

export interface Idea {
  id: string
  text: string
  notes: string
  pillar: string
  stage: Stage
  createdAt: string
}

export interface Link {
  title: string
  url: string
  why: string
}

export interface Issue {
  id: string
  number: number
  status: 'draft' | 'sent'
  subject: string
  subjectAlts: string[]
  preview: string
  opening: string
  bigIdeaTitle: string
  bigIdea: string
  learning: string
  links: Link[]
  question: string
  checklist: Record<string, boolean>
  sentAt?: string
  stats: { recipients: number; opens: number; clicks: number; replies: number; unsubs: number; newSubs: number }
  lesson: string
  ideaId?: string
}

export interface Settings {
  name: string
  author: string
  why: string
  signoff: string
  pillars: string[]
  cadenceDays: number
  accent: string
}

export interface Data {
  settings: Settings
  ideas: Idea[]
  issues: Issue[]
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const STAGES: { key: Stage; label: string; emoji: string }[] = [
  { key: 'seed', label: 'Seed', emoji: '🌱' },
  { key: 'sprouting', label: 'Sprouting', emoji: '🌿' },
  { key: 'ready', label: 'Ready', emoji: '🌳' },
  { key: 'used', label: 'Published', emoji: '📬' },
]

export const CHECKLIST = [
  'I can state the big idea in one sentence',
  'The first line makes you want to read the second',
  'I cut at least 20%',
  'There is a specific story or example',
  'Every link has a "why"',
  'There is one clear question inviting replies',
  "I'd open this subject line from someone else",
  'Preview text is filled in',
  'I read it out loud once',
  'I sent a test to myself and checked it on my phone',
]

export const emptyIssue = (number: number): Issue => ({
  id: uid(),
  number,
  status: 'draft',
  subject: '',
  subjectAlts: ['', ''],
  preview: '',
  opening: '',
  bigIdeaTitle: '',
  bigIdea: '',
  learning: '',
  links: [{ title: '', url: '', why: '' }],
  question: '',
  checklist: {},
  stats: { recipients: 0, opens: 0, clicks: 0, replies: 0, unsubs: 0, newSubs: 0 },
  lesson: '',
})

const starterIssue: Issue = {
  ...emptyIssue(1),
  subject: "Why I'm starting this",
  subjectAlts: ['A letter instead of a post', 'Something small, every two weeks'],
  preview: 'A short note on what this is, and why you got it.',
  opening:
    "Hi, it's me. You're getting this because you're one of the people I'm closest to, and I wanted to try something. [Write 1 to 2 sentences about what's going on in your life right now.]",
  bigIdeaTitle: 'Why write letters in 2026',
  bigIdea: `[**The moment:** What made you decide to start this? A specific moment, a conversation, a feeling.]

[**The tension:** What's missing in how you usually share thoughts with people (social media, group chats, being busy)?]

[**The insight:** What do you believe writing this down and sharing it will do, for you and for them?]

[**The practice:** What will this actually look like? One idea every other Sunday, things you're learning, things worth their time.]

[**The open edge:** Be honest. What are you unsure about? That it'll be interesting? That you'll keep it up? Say so.]`,
  learning: '- [A book, idea or skill you are in the middle of, and one line on what it is teaching you]',
  links: [{ title: '[Something you read, watched or listened to recently]', url: 'https://', why: '[One sentence on why it is worth their time]' }],
  question: "What's one thing you've been thinking about lately? Hit reply. I'll read every one.",
}

const starterIdeas: Idea[] = [
  { text: "Why I'm starting this newsletter", notes: 'Issue #1', pillar: 'Philosophy', stage: 'used' },
  { text: 'A belief I held strongly five years ago that I no longer hold', notes: '', pillar: 'Philosophy', stage: 'seed' },
  { text: "The best advice I've ever ignored (and what happened)", notes: '', pillar: 'Living', stage: 'seed' },
  { text: "What I'm learning from the book I'm reading right now", notes: '', pillar: 'Learning', stage: 'seed' },
  { text: 'A small daily moment I never want to stop noticing', notes: '', pillar: 'Noticing', stage: 'seed' },
].map((i) => ({ ...i, id: uid(), createdAt: new Date().toISOString() }) as Idea)

export const defaultData = (): Data => ({
  settings: {
    name: 'Field Notes',
    author: 'Your Name',
    why: 'I write this to think more clearly about how to live, and to share what I find with the people I care about.',
    signoff: 'Until next time,',
    pillars: ['Philosophy', 'Learning', 'Living', 'Noticing'],
    cadenceDays: 14,
    accent: '#b4532a',
  },
  ideas: starterIdeas,
  issues: [{ ...starterIssue, ideaId: starterIdeas[0].id }],
})

const KEY = 'newsletter-studio-v1'

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultData(), ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return defaultData()
}

export function useData() {
  const [data, setData] = useState<Data>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* storage unavailable */
    }
  }, [data])
  return [data, setData] as const
}
