import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l3',
  slug: 'when-a-row-outgrows-its-page',
  trackId: 't1',
  index: 3,
  title: 'When a Row Outgrows Its Page',
  minutes: 11,
  hook: 'Overflow pages and the TOAST pattern: oversized values, out-of-line storage, compression, and the update that has to move.',
  exercise: 'read',
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

- The 8KB ceiling problem: a 1MB JSON document in an 8KB world.
- The TOAST move: compress, then out-of-line — the main page keeps a pointer, the value lives on overflow pages.
- Why overflow storage is transparent to scans and painful to random access.
- The update that has to move: growth, redirects, and what it costs your indexes.`,
    },
  ],
}

export default lesson
