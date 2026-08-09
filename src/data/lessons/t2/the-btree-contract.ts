import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l1',
  slug: 'the-btree-contract',
  trackId: 't2',
  index: 1,
  title: 'The B+Tree Contract',
  minutes: 14,
  hook: 'Separators, fanout, and why every lookup costs exactly the same: the invariants that made this tree the default index for fifty years. Then you build one — lab 02.',
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

- Why a tree at all: sorted order + log-time descent + page-sized nodes = the index shape of reality.
- B+ vs B: records only in leaves, sibling links for scans, separators that are signposts not data.
- Fanout arithmetic: ~500 keys per page means 10M rows in 3–4 levels — two, maybe three I/Os.
- **Lab 02 — btree:** insert/scan/delete with splits and merges, graded under adversarial key orders.`,
    },
  ],
}

export default lesson
