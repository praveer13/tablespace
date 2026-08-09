import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't6.l2',
  slug: 'hnsw-layer-by-layer',
  trackId: 't6',
  index: 2,
  title: 'HNSW, Layer by Layer',
  minutes: 15,
  hook: 'Skip lists reborn as graphs: entry points, greedy descent, neighbor selection — the index behind pgvector, honestly derived. Then you build one — lab 06.',
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

- Navigable small worlds: a graph where greedy walk reaches anywhere in ~log n hops.
- The layered trick: express lanes up top, dense streets at layer 0 — a skip list with graph edges.
- Insert: descend greedily, connect carefully (m neighbors, chosen for reachability, not just proximity).
- \`ef_search\`, \`m\`, \`ef_construction\` as physics: beam width, degree, build quality — each priced in recall and latency.
- **Lab 06 — hnsw:** your index, graded on recall/latency curves measured against brute-force truth.`,
    },
  ],
}

export default lesson
