import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l2',
  slug: 'what-a-tuple-costs',
  trackId: 't1',
  index: 2,
  title: 'What a Tuple Costs',
  minutes: 12,
  hook: 'Headers, null bitmaps, alignment, padding — the bytes you pay before your data starts, and why narrow tables are fast tables.',
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

- The tuple header: xmin/xmax (meet your MVCC plumbing early), ctid, infomask — ~23 bytes before your first column.
- Null bitmaps: one bit per nullable column, and why column ORDER changes the row size.
- Alignment and padding: the CPU's tax on your schema.
- Rows per page arithmetic: why "a billion rows" is really a statement about page count, cache, and I/O.`,
    },
  ],
}

export default lesson
