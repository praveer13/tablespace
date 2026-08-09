import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l4',
  slug: 'eviction-is-a-bet',
  trackId: 't0',
  index: 4,
  title: 'Eviction Is a Bet',
  minutes: 12,
  hook: 'LRU, clock-sweep, and the sequential-flood problem: eviction policies are predictions about your workload\'s future.',
  exercise: 'sim',
  simId: 'engine',
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

- LRU and its failure mode: one big scan evicts a working set it will never touch again.
- Clock-sweep / second chance: the approximation every real engine ships, usage bits and all.
- Scan resistance: Postgres's ring buffer, InnoDB's midpoint insertion — scan-aware eviction by construction.
- In The Engine: replay the same trace under LRU and clock-sweep and watch the hit-rate curves diverge.`,
    },
  ],
}

export default lesson
