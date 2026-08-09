import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't5.l1',
  slug: 'pull-not-push',
  trackId: 't5',
  index: 1,
  title: 'Pull, Not Push',
  minutes: 14,
  hook: 'The volcano model: open/next/close, pipelining, and why every executor you have ever used is the same six iterators. Then lab 05 — over your own pages and tree.',
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

- The iterator interface: \`open / next / close\` — composable, pipelined, and forty years old.
- A plan as a tree of pulls: SeqScan → Filter → Project → Limit, one \`next()\` deep.
- Materialization points: where the pipeline must stop and buffer (sorts, hash builds).
- **Lab 05 — volcano:** your executor over your lab-01 pages and lab-02 tree, tuple-checked against a reference.`,
    },
  ],
}

export default lesson
