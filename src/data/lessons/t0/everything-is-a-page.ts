import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l1',
  slug: 'everything-is-a-page',
  trackId: 't0',
  index: 1,
  title: 'Everything Is a Page',
  minutes: 12,
  hook: 'The atom of database storage: why engines read and write fixed-size pages, what 8KB buys you, and why "just read one row" is never one row.',
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

- Why the engine never reads a row: it reads the **page** the row lives on.
- The fixed-size decision — 8KB in Postgres, 16KB in InnoDB — and what it buys: one allocation size, one I/O unit, one unit of caching.
- Page == buffer-pool frame == WAL flush target: the one size the whole engine is organized around.
- The analogy you already own: virtual memory pages, and why your database is re-running the same argument for one very important file.`,
    },
  ],
}

export default lesson
