import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't6.l2',
  slug: 'hnsw-layer-by-layer',
  trackId: 't6',
  index: 2,
  title: 'HNSW, Layer by Layer',
  minutes: 17,
  hook: 'Skip lists reborn as graphs: entry points, greedy descent, neighbor selection — the index behind pgvector, honestly derived. Then you build one — lab 06.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `T6.L1 ended the exact dream and named the bargain: a little recall for orders of latency. This lesson builds the structure that keeps that bargain better than anything else anyone has fielded — **HNSW**, Hierarchical Navigable Small World, the index inside pgvector, and the index you are about to build.

Its ancestry is older than the vector boom. In 1990, William Pugh published the **skip list**: a sorted linked list with express lanes — each node promoted to higher levels by coin flip, so search starts on the sparse top level (long hops, few nodes) and descends, landing within a logarithm's worth of hops of anything. HNSW, from Malkov and Yashunin (2016, published 2018), is that idea reincarnated as a graph: layers of graphs instead of lists, distances instead of sort order. Understand the two ingredients — the small-world graph, the layers — and the whole index derives itself, pgvector knobs included.`,
    },
    {
      type: 'prose',
      md: `## Navigable small worlds

Start with the graph. A **navigable small world** is a network where greedy routing works: from any node, "move to whichever neighbor is closest to the target," repeat — and you arrive in about **log n hops**. Milgram's six-degrees result is the sociology version; the algorithmic version (Kleinberg) says what the edge structure must be: mostly short edges to nearby nodes, plus a sprinkling of long-range ones, so that every greedy step can cut the remaining distance by a roughly constant *factor*. Long edges for the highway miles, short edges for the last mile.

Two failure modes matter. Greedy can stall in a **local minimum** — a node whose neighbors are all farther from the query than itself — and a single greedy walker has no way out. HNSW's two fixes are the rest of this lesson: the walk keeps a **beam** of candidates (a width called \`ef\`), not a single current position, and the graph is **layered**, so the long-range navigation happens up top on a tiny, cheap subgraph.`,
    },
    {
      type: 'prose',
      md: `## The layered trick: express lanes up top

Now stack skip-list logic onto the graph. Every node exists at **layer 0**. Each node also draws a random top level from a geometric distribution — in the paper, \`level = ⌊−ln(uniform) · 1/ln(m)⌋\` — so roughly 1 in m nodes reaches the next layer, 1 in m² the one after that, and the top of an n-node graph holds a handful of nodes. Up top: **express lanes**, sparse nodes, long edges. At the bottom: **dense streets**, every node present, mostly short edges.

Search is a descent:

1. Enter at the **entry point** — the highest node in the graph — on the top layer.
2. Greedy-walk the current layer: always hop to the neighbor nearest the query. Stop at a local minimum.
3. **Drop one layer**, continuing from the node you are standing on — it exists on every layer below its top. The denser graph resumes the walk with finer steps.
4. Repeat to layer 0, where the walk runs with a beam of \`ef_search\` candidates and the best k come back.

Each layer owns one *scale* of distance: the top layer gets you to the right city, the middle layers to the right neighborhood, layer 0 to the right doorstep. Distance-to-query collapses by orders per layer, the layer count grows like \`log n\` — and total work per query is a few hundred distance computations, not a scan of 31GB.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — the layered descent: express lanes, then dense streets',
      height: 74,
      nodes: [
        { id: 'e2', x: 4, y: 6, w: 14, h: 9, label: 'entry', sub: 'top of the graph', color: '#A78BFA' },
        { id: 'a2', x: 34, y: 6, w: 14, h: 9, label: 'node', sub: 'dist 0.91 → 0.42', color: '#A78BFA' },
        { id: 'lab2', x: 80, y: 6, w: 18, h: 9, label: 'layer 2', sub: 'express lanes', color: '#94A3B8' },
        { id: 'b1', x: 34, y: 26, w: 14, h: 9, label: 'same node', sub: 'drop a layer', color: '#5CA8FF' },
        { id: 'c1', x: 58, y: 26, w: 14, h: 9, label: 'node', sub: 'dist 0.42 → 0.19', color: '#5CA8FF' },
        { id: 'lab1', x: 80, y: 26, w: 18, h: 9, label: 'layer 1', sub: 'mid-range hops', color: '#94A3B8' },
        { id: 'lab0', x: 4, y: 46, w: 20, h: 8, label: 'layer 0', sub: 'dense streets · all nodes', color: '#94A3B8' },
        { id: 'd0', x: 58, y: 46, w: 11, h: 8, label: 'node', sub: 'dist 0.19', color: '#3EF2A4' },
        { id: 'e0', x: 71, y: 46, w: 11, h: 8, label: 'node', sub: 'dist 0.09', color: '#3EF2A4' },
        { id: 'f0', x: 84, y: 46, w: 11, h: 8, label: 'nearest', sub: 'dist 0.02', color: '#3EF2A4' },
        { id: 'q', x: 82, y: 60, w: 15, h: 9, label: 'query', sub: 'top-k returned', color: '#FBBF24' },
      ],
      edges: [
        { from: 'e2', to: 'a2', label: 'greedy hop' },
        { from: 'a2', to: 'b1', label: 'local min → drop' },
        { from: 'b1', to: 'c1', label: 'greedy hop' },
        { from: 'c1', to: 'd0', label: 'drop' },
        { from: 'd0', to: 'e0', label: 'beam walk' },
        { from: 'e0', to: 'f0', label: 'beam walk' },
        { from: 'f0', to: 'q', label: 'top-k' },
      ],
      steps: [
        { caption: 'The query enters at the entry point — the single highest node — on the top layer. Almost the whole graph is invisible from here. That is the point.', active: ['e2', 'lab2'] },
        { caption: 'Layer-2 greedy walk: hop to whichever neighbor is nearest the query. Few nodes, long edges — each hop cuts distance by a large factor: 0.91 → 0.42.', active: ['e2', 'a2'], edges: ['e2->a2'] },
        { caption: 'Local minimum: no layer-2 neighbor is closer. Do not fight it — drop to layer 1 from the node you stand on; it exists on every layer below its top.', active: ['a2', 'b1', 'lab1'], edges: ['a2->b1'] },
        { caption: 'Layer 1 resumes the walk with finer steps: 0.42 → 0.19, then another local minimum. Drop again.', active: ['b1', 'c1'], edges: ['b1->c1'] },
        { caption: 'Layer 0: dense streets, every node present. The walk now keeps a beam of ef_search candidates instead of a single position — the insurance against local minima.', active: ['c1', 'd0', 'lab0'], edges: ['c1->d0'] },
        { caption: 'The beam settles on the closest nodes found: 0.19 → 0.09 → 0.02. Return the best k. Total distance computations: a few hundred — against 5 million for the brute-force truth.', active: ['d0', 'e0', 'f0', 'q'], edges: ['d0->e0', 'e0->f0', 'f0->q'] },
      ],
    },
    {
      type: 'prose',
      md: `## Insert: descend, then connect carefully

Inserting a node is a search that leaves edges behind. Draw the new node's top level; descend layer by layer exactly as a query would — but at each layer down to 0, keep the \`ef_construction\` closest candidates found along the way. Then comes the part that decides whether your graph *routes* or *rots*: **neighbor selection**. From those candidates, the heuristic keeps a candidate only if it is closer to the *new node* than to any already-selected neighbor — greedily, in distance order, until m are chosen.

Read that rule twice; it is the soul of the paper. Picking the m *closest* candidates would build a clique of near-duplicates all pointing the same direction — great for the first hop, fatal for reachability, and a factory for the local minima that stall greedy walks. The diversity rule spends the node's degree on **different directions**: edges are infrastructure for routing, not a trophy cabinet of similarity. The chosen edges are reciprocated, and any neighbor now over its degree cap — **2m at layer 0, m above** — prunes its own list with the same heuristic. Everything is local: no global rebalancing, no splits cascading to a root, no single page for the world to contend on (Crash Week's INC-3 disease). The graph self-organizes.`,
    },
    {
      type: 'prose',
      md: `## The knobs are physics

