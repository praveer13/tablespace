import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l4',
  slug: 'delete-is-a-promise',
  trackId: 't1',
  index: 4,
  title: 'Delete Is a Promise, Not an Erasure',
  minutes: 12,
  hook: 'Tombstones, free-space maps, and why "deleted" rows occupy disk until somebody does the accounting.',
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

- Why DELETE can't just erase: other snapshots may still see the row (T4's full story starts here).
- Tombstones and dead tuples: the difference between "gone" and "reclaimed".
- The free-space map: how the engine remembers which pages have room without scanning them.
- Space reuse in your lab-01 page: delete, defrag, insert into the hole — byte-exact, because the grader counts.`,
    },
  ],
}

export default lesson
