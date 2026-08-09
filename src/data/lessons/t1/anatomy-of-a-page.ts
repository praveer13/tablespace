import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l1',
  slug: 'anatomy-of-a-page',
  trackId: 't1',
  index: 1,
  title: 'Anatomy of a Page',
  minutes: 14,
  hook: 'Header, slot array, records growing the other way: the slotted-page layout that lets rows move without breaking every index. Then you build one — lab 01.',
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

- The slotted page: header up front, slot array growing down, record bytes growing up, free space in the middle.
- Why the indirection: a row can move inside the page (defrag, update) and only its slot changes — the (page, slot) tuple id stays stable.
- Line pointers, item flags, redirect marks: the tiny state machine of a slot.
- **Lab 01 — slotted-pages:** your page allocator, graded on byte-exact free-space accounting under a 2000-op storm.`,
    },
  ],
}

export default lesson