Every HNSW parameter you have ever tuned by superstition is a direct price on this graph — degree, build quality, beam width:

| knob | what it physically is | what it costs | pgvector default |
|---|---|---|---|
| \`m\` | **degree** — max edges per node (2m at layer 0) | memory per node, distance computations per hop; too low and the recall ceiling collapses | 16 |
| \`ef_construction\` | **build beam** — candidate width during insert | build time, roughly linear; too low and edges are drawn from a poor candidate pool | 64 |
| \`ef_search\` | **query beam** — candidates tracked in the layer-0 walk | latency, roughly linear; the recall/latency dial, settable per query (must be ≥ k) | 40 |

Do the memory arithmetic once, because it is the capstone's opening line: 5M nodes × 2m = 32 layer-0 edges × ~8 bytes per edge id ≈ **1.3GB of graph**, on top of the ~31GB of vectors. The graph is small; the vectors are the payload. And note the asymmetry that trips everyone in production: \`ef_construction\` is spent *at build* — raising it later changes nothing without a rebuild — while \`ef_search\` is spent *per query*, so you can sweep it live. T6.L3 is entirely about that sweep.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `You have met the layered trick twice already. The skip list is the obvious ancestor — same geometric promotion, same express-lane descent. But look at your lab-02 tree with this lesson's eyes: a B+tree is also "express levels over sorted data," and root-to-leaf descent is the same greedy walk with separators instead of distances — guaranteed exact, because one-dimensional order *can* be exact. HNSW is what that architecture becomes when T6.L1 takes exactness off the table: separators become edges, levels become layers, and the guarantee becomes a recall number.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~log n', label: 'hops to anywhere', hint: 'Layers scale the greedy walk: express lanes up top, dense streets at layer 0. Hundreds of distance computations per query, not millions.' },
        { value: 'm = 16', label: 'degree (2m at layer 0)', hint: 'Edges per node, capped. Memory per node ≈ 2m edge ids plus the vector itself.' },
        { value: 'ef_search', label: 'the runtime dial', hint: 'Beam width at query time: recall up, latency up, settable per query. Must be ≥ k.' },
        { value: '1.3 GB', label: 'graph for 5M × m=16', hint: '32 layer-0 edges × ~8B per id × 5M nodes. The vectors (~31GB) dwarf it.' },
      ],
    },
    {
      type: 'prose',
      md: `## Lab 06: you build this

Lab 06 (hnsw) hands you \`src/hnsw.rs\` and a seeded corpus, and grades you the way ANN deserves to be graded: not "correct" — nothing here is exact — but **measurably close, measurably fast**. The harness computes brute-force ground truth in-page (your T5 pipeline, run as the judge of your index) and checks:

- **graph_invariants** — layer populations bounded by the geometric decay, and *every node reachable from the entry point*. A disconnected subgraph is a recall hole you will never measure your way out of.
- **recall_band** — recall@10 against the brute-force truth, inside a calibrated band. Not 1.0 — that would mean you built a slow scan — and not below the floor.
- **latency_win** — beats the exact scan by the required margin. The index must actually win.
- **planner_choice** — your tiny cost model chooses index-vs-scan **iff the index genuinely wins** for the given table size and dimension. An index chosen when it loses is a planner bug, not a feature — T5.L3's lesson, applied to your own creation.
- **curve** — the capstone's soul: your (recall, latency) operating point must dominate a naive build (small m, tiny ef) on the same corpus. One point on one curve, measured against truth — the entire vector-database business case in miniature.`,
    },
    {
      type: 'lab',
      lab: 'hnsw-explorer',
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Mid-descent on layer ℓ, the greedy walk hits a local minimum — no neighbor is closer to the query than the current node. What happens next?',
          options: [
            'The search restarts from the entry point with a wider beam',
            'The walk backtracks to the previous node and tries its second-best neighbor',
            'The algorithm drops to layer ℓ−1 and resumes from the same node, which exists on every layer up to its top — the denser graph below takes over with finer steps',
            'The current node is returned as the approximate answer',
          ],
          correct: [2],
          explanation:
            'Layers are the escape hatch: a local minimum on a sparse express layer is just the signal to navigate more finely. The current node doubles as the entry point for the layer below — no restart, no backtracking.',
        },
        {
          q: 'During insert, the neighbor-selection heuristic skips a candidate that is extremely close to the new node — because it is even closer to an already-selected neighbor. Why?',
          options: [
            'To keep edge lengths uniform for the cost model',
            'Degree is routing infrastructure: a second edge pointing the same direction as an existing one buys almost no reachability, and cliques of near-duplicates are factories for the local minima that stall greedy walks',
            'Duplicate edges violate the graph invariants the harness checks',
            'Closer candidates are numerically unstable in float arithmetic',
          ],
          correct: [1],
          explanation:
            'The m edges are a budget, spent on diverse directions. "Closest m" builds a trophy cabinet of similarity; the diversity heuristic builds a map. Reachability, not proximity — this rule is the difference between a small world and a hairball.',
        },
        {
          q: 'Production recall is too low. A colleague proposes raising ef_construction from 64 to 256 on the live index. What happens?',
          options: [
            'Recall improves immediately — bigger beam, better candidates',
            'Build quality improves gradually as new rows arrive, and old edges heal over time',
            'Nothing — ef_construction is spent at build time; the existing graph\'s edges are already fixed, and only a rebuild can spend it. The live dial is ef_search',
            'The index rebuilds itself in the background',
          ],
          correct: [2],
          explanation:
            'The two efs are spent at different times: ef_construction buys edge quality once, at insert; ef_search buys candidate breadth per query. Raising the former without rebuilding is wishing on a graph that already exists; raising the latter trades latency for recall immediately — that trade is T6.L3’s curve.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the paper and its ancestors',
      md: `The primary source: **Malkov & Yashunin, "Efficient and Robust Approximate Nearest Neighbor Search Using Hierarchical Navigable Small World Graphs" (IEEE TPAMI 2018; arXiv:1603.09320)** — Algorithms 1–5 are this lesson in pseudocode, including the diversity heuristic (their SELECT-NEIGHBORS-HEURISTIC) and the geometric level assignment. The ancestor: **Pugh, "Skip Lists: A Probabilistic Alternative to Balanced Trees" (1990)** — a few pages that make the layering feel inevitable. The theory underneath: **Kleinberg, "The Small-World Phenomenon: An Algorithmic Perspective" (STOC 2000)** — when greedy routing can work at all. The knobs in production: the **pgvector README**, where \`m\`, \`ef_construction\`, \`hnsw.ef_search\` are exactly the three prices above. And the bridge to the capstone: **Subramanya et al., "DiskANN" (NeurIPS 2019)** — what this graph becomes when it must live on an SSD instead of in RAM. T6.L3 prices that difference. Now go write \`hnsw.rs\`; the curve is waiting.`,
    },
  ],
}

export default lesson
