import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l2',
  slug: 'splits-merges-staying-balanced',
  trackId: 't2',
  index: 2,
  title: 'Splits, Merges, and Staying Balanced',
  minutes: 13,
  hook: 'The insert that cascades to the root, the delete that forces a rebalance, and the occupancy proofs that keep the tree shallow — by construction.',
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

- Leaf split: divide, promote the separator, recurse up — why the root split is the only height increase.
- Minimum occupancy (the "at least half full" rule) and what it guarantees about height.
- Delete underflow: borrow from a sibling or merge — and why real engines often under-merge on purpose.
- The adversarial orders: ascending inserts (rightmost-leaf splits), descending, duplicates — each a different stress shape.`,
    },
  ],
}

export default lesson
