import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l2',
  slug: 'the-cost-model-of-reality',
  trackId: 't0',
  index: 2,
  title: 'The Cost Model of Reality',
  minutes: 12,
  hook: 'Random vs sequential I/O, HDD physics vs SSD truth, and the orders-of-magnitude table every query planner secretly carries.',
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

- The numbers: ns → µs → ms across L1/L2/DRAM/NVMe/HDD, and why the gap IS the subject.
- HDD truth: seek + rotate = the most expensive milliseconds in computing; sequential is 100× random.
- SSD truth: no seek, but not free — pages, erase blocks, write amplification at the hardware layer.
- Why "the planner guessed wrong" is usually "the cost constants stopped matching your disk".`,
    },
  ],
}

export default lesson
