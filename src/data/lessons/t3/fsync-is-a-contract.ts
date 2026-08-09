import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't3.l3',
  slug: 'fsync-is-a-contract',
  trackId: 't3',
  index: 3,
  title: 'fsync Is a Contract',
  minutes: 12,
  hook: 'Group commit, durability levels, and what your drive actually promised: the throughput numbers live in the flush policy, and some of them are lies.',
  exercise: 'read+quiz',
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

- What fsync really does (and what drive firmware sometimes pretends it did).
- Group commit: amortize the flush across many txns — the queueing trick behind every commit-rate benchmark.
- The durability dial: synchronous_commit and its cousins — exactly which crashes each level survives.
- Reading a commit-latency p99: the flush is the tail.`,
    },
  ],
}

export default lesson
