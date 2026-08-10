# EXPANSION — tablespace → world-class (researched 2026-08-10)

Goal: take a **Rust-and-DB beginner to advanced**; be the credible
browser-native challenger to CMU 15-445.

## What the incumbent is (verified)

**CMU 15-445/645 Spring 2026 (Pavlo + Patel)** — projects: P0 C++ primer,
P1 Buffer Pool Manager (LRU-K replacer), P2 B+Tree (incl. a latch-crabbing
concurrency task), P3 Query Execution, P4 MVCC. Lectures add: extendible
hashing, external merge sort, join algorithms, query optimization
(System R lineage), concurrency theory (2PL/OCC/MVCC), ARIES recovery,
intro distributed.
(15445.courses.cs.cmu.edu/spring2026/schedule.html · /project2/)

**CMU 15-721 (the advanced layer)** — OLAP/columnar storage, vectorized +
SIMD execution, JIT query compilation, parallel architectures, in-memory
MVCC protocols (Cicada, Silo), NVM, optimizer frameworks (optd/DataFusion).
(15721.courses.cs.cmu.edu/spring2024/project.html)

**Berkeley CS186 RookieDB** — Java; same arc; multigranularity locking P4.
(cs186.gitbook.io/project)

## The opening (why we win if we execute)

The unofficial study guide says it flatly: "self-learners arrive in waves
from the famous lectures and discover the projects assume systems maturity
the videos don't supply." The lecture→project gap is where the incumbent
loses self-learners: C++ toolchain, cmake, Gradescope, concurrency bugs
that don't reproduce on demand. Our invariant-graded, deterministic,
browser-verified labs already beat that. What we lack:

1. **Interactive rungs before the forge** — hands-on micro-labs that run
   in the page with zero toolchain (this is the "browser-only labs" wave).
2. **A Rust on-ramp** — our labs assume Rust; the audience is Java/Python.
3. **Parity content** — hashing, sorting, 2PL/OCC, latch crabbing, LRU-K;
   then the 15-721 layer (columnar, vectorized) as the advanced tier.

## Wave 1 (building now)

### A. Browser labs — one per track, auto-graded in-page

Framework: new content block `{ type:'lab', lab:'<id>' }` rendered inline
in lessons via a component registry; each lab self-grades deterministically
in-page and records completion into the progress store as a sim task
(`blab:<id>`). No toolchain, no wasm — TypeScript interactivity with the
same check-message voice as the forge.

| lab | track | you do | grounded in |
|---|---|---|---|
| `cost-model` | T0 | price scan-vs-random workloads against real device numbers; find where the plan flips | 15-445 storage lectures · T0.L2 constants |
| `page-surgery` | T1 | operate an 8KB slotted page visually (insert/delete/defrag) with byte-exact accounting | lab 01's real layout · PG bufpage.h |
| `btree-surgeon` | T2 | insert into a live tree; call every split/separator; invariants checked per step | lab 02's separator law · 15-445 B+TREE-INSERT examples · Lehman-Yao '81 |
| `wal-replay` | T3 | drag the crash point over a checksummed log; pick what recovery applies | ARIES (Mohan '92) · lab 03 record format |
| `visibility-court` | T4 | version chains + snapshots; rule on every read's result | lab 04 predicate · HeapTupleSatisfiesMVCC |
| `plan-arena` | T5 | compute NLJ/hash/merge costs from stats; win the arena; then lose with a mis-estimate | Selinger '79 · 15-445 query-opt · T5.L2 numbers |
| `hnsw-explorer` | T6 | step the greedy descent through layers; watch ef_search's beam decide recall | Malkov-Yashunin '18 · lab 06's graph |

### B. Rust Zero ramp (track Tᴿ, 4 lessons)

rustlings pedagogy (small, compiler-as-tutor) aimed at exactly what the
forge labs use — nothing else:

- tr.l1 The Rust You'll Actually Write — structs/enums/impl, through a KV.
- tr.l2 Ownership Is a Resource Protocol — borrow checker via buffer-pool
  and txn-lifecycle examples (ownership ≈ pin counting, at compile time).
- tr.l3 Option, Result, and Match — the lab APIs' exact shape; todo!() as
  a feature, not an error.
- tr.l4 The Forge Workflow — cargo test red→green, wasm build, drop the
  artifact; zero-to-green on lab 01 setup.

### Wave 2 (specced, not built in this wave)

Parity lessons: extendible hashing (15-445 hashing lecture), external
merge sort (sorting lecture), 2PL + OCC (concurrency theory), latch
crabbing/index concurrency (Lehman-Yao; 15-445 P2 task 4), LRU-K
(five-minute-rule lineage; P1 replacer). Advanced tier (15-721 layer):
columnar storage + vectorized execution ( MonetDB/X100 lineage), optimizer
search (System R DP / Cascades), in-memory MVCC protocols.

### Wave 2 candidate lab: `lab 00 rust-kv` (forge warmup)

Baby's-first-forge: a tiny KV with deliberate compile errors to fix —
teaches the toolchain loop before the concepts bite. Deferred to wave 2.

## Sources

- 15445.courses.cs.cmu.edu/spring2026 (schedule, project pages)
- 15721.courses.cs.cmu.edu/spring2024 (projects: optd optimizer, I/O cache)
- cs186.gitbook.io/project (RookieDB arc)
- fennie.ai/universities/carnegie-mellon/15-445 (self-learner gap analysis)
- skyzh.dev/blog/2023-12-20-the-final-semester-in-bustub (BusTub P4 MVCC)
- Papers the labs teach to: ARIES (Mohan et al., TODS '92) · Lehman & Yao
  '81 · Selinger et al. '79 · O'Neil et al. '96 (LSM) · Malkov & Yashunin
  TPAMI '18 (HNSW) · Ports & Grittner VLDB '12 (SSI) · Graefe TKDE '94
  (Volcano) · Beyer et al. ICDT '99 (curse of dimensionality)
- Rust ramp: rust-lang/rustlings · rust-book.cs.brown.edu (interactive
  quizzes + memory diagrams — prior art for the ramp's shape)
