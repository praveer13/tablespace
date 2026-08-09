import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l2',
  slug: 'the-anomaly-zoo',
  trackId: 't4',
  index: 2,
  title: 'The Anomaly Zoo',
  minutes: 13,
  hook: 'Dirty reads to write skew: the isolation levels as a menu of which anomalies your application can afford — named, shown, and priced.',
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

- The gallery: dirty read, non-repeatable read, phantom, lost update, write skew — each as a two-txn comic strip.
- The SQL standard levels vs what engines actually implement (Postgres's "repeatable read" is stronger than the name).
- Snapshot isolation's blind spot: write skew, the anomaly that passes code review.
- Choosing a level: which anomalies your invariants actually depend on.`,
    },
  ],
}

export default lesson
