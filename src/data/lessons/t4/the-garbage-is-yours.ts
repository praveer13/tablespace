import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l4',
  slug: 'the-garbage-is-yours',
  trackId: 't4',
  index: 4,
  title: 'The Garbage Is Yours',
  minutes: 12,
  hook: 'Dead tuples, vacuum, freezing, and hot-page contention: the operational tax MVCC never mentions in the brochure.',
  exercise: 'quiz',
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

- Where dead tuples come from: every UPDATE and DELETE under MVCC leaves a body.
- Vacuum: who can still see this version? — the oldest-open-snapshot watermark, and how one forgotten txn pins everything.
- Bloat as a performance tax: scans wade through the dead; indexes point at corpses.
- Hot pages and latch contention: when every writer wants the same page, the engine serializes — Crash Week's INC-3.`,
    },
  ],
}

export default lesson
