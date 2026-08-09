import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't3.l2',
  slug: 'crash-recover-repeat',
  trackId: 't3',
  index: 2,
  title: 'Crash, Recover, Repeat',
  minutes: 15,
  hook: 'LSNs, checkpoints, and ARIES: redo the winners, undo the losers — recovery as a deterministic replay, even if you crash mid-recovery.',
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

- Analysis, redo, undo: the three ARIES phases, and why redo repeats history unconditionally.
- Checkpoints: bounding recovery time without stopping the world — a bookmark, not a barrier.
- Idempotence as the core trick: replay the log twice, get the same state — the property the lab grades.
- Crashing mid-recovery is not an edge case; it is the design constraint.`,
    },
  ],
}

export default lesson
