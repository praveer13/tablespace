import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't5.l2',
  slug: 'three-ways-to-join',
  trackId: 't5',
  index: 2,
  title: 'Three Ways to Join',
  minutes: 13,
  hook: 'Nested-loop, hash, merge: each join\'s cost in I/Os and memory, and the cardinalities that decide between them.',
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

- Nested-loop join: cheap per outer row, fatal per outer million — unless an index saves it.
- Hash join: build once, probe streaming; the memory cliff and the graceful spill.
- Merge join: two sorted inputs, one walk — and why sorting first sometimes still wins.
- Reading the join choice out of EXPLAIN and pricing it yourself.`,
    },
  ],
}

export default lesson
