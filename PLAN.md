# TABLESPACE — build plan, design, and resume state

> Pre-build plan. Written 2026-08-09. Course #3 in the series, after
> kernelspace (the machine) and byzantine (the network). This file is the
> single source of truth; once the build starts, keep the RESUME POINT at
> the bottom current (the byzantine pattern).

## Mission

`tablespace.play.naigap.com` — take a backend engineer (Java/Python
background, byzantine/kernelspace graduate or not) from "I've tuned queries
I couldn't explain" to someone who has **built a database from a page to a
query engine**: storage, indexes, WAL, MVCC, executor, planner, and a
vector index — each piece a graded Rust lab running in the browser, all
plugged into one persistent engine.

Platform: **fork byzantine** (not kernelspace — byzantine is the newer,
leaner skeleton): same lesson engine, same wasm lab grader, same pack
pipeline, same zero-server constraints.

## Why this subject (landscape verified 2026-08-09)

The series criterion: a physics layer professionals use but can't reason
about, with no browser-native, build-it-yourself courseware.

- **The gap is still wide open.** CMU 15-445 (BusTub) remains the gold
  standard — still C++-only, desktop-only, waitlisted (Spring 2026, Pavlo/
  Patel). Everything else is unstructured weekend repos (mini-lsm,
  learndb-py, vectordb-from-scratch): real demand, no curriculum, no
  grading, no persistent world, no browser.
- **The 2026 hook landed harder than predicted.** Vector indexes are now
  every backend team's problem: pgvector 0.8.x on Postgres 18 tuning
  folklore is everywhere (ef_search/m/ef_construction), mem0's "70×
  latency" postmortem, pgvectorscale/DiskANN workarounds for filtered
  ANN. Engineers tune HNSW knobs by superstition. That is exactly the
  kernelspace/OS shape: used daily, reasoned about never.
- **Market signal.** CodeCrafters raised a $1.8M seed (Feb 2026) to grow
  build-your-own-X for experienced devs — but desktop-CLI, no world, no
  adversarial capstone. Our formula stays differentiated.
- **Series fit.** kernelspace = the machine, byzantine = the network,
  tablespace = the data at rest. The three compose into the finale (§9).

## The formula (inherited verbatim, do not re-litigate)

1. **Isomorphic teaching** — every idea mapped to something a backend
   engineer already owns (buffer pool ≡ OS VM for one file; WAL ≡
   journaling your intentions; MVCC ≡ copy-on-read snapshots; volcano ≡
   Iterator chains they already write; HNSW ≡ skip lists in graph form).
2. **Sims as truth machines** — buffer pool, B+tree splits, crash
   recovery, snapshot visibility, ANN recall/latency: made visible.
3. **Local-only Rust labs, browser-graded** — the zero-dep wasm ABI
   (`ks_alloc`/`ks_free`/`ks_run`/`ks_invoke`, crate stays named `kslab`
   exactly as byzantine kept it); `cargo test` ≡ site checks; traps
   render as "not implemented yet."
4. **One file the student edits per lab** (`src/<name>.rs`); harness in
   `src/lib.rs` with `self_checks() -> Vec<kslab::Check>`; deterministic
   xorshift rng; "paste your previous lab's solution, add X" progression.
5. **A persistent world** — student's components plug in cumulatively and
   run against shared deterministic traffic (below: The Engine).
6. **Calibrated adversarial scenarios** — crash injection, convoys, bloat
   storms: thresholds proven against baselines, never guessed.
