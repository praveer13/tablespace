import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't7.l2',
  slug: 'vectorized-execution',
  trackId: 't7',
  index: 2,
  title: 'Vectorized Execution',
  minutes: 14,
  hook: 'The volcano pulls one tuple at a time and the CPU yawns; feed it 1024-value batches and the same operators run 10–50× faster.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `T5.L1 built the volcano: \`open\`/\`next\`/\`close\`, one tuple per pull, composition as the whole virtue. T7.L1 then removed the disk from analytical scans — columnar layout, compression, zone maps — and in doing so changed what the bottleneck *is*. When the I/O is 2% of what it was, the CPU becomes the bill, and the volcano's one-tuple discipline turns from a virtue into the most expensive habit in the engine.

The claim of this lesson: keep the operators, keep the interface, change the **payload** — one tuple becomes a batch of ~1024 values — and the same plan runs **10–50× faster**. No new algorithms. Just respect for the hardware T0 priced.`,
    },
    {
      type: 'prose',
      md: `## The autopsy of a next()

Where does one tuple's time go in a volcano executor? Follow \`next()\` through three operators on a scan whose data is already in memory:

- **Dispatch**: every operator call is an indirect jump — Postgres literally routes \`ExecProcNode\` through a function pointer per node. Per tuple, per operator, no inlining across the boundary.
- **I-cache thrash**: the plan's code footprint is the sum of its operators; each \`next()\` round-trips through all of them, so the instruction cache holds everyone's code poorly instead of one loop's code well.
- **Branch mispredicts**: is this attribute null? which type is it? did the predicate pass? Data-dependent branches on real data mispredict a large fraction of the time, and each mispredict flushes ~15–20 cycles of pipeline.

Price it against T0's ladder. The *useful* work — compare two ints, add to an accumulator — is **~1 cycle**. The tuple is already in DRAM at worst: **~100ns**. But the interpretation overhead stacked around that work is **10–100× the work itself** — Boncz's team famously profiled MySQL on a trivial aggregate and found over 90% of cycles spent anywhere *but* the answer. The volcano doesn't compute slowly; it barely computes at all.`,
    },
    {
      type: 'prose',
      md: `## The fix: change the payload

The vectorized executor keeps \`open\`/\`next\`/\`close\` — and \`next()\` now returns a **vector**: ~1024 values of one type, densely packed in an array (MonetDB/X100 sized vectors to fit L1; DuckDB's standard vector is 2048). Everything else is consequences:

- **The operator body becomes a tight typed loop**: \`for i in 0..n { out[i] = in[i] + 1 }\`. No virtual calls inside the loop — one dispatch per *batch*, so per-tuple dispatch cost divides by a thousand.
- **The compiler can see the loop**: auto-vectorization kicks in, and one SIMD instruction processes 8–16 values (AVX2/AVX-512 lanes on i32s). Null handling becomes a bitmap; branches become predication or disappear.
- **Filters emit selection vectors**: instead of copying survivors, the Filter writes the *positions* that passed — \`sel = [0, 3, 4, …]\` — and downstream operators loop over positions. No data moves until it has to.
- **Vectors are sized to cache**: a 1024-value i32 vector is 4KB — L1-resident — so after the first touch, every value in the batch is a ~1ns hit, not a ~100ns trip. T0's ladder, now with a knob.

Same tree, same algebra, same answers. The payload changed, and with it which rung of the ladder the executor lives on.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — one filter, two payloads',
      height: 56,
      nodes: [
        { id: 'scanA', x: 4, y: 4, w: 28, h: 9, label: 'SeqScan', sub: 'volcano', color: '#94A3B8' },
        { id: 'filtA', x: 4, y: 20, w: 28, h: 9, label: 'Filter', sub: '8 × next()', color: '#94A3B8' },
        { id: 'outA', x: 4, y: 36, w: 28, h: 9, label: 'output', sub: '8 dispatches', color: '#94A3B8' },
        { id: 'scanB', x: 52, y: 4, w: 44, h: 9, label: 'ColumnScan', sub: 'fills v: i32[1024]', color: '#A3E635' },
        { id: 'filtB', x: 52, y: 20, w: 44, h: 9, label: 'Filter', sub: 'writes sel = [0, 3, 4, …]', color: '#A3E635' },
        { id: 'outB', x: 52, y: 36, w: 44, h: 9, label: 'output', sub: '1 dispatch per operator', color: '#A3E635' },
      ],
      edges: [
        { from: 'scanA', to: 'filtA', label: 'tuple ×8' },
        { from: 'filtA', to: 'outA', label: 'survivors, one pull each' },
        { from: 'scanB', to: 'filtB', label: 'one vector' },
        { from: 'filtB', to: 'outB', label: 'positions, no copying' },
      ],
      steps: [
        { caption: 'Volcano: each tuple climbs the tree alone — a virtual call per operator per tuple, eight dispatches for eight values, branches re-decided every time.', active: ['scanA', 'filtA'], edges: ['scanA->filtA'] },
        { caption: 'The output is identical. The cost is 8 dispatches, a thrashed I-cache, and mispredicted branches — for ~8 cycles of actual comparison.', active: ['filtA', 'outA'], edges: ['filtA->outA'] },
        { caption: 'Vectorized: the scan fills a 1024-value array in one dispatch. The Filter runs one tight loop — SIMD compares 8–16 values per instruction — and records only the surviving positions.', active: ['scanB', 'filtB'], edges: ['scanB->filtB'] },
        { caption: 'Downstream operators iterate the selection vector. Two dispatches total, values never copied, batch L1-resident. Same algebra, same answers — 10–50× the speed.', active: ['filtB', 'outB'], edges: ['filtB->outB'] },
      ],
    },
    {
      type: 'prose',
      md: `## The other school: compile the plan

Vectorization keeps the volcano's shape and upgrades the payload. The rival school replaces the shape. **Neumann (VLDB 2011)**: fuse each pipeline of operators into a single tight loop, keep the hot tuple attributes in *registers*, and generate machine code (LLVM) specialized to the exact types — **push**, not pull: leaves *produce*, parents *consume*, and the \`next()\` chain disappears entirely.

One honest paragraph of comparison, because both chase the same physics — fewer instructions per tuple, branches predicted, data glued to the ALU. Vectorization buys most of the win with a fraction of the complexity: no compiler in the dependency tree, plans stay interpretable, and the batch boundary is a natural place to checkpoint. Compilation squeezes the remaining factors — registers beat L1 — and pays with compile latency per query and a much bigger engineering surface. The 2026 map: **DuckDB vectorizes; HyPer/Umbra compile; ClickHouse does both**; and the ideas are converging — vectorized engines add code specialization for hot loops, compiled engines batch for cache. Choose by workload and team, not by faith.`,
    },
    {
      type: 'prose',
      md: `## Morsels: parallelism without the exchange

One core vectorized is one core fast; the scan wants all of them. The volcano's answer was the \`exchange\` operator (T5.L1): repartition streams between workers, an operator-shaped network stack. The modern answer is **morsel-driven parallelism** (Leis et al., 2014): the plan is pinned across all cores, and base-table work is handed out in fixed-size **morsels** — ~100k tuples — pulled by workers *on demand*.

Three properties fall out of demand-driven pull. **Locality**: the core that scanned a morsel filters and aggregates it while the data is still in *that core's* caches — no cross-socket traffic, NUMA-aware by design. **Elasticity**: a fast or idle core simply takes the next morsel — data skew, noisy neighbors, and uneven hardware self-balance; there is no static partitioning to get wrong. **Near-linear scaling**: until memory bandwidth saturates — which, for a scan, is the real ceiling, and it arrives sooner than you hope. The exchange shuffles data to workers; morsels move workers to data. Same goal, opposite default.`,
    },
    {
      type: 'prose',
      md: `## Where lab 05 sits

Your \`executor.rs\` is a textbook volcano: \`Option<Tuple>\`, one at a time, virtual dispatch and all. After this lesson that might feel like an indictment — it is not, and here is the honest accounting. Per-tuple pull has no batch to amortize *because OLTP queries touch ten tuples*; code generation has no loop to fuse because the query ends before the compiler warms up. The volcano is the right executor for the workload Postgres was born into, which is why it still carries it. The spectrum runs volcano (your lab, Postgres) → vectorized (DuckDB) → compiled (HyPer) — and all three speak the same algebra at the boundary. T7.L3 is about the layer above all of them: the search that picks the plan, whatever the payload.`,
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'the batch size is a cache size, not a magic number',
      md: `Why 1024 and not 16 or 1,000,000? Too small and per-batch dispatch cost returns to dominate. Too large and the vector spills out of L1/L2 — every value after the first is a DRAM trip, and you have rebuilt the volcano one rung lower. X100 tuned vectors to fit L1 exactly; DuckDB's 2048 sits comfortably in modern L2. The batch size is T0's latency ladder with a parameter attached — which means it ages with hardware, and engines re-tune it the way Postgres re-prices \`random_page_cost\`.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~1 cycle', label: 'the useful work', hint: 'Compare two ints, add to an accumulator. Everything else in a per-tuple next() is interpretation overhead — 10–100× the work.' },
        { value: '1024', label: 'values per vector', hint: 'One dispatch per batch: per-tuple overhead ÷1000. Sized to cache — 4KB of i32s is L1-resident. DuckDB uses 2048.' },
        { value: '10–50×', label: 'the vectorized speedup', hint: 'Same operators, same plans, same answers. Tight loops, SIMD, no per-tuple dispatch.' },
        { value: '~100k', label: 'tuples per morsel', hint: 'Demand-driven parallel scheduling: locality for caches, elasticity for skew, scaling until memory bandwidth says stop.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'A simple SUM scan runs entirely from memory on a volcano executor. Where do the cycles go?',
          options: [
            'The addition itself — arithmetic dominates in-memory scans',
            'Interpretation overhead: a virtual dispatch per tuple per operator, I-cache thrash across the plan\'s code, and data-dependent branch mispredicts — 10–100× the ~1 cycle of actual work',
            'Page faults — the buffer pool evicts under scan pressure',
            'The WAL — every scanned tuple is logged',
          ],
          correct: [1],
          explanation:
            'With I/O gone, the per-tuple tax is the whole bill. Boncz\'s team profiled MySQL on a trivial aggregate: over 90% of cycles anywhere but the answer. The volcano barely computes; it interprets.',
        },
        {
          q: 'In a vectorized executor, what does a Filter operator emit?',
          options: [
            'A new vector with surviving values copied into it',
            'A selection vector — the positions that passed — so downstream operators iterate indices and no data is copied until it must be',
            'A bitmap written back to the column file',
            'One tuple per next() call, like the volcano',
          ],
          correct: [1],
          explanation:
            'Positions, not payloads. Copying survivors would spend memory bandwidth exactly where the design is trying to save it; a selection vector defers all data movement, and later operators (or the final projection) touch values by index.',
        },
        {
          q: 'Why does morsel-driven parallelism beat statically partitioning the base table across workers?',
          options: [
            'Morsels are bigger than partitions, so there is less scheduling overhead',
            'Demand-driven pull self-balances: fast or idle cores take the next ~100k-tuple morsel, so skew and noisy neighbors even out — and whichever core scanned a morsel keeps processing it while it is still in that core\'s cache',
            'Static partitioning is impossible on NUMA hardware',
            'Morsels remove the need for a query plan',
          ],
          correct: [1],
          explanation:
            'Static splits bake the wrong guess in before execution: one straggler core or one skewed range decides the query time. Morsels turn scheduling into a work queue — elasticity from demand pull, locality from keeping the morsel on the core that read it.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the 15-721 canon',
      md: `The paper that started vectorized execution: **Boncz, Zukowski & Nes, "MonetDB/X100: Hyper-Pipelining Query Execution" (CIDR, 2005)** — the MySQL autopsy, the vector, the cache-conscious sizing. The compiler school: **Neumann, "Efficiently Compiling Efficient Query Plans for Modern Hardware" (VLDB, 2011)** — push, produce/consume, registers over memory; the design HyPer proved. Parallelism: **Leis et al., "Morsel-Driven Parallelism" (SIGMOD, 2014)** — the ~100k-tuple work unit and the NUMA argument. The working system to read: **DuckDB's execution format and vector docs** — 2048, the selection vector, the compressed execution from T7.L1. And the lectures that teach all three in a week: **CMU 15-721, the execution lectures** — this lesson is their compressed form.`,
    },
  ],
}

export default lesson
