import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l3',
  slug: 'an-operating-system-for-one-file',
  trackId: 't0',
  index: 3,
  title: 'An Operating System for One File',
  minutes: 14,
  hook: 'The buffer pool: frames, pins, dirty bits — and why the database distrusts the OS page cache it runs on top of.',
  exercise: 'quiz+sim',
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

- Frames, page table (the hash map kind), pin counts, dirty bits: the four fields that run the engine.
- Why not just \`mmap\`? The OS evicts on its schedule, flushes on its schedule, and knows nothing about your WAL.
- Hit rate as the engine's pulse: what 99% vs 90% vs 50% means in wall-clock terms.
- The Engine sim: watch a buffer pool take a trace — hit rate, eviction waves, dirty watermark.`,
    },
  ],
}

export default lesson
