import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't6.l1',
  slug: 'why-exact-neighbors-die',
  trackId: 't6',
  index: 1,
  title: 'Why Exact Neighbors Die',
  minutes: 13,
  hook: 'The curse of dimensionality: distance concentration, why every exact index degrades to a scan, and what "approximate" buys back.',
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

- What an embedding is to a storage engine: 768–3072 floats that only ever answer one question — "what's near this?"
- Distance concentration: in high dimensions, the farthest point stops being much farther than the nearest.
- Why kd-trees and friends degrade to scans beyond ~20 dimensions — exactness is the first casualty.
- The approximate bargain: trade a little recall for orders of latency — the trade the whole track prices.`,
    },
  ],
}

export default lesson
