const styles = {
  draft: 'bg-wash text-ink-2',
  approved: 'bg-accent-soft text-accent',
  published: 'bg-ink text-sheet',
} as const

export function StatusBadge({ status }: { status: keyof typeof styles }) {
  return (
    <span data-testid="status" className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  )
}