7. **A capstone that executes claims** — business cases ("should we pay
   for a vector DB?") recomputed from the student's own measurements.
8. **Agent-native tutoring** — llms.txt, per-lesson markdown export,
   AGENTS.md in every lab zip. The student's own agent tutors.
9. **Zero-server, local-first** — honor system + exportable progress +
   git as the lab-work backup.

**Platform reuse (the actual 10x), concrete:** fork `/root/byzantine` →
`src/pages/*` (Cluster.tsx becomes Engine.tsx), `src/data` registries
(labs.ts, tracks.ts, lessons/, drills.ts, progress.ts), `labs/` workspace
layout (kit + per-lab crates + gitignored `_solutions/`), `scripts/
pack-labs.py` (SHARED + crate_files helpers), `scripts/verify-wasm-lab.ts`,
`scripts/export-lessons-md.ts`, the Playwright e2e rig pattern (verify.mjs
+ verify-links.mjs), the GH Pages deploy workflow. New build is: 6 Rust
labs + harnesses, the Engine world page, ~24 lessons, drills content.

## Curriculum map — T0 → T6 + capstone (~24 lessons)

Audience entry: comfortable writing SQL and reading EXPLAIN; has never
opened a page file.

- **T0 Foundations — the disk contract.** Why pages; what 8KB buys; I/O
  cost model (random vs sequential, SSD truth vs HDD folklore); the
  buffer pool as an OS for one file; clock-sweep eviction.
- **T1 Storage.** Slotted pages, tuple layout, null bitmaps, overflow/
  TOAST, free-space maps, tombstones vs in-place update.
- **T2 Indexing.** B+tree anatomy (separators, splits, merges, balance
  proofs); prefix compression; LSM as the write-optimized counterpoint
  (levels, compaction, write amp); when each wins; ART mention.
- **T3 Durability.** WAL protocol (log first, flush later), LSNs,
  checkpoints, ARIES-style redo/undo, group commit, fsync honesty.
- **T4 Concurrency.** MVCC (versions, snapshots, visibility rules),
  isolation anomalies (dirty/non-repeatable/phantom/write-skew), SSI in
  one lesson, vacuum & bloat, hot-page contention.
- **T5 Queries.** Volcano pull model; NLJ vs hash vs merge join;
  statistics and selectivity; cost-based planning; why the planner
  mis-estimates (correlation, stale stats).
- **T6 Vectors.** ANN physics: curse of dimensionality, why exact scan
  dies; HNSW layer-by-layer; recall/latency as an SLO trade-off;
  pgvector internals (0.8 iterative scans, halfvec, parallel build);
  the filtered-ANN problem and DiskANN-style answers; when NOT to add a
  vector DB.
- **Capstone — Crash Week + the business case.** §7.

## Lab arc (6 labs, 5 grade on hard invariants)

| # | slug | student builds | graded on |
|---|------|----------------|-----------|
| 01 | slotted-pages | page allocator + record insert/read/delete | free-space accounting exact, no overlap, records survive defrag |
| 02 | btree | B+tree insert/scan/delete w/ split+merge | sortedness, separator validity, sibling links, min-occupancy — under adversarial key orders (ascending, descending, zipf, dup-heavy) |
| 03 | wal | WAL writer + recovery | checksums, replay idempotence, committed-is-durable — graded by **killing the wasm mid-write** (the byzantine partition-injection trick, applied to crashes) |
| 04 | mvcc | versioned store + snapshots | no dirty reads, snapshot repeatability, ww-conflict detection — under a deterministic interleaving scheduler |
| 05 | volcano | iterator executor over their pages+tree | tuple-correct results vs reference on a fixed query suite (select/project/join/aggregate) |
| 06 | hnsw | mini-HNSW + a tiny cost model choosing scan-vs-index | recall@10 vs latency curve against seeded synthetic clustered vectors; planner picks index iff it wins given the stats. Graded on **curves with wide bands**, not booleans — the honest stretch |

Lab conventions carried from byzantine:

- Harness-side determinism: xorshift streams, fixed seeds per check;
  crash/interleaving points enumerated by the harness, not by timing.
- Bring code forward: lab 03+ templates say "paste your previous
  solution, add X." By lab 05 the student's wasm is a real engine.
- Template↔solution discipline: `labs/<lab>/src/*.rs` ships the
  todo!() template; `labs/_solutions/` (gitignored) holds references;
  pack script ships templates only — verified before every deploy.
- Red/green gate per lab: template N red, solution N green, wasm
  ABI-verified headless (`bun scripts/verify-wasm-lab.ts`), template
  traps render "not implemented yet," cross-lab wasm rejected.

## The persistent world — The Engine

(Working title from research: "BufferPool World." Fleet : kernelspace ::
Cluster : byzantine :: **Engine** : tablespace.)

One database engine in the browser, assembled cumulatively from the
student's lab artifacts, driven by a **deterministic trace player**:

- Buffer pool visualization: hit rate, eviction waves, dirty-page
  watermark, checkpoint spikes — the database convoys, visible.
- Trace modes (all local, all licensed):
  - **TPC-C block-I/O traces** (SNIA iotta.snia.org license) — the OLTP
    adversary; hot pages, checkpoint bursts.
  - **JOB/IMDB join-order benchmark** — the planner's nemesis; shows
    mis-estimation cost on real skew.
  - **ClickHouse public web-analytics dataset** (downsampled) — the
    scan-heavy counterpoint.
  - **Synthetic clustered vectors** (seeded, generated in-page) — the
    ANN workload; default over real SIFT data to keep zips small and
    licenses trivial.
- Every run replayable; divergence between student's engine and the
  reference visualized page-by-page.

Traces ship as small downsampled JSONL in `public/traces/`; the player
normalizes them into one request stream shape (the kernelspace
trace-mode pattern).

## Crash Week — adversarial drills + capstone

`/drills` page (byzantine's Partition Drills pattern: incident cards,
static telemetry, graded WRONG/CORRECT, no wasm required for the cards):

1. **Crash mid-checkpoint** — diagnose which committed rows are at risk
   from real WAL telemetry; answer: none, and *why the LSN says so*.
2. **Bloat storm** — update-heavy trace, vacuum lag; read the dead-tuple
   curve and pick the intervention.
3. **Hot-page convoy** — one index page serializing the world; find it
   from latch-wait telemetry.
4. **Recall collapse** — a filtered ANN query whose recall falls off a
   cliff; explain the graph disconnection, not the knob.

**Capstone (graded, executes claims):** the student's full engine
(labs 01–05) + their HNSW (lab 06) run the T6 business case: "the team
wants to add a dedicated vector DB for 5M embeddings." The site
recomputes the claim against the student's own measured recall/latency
curves on the synthetic corpus + their engine's scan throughput. The
deliverable is a one-page decision doc whose numbers came from *their*
artifacts. Fleet Week pattern: the case is graded on whether the
recommendation survives the measurements, not on the recommendation.

## Execution phases

1. **Fork + rebrand.** Copy byzantine → /root/tablespace; swap
   registries (labs.ts empty, tracks.ts T0–T6, lessons skeleton,
   progress.ts counts); Cluster.tsx → Engine.tsx stub; de-byzantine
   strings (CommandPalette, badges, footer); domain + deploy workflow
   (tablespace.play.naigap.com, same GH Pages + wildcard DNS path).
2. **Labs 01–02 + T0–T1 lessons + The Engine v0** (buffer pool viz over
   the student's page allocator; TPC-C trace mode first).
3. **Labs 03–04 + T2–T4 lessons** (crash injection harness is the risky
   piece — build it first inside lab 03).
4. **Labs 05–06 + T5–T6 lessons + Crash Week drills** + JOB trace mode.
5. **Pack, verify, deploy.** tsc/eslint/build clean; pack-labs.py ships
   templates (verify!); headless ABI verify all 6; Playwright e2e both
   suites against the live site (routes, lab upload flows green/red,
   drills, Engine page; remember: GH Pages deep links return 404 *status*
   by design — filter the navigation document).

## Verified toolchain facts (carried from byzantine)

- rustup/cargo at `~/.cargo/bin` (PATH prefix needed), wasm32 target
  installed; labs are a Cargo workspace at `labs/`.
- Site build: `bun run build` in the repo root; zips via
  `python3 scripts/pack-labs.py`.
- No system node/npm — only bun; the Playwright rig is a standalone node
  tarball in /tmp (tmpfs — rebuild by re-downloading node v22 +
  `npm i playwright` + `npx playwright install chromium --only-shell`).
- Deploy: push to master → `.github/workflows/deploy.yml` → GH Pages.
  gh CLI authenticated as praveen13.
- kernelspace (/root/kernelspace) and byzantine (/root/byzantine) are
  both untouched platform sources; fork from byzantine.

## Honest risks (named now, not discovered later)

- **Planner grading is fuzzy.** Mitigation: grade plan *properties*
  (index scan chosen iff selectivity below threshold given fixed stats),
  never exact costs. Wide bands, documented.
- **HNSW nondeterminism.** Mitigation: seeded construction rng, recall
  measured against exact brute-force ground truth computed in-page, pass
  bands set from baseline runs (calibrated, not guessed).
- **Crash-injection harness complexity** (lab 03). It is the single
  hardest new harness — schedule it first, inside phase 3, with the
  byzantine lab-05 OOM lesson in mind: adversarial loops need message/
  step bounds everywhere.
- **Browser trace sizes.** Downsample hard; if a trace can't fit in a
  few hundred KB of JSONL it doesn't ship.

## The series finale (stretch, not committed)

byzantine's capstone artifact is a linearizable KV; tablespace's is an
MVCC engine with a vector index. They compose: the student's byzantine
`raft.rs` replicating their tablespace engine = a distributed SQL
database. Optional lab 07 shape: the Engine page loads the student's
byzantine lab-06 wasm as the replication layer over their lab-04 MVCC
store. "You've built the machine, the network, and the data — now put
them together." Spec it only after tablespace ships.

## Sources (landscape verification, 2026-08-09)

- CMU 15-445/BusTub: 15445.courses.cs.cmu.edu (Spring 2026, still C++17)
- Demand repos: github.com/skyzh/mini-lsm · spandanb/learndb-py ·
  Ricoledan/vectordb-from-scratch · nibzard/plandb
- Vector wave: pgvector 0.8.2/PG18 tuning (nerdleveltech.com) ·
  mem0.ai/blog/how-we-cut-vector-search-latency-by-70x ·
  callsphere.ai HNSW tuning · dbi-services pgvector DBA guide (2026-03)
- Market: CodeCrafters $1.8M seed (Feb 2026, sfruby.com/news)
- Datasets: iotta.snia.org (TPC-C block-I/O) · JOB/IMDB · ClickHouse
  public datasets · DuckDB tpch extension
- Prior art to cite, not copy: Database Internals (Petrov) · CMU 15-721 ·
  postgres internals (momjian.us) · USFCA B+tree visualizer

## RESUME POINT

**Phase 1 DONE (2026-08-09, commit 09945d0):** forked byzantine →
/root/tablespace, rebranded end-to-end (site strings, CNAME
tablespace.play.naigap.com, llms.txt, logo, badge-t6.svg added, progress
namespace `tablespace:v1`, query-plan rank ladder SEQ SCAN→SUPERUSER),
registries swapped to the tablespace curriculum: 7 tracks / 25 lesson stubs
(real titles+hooks+outlines, blocks marked in-development), 6 lab entries in
src/data/labs.ts (check ids are the contract the Rust harnesses must emit),
4 Crash Week drill cards written in full, Engine.tsx stub page at /engine.
Fixed two dead links inherited from byzantine (`/forge/<id>` → `/labs/<id>`
on the labs page; `/lab/<sim>` → `/<sim>` in exercise cards + linked-sim
chips — **byzantine live still has these 404s; backport candidate**).
Verified: tsc -b clean, eslint clean, bun run build clean, preview smoke
200s on all routes. labs/ workspace = kit only (byzantine crates deleted);
pack-labs.py PACKAGES updated to the 6 new labs (zip names, edit files,
tests files are the contract); git repo initialized (master).

**Next action — phase 2:** build labs/slotted-pages (template with todo!()
bodies in src/page.rs + harness src/lib.rs emitting check ids
insert_read/no_overlap/freespace_accounting/delete_reuse/storm +
tests/page_tests.rs) and labs/_solutions/slotted-pages. Reference pattern:
/root/byzantine/labs/kv-store (harness shape) + labs/kit/src/lib.rs (kslab
ABI). Gate per lab: template N red / solution N green via cargo test, wasm
ABI-verified headless (bun scripts/verify-wasm-lab.ts), template traps
cleanly. Then lab 02 btree, then T0/T1 lesson content + Engine v0 sim.
