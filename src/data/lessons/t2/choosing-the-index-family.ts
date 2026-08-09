import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l4',
  slug: 'choosing-the-index-family',
  trackId: 't2',
  index: 4,
  title: 'Choosing the Index Family',
  minutes: 11,
  hook: 'B+tree vs LSM vs hash vs ART: workload shapes, amplification math, and the honest decision table — no slogans.',
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

- The workload questions that decide: read:write ratio, point vs range, update-in-place tolerance.
- Hash indexes: O(1) and useless for ranges — a specialist, not a default.
- ART/tries: prefix compression for memory-resident speed, and why they live inside bigger systems.
- The decision table: given a workload, name the family and defend it with amplification math.`,
    },
  ],
}

export default lesson
