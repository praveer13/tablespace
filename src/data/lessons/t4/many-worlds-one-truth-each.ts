import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l1',
  slug: 'many-worlds-one-truth-each',
  trackId: 't4',
  index: 1,
  title: 'Many Worlds, One Truth Each',
  minutes: 14,
  hook: 'Version chains and snapshots: how readers never block writers, and what a transaction can see at every instant. Then lab 04, under a deterministic scheduler.',
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

- The MVCC move: UPDATE appends a new version; the old one stays for whoever can still see it.
- xmin/xmax and the visibility rule: a version exists for you iff its creator committed before your snapshot and its deleter hadn't.
- Snapshots: a timestamp plus a list of in-flight txns — cheap to take, exact to evaluate.
- **Lab 04 — mvcc:** your versioned store, graded against a serial reference under enumerated interleavings.`,
    },
  ],
}

export default lesson
