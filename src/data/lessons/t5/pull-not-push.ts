import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't5.l1',
  slug: 'pull-not-push',
  trackId: 't5',
  index: 1,
  title: 'Pull, Not Push',
  minutes: 16,
  hook: 'The volcano model: open/next/close, pipelining, and why every executor you have ever used is the same six iterators. Then lab 05 — over your own pages and tree.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `T1 through T4 built you a store: pages that account for every byte, a tree that stays balanced under fire, a log that survives its own death, versions that let readers and writers coexist. Impressive — and mute. It can *keep* data; it cannot answer a question. T5 gives it a mouth.

Here is the surprise: the answering machinery is smaller than anything you have built so far, and it has barely changed in forty years. Strip any query engine — Postgres, MySQL, SQLite, the distributed SQL fleets — down to its executor and you find the same handful of operators, all implementing the same three-method interface, all fitting together one way. That interface is the **volcano model**, and learning it once is learning every executor you will ever profile.`,
    },
    {
      type: 'prose',
      md: `## The interface

Every operator — scan, filter, project, join, aggregate, sort — is an **iterator** with three methods:

- **\`open()\`** — allocate state and propagate: a parent opens its children, which open theirs, down to the scans that pin their first pages.
- **\`next()\`** — return one tuple, or \`done\`. Not a batch, not a page: one tuple. This is the whole discipline.
- **\`close()\`** — release everything, top-down.

Postgres calls them \`ExecInitNode\` / \`ExecProcNode\` / \`ExecEndNode\`; Graefe's Volcano paper named them open/next/close in 1994 and the names stuck. The power is the uniformity: a Filter does not know whether its child is a SeqScan, an IndexScan, or the output of a ten-way join — it calls \`next()\` and gets a tuple. **Composition is total**: any operator can sit on top of any operator, so the planner (T5.L3) can rearrange the tree freely — and even parallelism hides inside an iterator. Volcano's \`exchange\` operator fans one stream out to many workers and still looks like a single \`next()\` to its parent.`,
    },
    {
      type: 'code',
      filename: 'src/executor.rs — the whole contract',
      lang: 'rust',
      code: `pub trait Executor {
    fn open(&mut self);
    fn next(&mut self) -> Option<Tuple>; // one tuple, or None = done
    fn close(&mut self);
}`,
      chips: ['3 methods', '1 tuple at a time'],
    },
    {
      type: 'prose',
      md: `## A plan is a tree of pulls

Take \`SELECT name, email FROM users WHERE age > 30 LIMIT 10\`. The planner hands the executor a tree: **Limit** on top, then **Project**, then **Filter**, then **SeqScan** at the leaf. Executing it is a single call — \`next()\` on the root — and the pulls cascade: Limit pulls Project, Project pulls Filter, Filter pulls SeqScan, and SeqScan reads the next \`LIVE\` slot off a lab-01 page and hands the record upward. One call stack, one tuple deep. Nothing is pushed; every tuple exists because somebody *pulled* it.

The shape buys three things at once:

- **Filtering sheds work downward.** Filter drops a tuple by simply pulling its child again — the parent never learns the miss happened. A selective predicate doesn't create work above it; it *removes* work.
- **LIMIT is laziness with teeth.** After the tenth tuple, Limit returns \`done\` and nobody ever pulls an eleventh. With no sort in the way, that query over a 10-million-row table touches a handful of pages, not the table.
- **One tuple at a time means tiny working state.** Streaming operators hold exactly one tuple in flight; memory stays O(1) until an operator *chooses* otherwise — which is the next section.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — a pull cascade: next() flows down, tuples flow up',
      height: 66,
      nodes: [
        { id: 'limit', x: 30, y: 2, w: 40, h: 8, label: 'Limit 10', sub: 'counts, then says done', color: '#FB7185' },
        { id: 'project', x: 30, y: 13, w: 40, h: 8, label: 'Project', sub: 'keep name, email', color: '#A78BFA' },
        { id: 'filter', x: 30, y: 24, w: 40, h: 8, label: 'Filter', sub: 'age > 30', color: '#FBBF24' },
        { id: 'seqscan', x: 12, y: 35, w: 36, h: 8, label: 'SeqScan', sub: 'next LIVE slot', color: '#3EF2A4' },
        { id: 'idxscan', x: 52, y: 35, w: 36, h: 8, label: 'IndexScan', sub: 'swap-in leaf', color: '#94A3B8' },
        { id: 'pages', x: 12, y: 50, w: 36, h: 9, label: 'lab-01 pages', sub: '8192 B · 8 B header · 6 B slots', color: '#5CA8FF' },
        { id: 'tree', x: 52, y: 50, w: 36, h: 9, label: 'lab-02 tree', sub: 'descend by key', color: '#5CA8FF' },
      ],
      edges: [
        { from: 'limit', to: 'project', label: 'next() ↓' },
        { from: 'project', to: 'filter', label: 'next() ↓' },
        { from: 'filter', to: 'seqscan', label: 'next() ↓' },
        { from: 'seqscan', to: 'pages', label: 'read slots' },
        { from: 'filter', to: 'idxscan', label: 'or pull here' },
        { from: 'idxscan', to: 'tree', label: 'descend' },
      ],
      steps: [
        { caption: 'open() cascades root-to-leaf: each operator allocates its state; the leaf scan pins its first page and positions at slot 0.', active: ['limit', 'project', 'filter', 'seqscan'] },
        { caption: 'The root gets its first next(): Limit asks Project, Project asks Filter, Filter asks SeqScan. One call stack, and not one tuple exists yet.', active: ['limit', 'project', 'filter'], edges: ['limit->project', 'project->filter', 'filter->seqscan'] },
        { caption: 'SeqScan reads the next LIVE slot off a lab-01 page — 8192-byte arena, 8-byte header, 6-byte slots — and returns the record. Nothing above it knows a page exists.', active: ['seqscan', 'pages'], edges: ['seqscan->pages'] },
        { caption: 'Filter checks age > 30: fails. The tuple dies here — Filter quietly pulls again, and its parent sees nothing of the miss.', active: ['filter'], edges: ['filter->seqscan'] },
        { caption: 'A passing tuple goes up: Project trims it to (name, email); Limit counts 1. Pages touched so far: one.', active: ['project', 'limit'], edges: ['project->filter'] },
        { caption: 'Tenth tuple delivered: Limit returns done and never pulls an eleventh; close() unwinds top-down. A 10M-row table answered with ~10,000 leaf pulls.', active: ['limit'] },
        { caption: 'Same tree, different leaf: swap SeqScan for an IndexScan over your lab-02 tree and every operator above runs unchanged — composition is the point.', active: ['idxscan', 'tree', 'filter'], edges: ['filter->idxscan', 'idxscan->tree'] },
      ],
    },
    {
      type: 'prose',
      md: `## Where the pipeline must stop

Some operators cannot stream, and the ones that can't are exactly the interesting ones:

- **Sort** must see its *entire* input before emitting a single tuple: the first row in sorted order might be the last row to arrive. Its first \`next()\` pulls the child dry, sorts in memory — or, past \`work_mem\`, spills sorted runs to disk and merges them on the way back.
- **Hash join** consumes one whole side (the smaller one — T5.L2) to build a hash table before its first output; then the probe side streams through, one pull at a time.
- **Aggregate** like \`count\`/\`sum\` keeps only a running value per group — cheap state — but the final tuple cannot ship until the input is exhausted. Grouping without sorted input means holding every group's accumulator at once.

These are **materialization points**: places where the pipeline must stop and buffer. Everything between two materialization points is a true stream — tuples flow from page to client with almost nothing held. And notice what the spill does to the physics: an external sort writes its runs *sequentially*, which is T0.L2's axis coming back — when you must touch everything, sequential beats clever. Hold that thought; T5.L2 prices it.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `You have written this interface a dozen times: Rust's \`Iterator\`, Python's generators, Java streams, Unix pipes — pull-based, composable, lazy. Two things make the database version special. First, a \`next()\` at the leaf can hide a **page fetch**: the scan's cheap-looking loop sits on the buffer pool, and one miss is T0.L3's ~500× step down the ladder. Second, the leaf is not reading bytes, it is reading *versions*: every tuple still carries T1.L2's 23-byte header, and a real executor checks \`xmin\`/\`xmax\` against your snapshot (T4) before a tuple is allowed to exist, while every page it touches got to disk under T3's log-first rule. The scan is a loop over everything you are permitted to see — MVCC and the WAL are the substrate the iterator walks on.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~40 yrs', label: 'the same interface', hint: 'System R’s executor iterated in the 1970s; Volcano (Graefe, 1994) named it open/next/close. Nothing has replaced it since.' },
        { value: '3', label: 'methods per operator', hint: 'open allocates, next yields one tuple or done, close releases. Postgres: ExecInitNode / ExecProcNode / ExecEndNode.' },
        { value: '6', label: 'iterators in the classic kit', hint: 'SeqScan, IndexScan, Filter, Project, Join, Aggregate — add Sort and Limit and you can run most of SQL.' },
        { value: '1 tuple', label: 'in flight per operator', hint: 'Streaming operators hold O(1) state. Memory only grows at materialization points — sorts and hash builds.' },
      ],
    },
    {
      type: 'prose',
      md: `## Lab 05: the artifacts converge

Lab 05 (volcano) hands you \`src/executor.rs\` and a fixed suite of queries. The scans do not run over somebody else's storage: **SeqScan walks your lab-01 pages** — 8192-byte arena, 8-byte header, 6-byte slots, \`LIVE\` flag — decoding records through your own slot array, and **IndexScan descends your lab-02 tree** to fetch by key. Every operator above them treats both as one thing: a tuple stream. This is the moment the course's artifacts stop being separate homework and start being an engine.

The harness checks tuples, not plans, against a reference executor:

- **scan_project** — the right tuples, in the right order, with the right columns.
- **select_filter** — predicates filter *exactly*; no boundary off-by-one, no dropped rows.
- **join_correct** — your nested-loop join matches the reference row-for-row.
- **aggregate_correct** — group/count/sum, including the group everyone drops: the NULL group.
- **query_suite** — the fixed select/project/join/aggregate suite, end to end, over your own storage.

SQL semantics are exact even when your plan choices are not: wrong order, wrong multiplicity, one missing NULL group — the reference catches all of it. The volcano model makes the *machinery* small. The checks make sure you didn't confuse small with easy.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'A plan is Limit(10) → Filter (selectivity ~1/1000) → SeqScan over a 10M-row table, no sort. Roughly how many tuples does SeqScan produce before the query finishes?',
          options: [
            'All 10M — the leaf always runs to completion',
            '~10,000 — Limit stops pulling after its tenth tuple, so the cascade ends once Filter has passed ten rows',
            '~1,000 — one per Filter rejection',
            'Exactly 10 — the leaf knows the LIMIT',
          ],
          correct: [1],
          explanation:
            'Pull is lazy all the way down. Limit never issues an eleventh next(); Filter keeps pulling until ten rows pass at ~1-in-1000 selectivity — about 10,000 leaf tuples, a handful of pages, done. This is why LIMIT with no sort above it is fast even on huge tables.',
        },
        {
          q: 'Why must Sort buffer its entire input before returning its first tuple?',
          options: [
            'To build an index on the sort keys for binary search',
            'Sorting is CPU-bound, so batching amortizes cache misses',
            'The contract is global: the first tuple in sorted order might be the last tuple the child would ever produce — no honest tuple can ship before the input is exhausted',
            'The buffer pool requires full materialization before any operator output',
          ],
          correct: [2],
          explanation:
            'Global order needs global knowledge. That is what makes sort (and the hash join’s build side) a materialization point: the pipeline stops, buffers — in memory, or spilled to sequential disk runs — and only then resumes streaming.',
        },
        {
          q: 'In the volcano model, how does a Filter operator drop a tuple that fails its predicate?',
          options: [
            'It pushes the tuple back to its child with a rejection flag',
            'It calls close() on the child and re-opens it at the next tuple',
            'It marks the tuple dead in its page slot so later scans skip it',
            'It simply pulls next() on its child again — the rejected tuple never travels upward, and the parent never learns it existed',
          ],
          correct: [3],
          explanation:
            'There is no push-back channel; the tree speaks one language, next(). Rejection is a private loop inside the operator — which is exactly why any operator can sit under any other without negotiation.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the paper, the lectures, the counterpoint',
      md: `The source: **Graefe, "Volcano — An Extensible and Parallel Query Evaluation System" (IEEE TKDE, 1994)** — open/next/close, the exchange operator, and the argument that one interface buys extensibility and parallelism together. Its companion survey, **Graefe, "Query Evaluation Techniques for Large Databases" (ACM Computing Surveys, 1993)**, is the executor's whole toolbox — sorting, hashing, aggregation — in one paper; T5.L2 lives in its first chapters. The lectures: **CMU 15-445 (Pavlo), query execution** — the same model, live-coded. The production read: **Postgres's \`src/backend/executor/README\`** — ExecInitNode/ExecProcNode/ExecEndNode, shorter than you fear. And the honest counterpoint: **Neumann, "Efficiently Compiling Efficient Query Plans for Modern Hardware" (VLDB, 2011)** — push-based, compile-the-plan-to-code execution, the design every modern analytical engine (and CMU 15-721) prefers. The iterator you build in lab 05 optimizes for composition; Neumann optimizes for the CPU. Knowing why they differ is knowing the field. Now go write \`executor.rs\` — the suite is waiting.`,
    },
  ],
}

export default lesson
