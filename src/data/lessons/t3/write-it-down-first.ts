import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't3.l1',
  slug: 'write-it-down-first',
  trackId: 't3',
  index: 1,
  title: 'Write It Down First',
  minutes: 14,
  hook: 'The WAL rule: log before data, steal and no-force — and why one ordering constraint buys durability and speed at once. Then lab 03, where the grader kills you mid-write.',
  exercise: 'code',
  blocks: [
    {
      type: 'callout',
      variant: 'info',
      title: 'in development',
      md: 'This lesson is being written — the outline below is the contract it will teach to.',
    },
    {
      type: 'prose',
      md: `## What this lesson will cover

- The problem: dirty pages in the buffer pool are uncommitted truth; a crash must not publish them, and must not lose committed ones either.
- Steal + no-force: the buffer policy that makes WAL necessary — and worth it.
- The log record: LSN, txn id, page id, before/after — the journal your intentions live in.
- **Lab 03 — wal:** log writer + recovery, graded by killing the module mid-flush at random points.`,
    },
  ],
}

export default lesson
