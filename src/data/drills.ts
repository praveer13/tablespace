/**
 * Crash Week — four scripted incident cards (the capstone's oral exam).
 * Static telemetry, no wasm: the student reads the curves, calls the root
 * cause and the mitigation. Adapted from the platform's Fleet Week
 * incident-card pattern, via byzantine's Partition Drills.
 */

export interface DrillOption {
  id: string
  label: string
  correct: boolean
}

export interface DrillSeries {
  label: string
  color: string
  values: number[]
}

export interface DrillIncident {
  id: string
  title: string
  briefing: string
  telemetry: DrillSeries[]
  causes: DrillOption[]
  mitigations: DrillOption[]
  /** shown after the correct call — the "what just happened" paragraph */
  debrief: string
}

const flat = (v: number, n: number) => Array.from({ length: n }, () => v)
const ramp = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)))
const step = (before: number, after: number, at: number, n: number) =>
  Array.from({ length: n }, (_, i) => (i < at ? before : after))
const spikes = (base: number, peak: number, at: number[], n: number) =>
  Array.from({ length: n }, (_, i) => (at.includes(i) ? peak : base))

export const DRILLS: DrillIncident[] = [
  {
    id: 'crash-mid-checkpoint',
    title: 'INC-1 — The Checkpoint That Never Finished',
    briefing:
      'A primary crashes at 03:12, eighty percent into a checkpoint. On restart, recovery runs: redo from the last COMPLETED checkpoint, undo two in-flight transactions. The on-call channel is already drafting the restore-from-backup runbook — "the checkpoint was interrupted, the data files must be inconsistent." The graphs from the last hour say what actually matters.',
    telemetry: [
      { label: 'commit acks / s', color: '#3EF2A4', values: [...ramp(800, 950, 20), ...flat(0, 4)] },
      { label: 'dirty pages', color: '#FBBF24', values: [...ramp(400, 4200, 18), ...ramp(4200, 900, 6)] },
      { label: 'checkpoint progress %', color: '#A78BFA', values: [...flat(0, 8), ...ramp(0, 80, 12), ...flat(0, 4)] },
      { label: 'wal LSN advance', color: '#5CA8FF', values: ramp(100, 220, 24) },
    ],
    causes: [
      { id: 'a', label: 'Nothing is lost: the WAL is the truth, not the data pages — recovery redoes from the last completed checkpoint and undoes the two losers', correct: true },
      { id: 'b', label: 'The interrupted checkpoint left half-written pages — the tables are corrupt and must be restored', correct: false },
      { id: 'c', label: 'The two in-flight transactions were committed before the crash and are now lost', correct: false },
      { id: 'd', label: 'The WAL was truncated by the crash and recovery is only partial', correct: false },
    ],
    mitigations: [
      { id: 'a', label: 'Let recovery finish and verify — then add a crash-mid-checkpoint drill to CI so the proof is routine, not a 3am argument', correct: true },
      { id: 'b', label: 'Restore last night\'s backup — fastest path to a known-good state', correct: false },
      { id: 'c', label: 'Zero the WAL and force-start the engine, then re-run the checkpoint manually', correct: false },
      { id: 'd', label: 'Replay the binlog from the replica into the primary before allowing reads', correct: false },
    ],
    debrief:
      'A checkpoint is a performance bookmark, not a correctness point: it bounds how far back recovery must read, and interrupting it costs time, never data. The durability contract lives in one ordering rule — log records durable before the pages they describe — so every committed write is in the WAL regardless of what the data files look like. Redo repeats history unconditionally, undo removes the two transactions that never committed, and the system comes up exactly as consistent as it was at 03:12. This is lab 03\'s committed_durable check, with a pager attached.',
  },
  {
    id: 'bloat-storm',
    title: 'INC-2 — The Table That Ate the Disk',
    briefing:
      'An orders table (heavy UPDATE traffic) has grown from 40 GB to 190 GB in six weeks while row count stayed flat. Autovacuum runs every few minutes and reports success; the bloat climbs anyway. Disk projection says full in nine days. Somewhere in the telemetry is the reason vacuum is running and losing.',
    telemetry: [
      { label: 'dead tuples (M)', color: '#FB7185', values: ramp(5, 480, 24) },
      { label: 'table size (GB)', color: '#FBBF24', values: ramp(40, 190, 24) },
      { label: 'autovacuum runs / hr', color: '#A78BFA', values: flat(14, 24) },
      { label: 'oldest open snapshot age (h)', color: '#3EF2A4', values: step(0, 72, 5, 24) },
    ],
    causes: [
      { id: 'a', label: 'A 72-hour-old open snapshot (idle-in-transaction session or stale replication slot) pins the visibility watermark — vacuum runs but may reclaim nothing it can still see', correct: true },
      { id: 'b', label: 'Autovacuum is misconfigured and simply never visits this table', correct: false },
      { id: 'c', label: 'The UPDATE rate exceeds any possible vacuum throughput — the table must be partitioned', correct: false },
      { id: 'd', label: 'Index corruption is duplicating entries and inflating the table', correct: false },
    ],
    mitigations: [
      { id: 'a', label: 'Kill the ancient session / drop the stale slot, let vacuum catch up, and alarm on oldest-snapshot age so one forgotten txn can never pin the whole engine again', correct: true },
      { id: 'b', label: 'Run VACUUM FULL immediately to rewrite the table compactly', correct: false },
      { id: 'c', label: 'Increase autovacuum workers so more of them run concurrently', correct: false },
      { id: 'd', label: 'Schedule a nightly table rewrite to stay ahead of the bloat', correct: false },
    ],
    debrief:
      'MVCC\'s garbage rule: a dead tuple is reclaimable only when NO open snapshot can still see it — so the oldest open transaction pins the entire history behind it. Vacuum was running fine; it was just forbidden from doing anything by a snapshot three days old (an analytics session someone left in a transaction, or a replication slot nobody dropped). The fix is one kill and one alarm. VACUUM FULL would have locked the table for hours to treat the symptom; the cause was a watermark held hostage.',
  },
  {
    id: 'hot-page-convoy',
    title: 'INC-3 — One Page to Rule Them All',
    briefing:
      'A events table with a BIGSERIAL primary key and a created_at index takes every insert the product generates. The team doubled the writer pool from 8 to 16 connections to raise ingest throughput. Throughput fell 35%. CPU is idle, disk is idle, locks are fine — but one wait event dominates everything.',
    telemetry: [
      { label: 'insert throughput (ktps)', color: '#3EF2A4', values: [...flat(42, 8), ...ramp(42, 27, 8), ...flat(27, 8)] },
      { label: 'latch wait: page 41 (rightmost leaf)', color: '#FB7185', values: [...spikes(2, 9, [3, 9, 15], 16), ...ramp(9, 88, 8)] },
      { label: 'active writers', color: '#5CA8FF', values: step(8, 16, 8, 24) },
      { label: 'buffer hits / s', color: '#FBBF24', values: ramp(900, 980, 24) },
    ],
    causes: [
      { id: 'a', label: 'Monotonically increasing keys send every insert to the same rightmost leaf page — writers serialize on its latch, and more writers means more convoy, not more throughput', correct: true },
      { id: 'b', label: 'The WAL flush became the bottleneck once concurrency doubled', correct: false },
      { id: 'c', label: 'The writer pool exhausted connection slots and inserts are queueing at the door', correct: false },
      { id: 'd', label: 'Autovacuum on the events table is interfering with the insert path', correct: false },
    ],
    mitigations: [
      { id: 'a', label: 'Break the monotonicity: hash-prefix or UUID keys (or a partitioned index) so inserts spread across leaves — the hot page disappears by construction', correct: true },
      { id: 'b', label: 'Increase shared_buffers so the hot page stays pinned in memory', correct: false },
      { id: 'c', label: 'Reduce the writer pool back to 8 and accept the lower ceiling', correct: false },
      { id: 'd', label: 'Add a read replica and move the inserts to it', correct: false },
    ],
    debrief:
      'A B+tree under an ascending key stream is a queue disguised as an index: every insert lands on the same rightmost leaf, so every writer wants the same page latch at the same time. Eight writers already queued politely; sixteen made the convoy visible — classic anti-scaling, where adding capacity removes throughput. Everything else was idle because the bottleneck was one 8KB page. The tree was balanced, the queries were fine, and the design still serialized the world onto a single latch. Key shape is a systems decision.',
  },
  {
    id: 'recall-collapse',
    title: 'INC-4 — The Recall Cliff',
    briefing:
      'A RAG service on pgvector (HNSW, m=16, ef_search=40) returns great answers in staging. In production, every query carries a tenant filter — WHERE tenant_id = $1 — and tenants hold 0.5–2% of the rows each. Answer quality quietly collapses for small tenants: the retrieval step returns near-misses or nothing. Nobody changed the index. The recall numbers tell the story.',
    telemetry: [
      { label: 'recall@10 (unfiltered)', color: '#3EF2A4', values: flat(96, 24) },
      { label: 'recall@10 (filtered, 1% tenant)', color: '#FB7185', values: ramp(91, 22, 24) },
      { label: 'candidates passing filter per query', color: '#FBBF24', values: ramp(38, 1, 24) },
      { label: 'ef_search', color: '#A78BFA', values: flat(40, 24) },
    ],
    causes: [
      { id: 'a', label: 'Post-filtering: the walk fetches ef_search=40 candidates for the whole table, a 1% tenant owns ~0.4 of them — the graph walk never visits the tenant\'s neighborhood, so there is nothing to filter down to', correct: true },
      { id: 'b', label: 'The HNSW index decayed under production write volume and needs a rebuild', correct: false },
      { id: 'c', label: 'Small tenants\' embeddings live in a different metric space — cosine should be inner product', correct: false },
      { id: 'd', label: 'The query planner stopped using the index in production', correct: false },
    ],
    mitigations: [
      { id: 'a', label: 'Keep walking until k matches pass the filter: iterative/index-aware scans (pgvector 0.8), in-graph filtering, or a per-tenant index — and re-measure recall per tenant, not globally', correct: true },
      { id: 'b', label: 'Rebuild the index nightly so the graph stays fresh', correct: false },
      { id: 'c', label: 'Raise ef_search from 40 to 4000 and eat the latency', correct: false },
      { id: 'd', label: 'Move the tenant filter into application code after fetching top-1000', correct: false },
    ],
    debrief:
      'ANN indexes answer "nearest in the GRAPH," not "nearest that satisfy your WHERE clause." Post-filtering assumes the candidates contain enough passing rows; a selective filter breaks that assumption by arithmetic — 40 candidates against a 1% tenant is an expected 0.4 keepers, and the walk has no reason to wander into the tenant\'s subgraph at all. Recall didn\'t degrade; it was never measured under the filter. This is the exact failure the capstone business case prices: the knobs are physics, the filter is a different query, and the honest answer is measured per workload — which is why lab 06 grades your recall curve against brute-force truth.',
  },
]
