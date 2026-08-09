import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't6.l3',
  slug: 'recall-is-a-curve',
  trackId: 't6',
  index: 3,
  title: 'Recall Is a Curve, Not a Number',
  minutes: 13,
  hook: 'ef_search sweeps, filtered ANN and iterative scans, pgvector vs purpose-built — and the capstone question: build, tune, or buy.',
  exercise: 'read+quiz',
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

- Measuring honestly: recall@k against brute-force ground truth, p50/p99 latency, one curve per configuration.
- The filtered-ANN cliff: post-filtering starves the walk — and the fixes (iterative scans, in-graph filtering).
- pgvector vs purpose-built: what you actually pay for in a dedicated vector DB, and when it's worth it.
- The capstone business case: 5M embeddings, an SLO, a price sheet — answered from YOUR measurements.`,
    },
  ],
}

export default lesson
