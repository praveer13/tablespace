import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l3',
  slug: 'conflicts-and-serializable-snapshots',
  trackId: 't4',
  index: 3,
  title: 'Conflicts and Serializable Snapshots',
  minutes: 12,
  hook: 'Write-write conflicts, optimistic vs pessimistic concurrency, and how SSI gets serializability without a lock manager.',
  exercise: 'read',
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

- Write-write conflict: two txns, one row — first-writer-wins, and why the second must fail or wait.
- Pessimistic (locks, deadlock detection) vs optimistic (validate at commit): the contention profile decides.
- SSI in one idea: track dangerous read→write dependency structures, abort only when the cycle is real.
- What "serializable" buys: your app reasons about txns one at a time — the most expensive sanity there is.`,
    },
  ],
}

export default lesson
