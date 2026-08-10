/**
 * Forge labs — local-only Rust labs, graded in-browser (same zero-dep
 * wasm ABI as the rest of the platform: ks_alloc/ks_free/ks_run).
 * Tablespace arc: one storage engine, built subsystem by subsystem.
 */

import type { TrackId } from '@/data/lessons/types'

export interface ForgeLabCheck {
  id: string
  label: string
}

export interface ForgeLab {
  id: string
  index: number
  title: string
  hook: string
  trackId: TrackId
  lessonId: string
  minutes: number
  zip: string
  artifact: string
  editFile: string
  completion: { title: string; next: string }
  checks: ForgeLabCheck[]
  brief: string[]
}

export const FORGE_LABS: ForgeLab[] = [
  {
    id: 'rust-kv',
    index: 0,
    title: 'Fix the Compiler First',
    hook: 'The warmup: five compile errors that each teach one Rust move, then compare-and-set and a prefix scan — the toolchain loop before the concepts bite.',
    trackId: 'tr',
    lessonId: 'tr.l4',
    minutes: 40,
    zip: '/labs/rust-kv.zip',
    artifact: 'target/wasm32-unknown-unknown/release/rust_kv.wasm',
    editFile: 'src/kv.rs',
    completion: {
      title: 'all three green — the compiler is your colleague now.',
      next: 'next: lab 01. Eight kilobytes of order — and this time the errors are logic, not syntax.',
    },
    checks: [
      { id: 'basics', label: 'get/put/delete round-trip after the compile fixes' },
      { id: 'cas_semantics', label: 'cas applies iff current == expected (None = absent)' },
      { id: 'storm', label: '500 ops vs a reference model' },
    ],
    brief: [
      'Every other lab in this course hands you a compiling template and a failing suite. This one hands you a file that does not compile at all — five deliberate errors, rustlings-style, each one a single Rust move: a binding you must declare mutable, a String used after it moved, a match that has not considered every case, a function whose return type lies about what it hands back, a shared borrow asked to mutate. The compiler is the tutor here: read each message the way you would read a code review from someone pedantic and always right, apply the fix it suggests, and understand why the rule exists before you rerun.',
      'The loop is the one every forge lab runs, and this lab exists to make it muscle memory: cargo test, read, fix, rerun. The first red is the compiler\'s, not the checks\' — the suite cannot even run until the crate builds. Once it does, the basics check flips green immediately, because your five fixes just finished get/put/delete. Two todo!()s remain: cas — write iff the current value equals what you expected, None meaning "the key must be absent" — and scan_prefix, a sorted range walk over the BTreeMap. A todo!() left standing traps the module, and the lab page renders the trap as "not implemented yet": half-done is loud here, never silent. Green locally, then cargo build --release --target wasm32-unknown-unknown and drop the .wasm on the page.',
      'Why a warmup at all: labs 01–06 assume you read Option, Result, and &mut the way you read assignment — no translation step. The slotted page in lab 01 is hard enough without also learning what "cannot borrow as mutable" means while you are inside it. Build the fluency here, where the whole store fits in your head, and the eight kilobytes of order that come next cost you design effort instead of syntax tax.',
    ],
  },
  {
    id: 'slotted-pages',
    index: 1,
    title: 'Eight Kilobytes of Order',
    hook: 'The atom of everything: a slotted page — header, slot array, records growing the other way. Insert, read, delete, defragment, and account for every byte — graded to the byte.',
    trackId: 't1',
    lessonId: 't1.l1',
    minutes: 60,
    zip: '/labs/slotted-pages.zip',
    artifact: 'target/wasm32-unknown-unknown/release/slotted_pages.wasm',
    editFile: 'src/page.rs',
    completion: {
      title: 'all five green — your page keeps honest books.',
      next: 'next: T2 hangs a tree on top of it. Your slots just became the leaves of an index.',
    },
    checks: [
      { id: 'insert_read', label: 'records round-trip byte-exact' },
      { id: 'no_overlap', label: 'no two live records overlap' },
      { id: 'freespace_accounting', label: 'free space exact after every insert/delete' },
      { id: 'delete_reuse', label: 'deleted space is reclaimable (defrag works)' },
      { id: 'storm', label: '2000 ops vs a reference page model' },
    ],
    brief: [
      'Everything a database ever stores lives inside a fixed-size page, and the slotted layout is why: a header up front, a slot array growing downward, record bytes growing upward, free space in the middle. Rows move (updates, defrag) and only their slot pointer changes — the (page, slot) id every index points at stays stable. This one indirection is why the whole engine doesn\'t re-index on every update.',
      'The discipline is accounting: free space is a number you maintain, not a hope. Insert claims exactly header+slot+record bytes; delete returns them; defrag slides records down and remaps slots without changing what reads return. Get it wrong by four bytes anywhere and the storm check — 2000 inserts, deletes, and re-inserts against a reference model — will find the leak.',
      'The harness is the teacher: five checks from byte-exact round-trips through overlap detection to the storm. The overlap check is the one that humbles people: a slot that points into another record\'s bytes passes every polite test and fails exactly when the data matters.',
    ],
  },
  {
    id: 'btree',
    index: 2,
    title: 'Stay Sorted Under Fire',
    hook: 'The default index, built honestly: separator keys, splits that cascade to the root, merges on underflow — and balance proofs that hold under ascending, descending, and zipf key orders.',
    trackId: 't2',
    lessonId: 't2.l1',
    minutes: 90,
    zip: '/labs/btree.zip',
    artifact: 'target/wasm32-unknown-unknown/release/btree.wasm',
    editFile: 'src/tree.rs',
    completion: {
      title: 'all five green — sorted, balanced, and provably so.',
      next: 'next: T3 makes it durable. Your tree is about to learn what a crash is.',
    },
    checks: [
      { id: 'lookup_correct', label: 'every inserted key found; absent keys absent' },
      { id: 'ordered_scans', label: 'full and range scans come back sorted' },
      { id: 'split_balance', label: 'minimum occupancy holds after splits' },
      { id: 'adversarial_orders', label: 'descending / zipf / dup-heavy key orders' },
      { id: 'storm', label: '3000 mixed ops vs a reference model' },
    ],
    brief: [
      'A B+tree is three promises: every leaf at the same depth, every node at least half full, every separator a truthful signpost. Records live only in the leaves; leaves are linked for scans; internal nodes carry separators that route, not data. Fanout is ~hundreds per page-sized node, which is why ten million rows sit three levels down.',
      'The mechanics that break students: leaf split divides records and PROMOTES the separator (it also stays in the right leaf); internal split divides separators and pushes the middle one UP (it stays in no child); delete underflow borrows from a sibling before it merges. Ascending inserts split the rightmost leaf forever — the adversarial_orders check exists because that shape is every auto-increment primary key in production.',
      'The harness is the teacher: lookups and scans against a reference, then occupancy proofs after storms of the meanest key orders we could seed. Your tree doesn\'t just have to work — it has to stay provably balanced while working.',
    ],
  },
  {
    id: 'wal',
    index: 3,
    title: 'Write It Down First',
    hook: 'Durability as a protocol: log every mutation BEFORE it touches state, checksum every record, and make recovery a deterministic replay — graded by killing your module mid-flush.',
    trackId: 't3',
    lessonId: 't3.l1',
    minutes: 75,
    zip: '/labs/wal.zip',
    artifact: 'target/wasm32-unknown-unknown/release/wal.wasm',
    editFile: 'src/wal.rs',
    completion: {
      title: 'all five green — your store survives its own death.',
      next: 'next: T4 lets many transactions share it. Your log just became the arbiter of what happened.',
    },
    checks: [
      { id: 'log_first', label: 'state never changes before its log record is durable' },
      { id: 'checksum_corruption', label: 'torn/corrupt tail records detected and dropped' },
      { id: 'replay_idempotent', label: 'replaying the log twice changes nothing' },
      { id: 'committed_durable', label: 'kill mid-flush: every committed write survives recovery' },
      { id: 'crash_storm', label: 'random crash points vs a reference model' },
    ],
    brief: [
      'The buffer pool wants steal + no-force: flush dirty pages whenever convenient, never wait for commit. That policy is exactly why the write-ahead log must exist — uncommitted changes can reach disk early, committed ones can arrive late, and the log is the only record of what was true. The rule is one sentence: no data page may be flushed before the log records describing its changes are durable.',
      'Crash recovery is the test, literally: the harness lets you run, kills the module at a seeded point (mid-record, mid-flush, mid-checkpoint), then replays. A torn tail record must be caught by checksum and dropped, not applied. Replay must be idempotent — run it twice, get the same state — because crashing mid-recovery is a Tuesday, not an edge case.',
      'The invariant the committed_durable check grades: every write the client was told committed is present after recovery; nothing half-committed leaks in. That sentence is the entire durability contract of every database you have ever used, and you are about to implement it in one Rust file.',
    ],
  },
  {
    id: 'mvcc',
    index: 4,
    title: 'Many Worlds, One Truth Each',
    hook: 'Readers never block writers: versioned rows, snapshots, and the visibility rule — graded against a serial reference under a deterministic interleaving scheduler.',
    trackId: 't4',
    lessonId: 't4.l1',
    minutes: 90,
    zip: '/labs/mvcc.zip',
    artifact: 'target/wasm32-unknown-unknown/release/mvcc.wasm',
    editFile: 'src/mvcc.rs',
    completion: {
      title: 'all five green — every transaction lives in its own honest world.',
      next: 'next: T5 gives the worlds a query language. Your versions just became answerable.',
    },
    checks: [
      { id: 'no_dirty_reads', label: 'uncommitted writes are invisible to other txns' },
      { id: 'snapshot_repeatable', label: 'a snapshot re-reads its own past, forever' },
      { id: 'ww_conflict', label: 'second writer to the same row is rejected' },
      { id: 'read_own_writes', label: 'a txn sees its own writes; others do not' },
      { id: 'interleaving_storm', label: 'enumerated interleavings vs a serial reference' },
    ],
    brief: [
      'MVCC\'s move: UPDATE never overwrites — it appends a new version stamped with its creator\'s txn id, and the old version stays for whoever can still see it. A snapshot is a point in txn-time plus the set of in-flight txns; the visibility rule is one predicate: a version is visible to you iff its creator committed before your snapshot and its deleter had not.',
      'The subtleties the checks grade: you always read your OWN writes (your uncommitted versions are visible to you and no one else); two txns writing the same row is a write-write conflict — first writer wins, second is rejected, because letting both through is how lost updates happen; and a snapshot taken at T must return the same answers at T+forever, no matter what commits later.',
      'The harness enumerates interleavings with a deterministic scheduler — begin/read/write/commit/abort across three txns, every shuffled order that matters — and compares your results against a serial reference execution. This is the course\'s invariant-grading muscle applied to concurrency: not "it passed when I tried it," but "it passes every schedule we could construct."',
    ],
  },
  {
    id: 'volcano',
    index: 5,
    title: 'Pull, Don\'t Push',
    hook: 'SQL becomes iterators: scan, filter, project, join, aggregate — open/next/close all the way down, running over YOUR pages and YOUR tree from labs 01 and 02.',
    trackId: 't5',
    lessonId: 't5.l1',
    minutes: 75,
    zip: '/labs/volcano.zip',
    artifact: 'target/wasm32-unknown-unknown/release/volcano.wasm',
    editFile: 'src/executor.rs',
    completion: {
      title: 'all five green — your engine answers questions now.',
      next: 'next: T6 teaches it a new kind of index. Your scan is about to become the baseline something must beat.',
    },
    checks: [
      { id: 'scan_project', label: 'scan + project returns the right tuples, in order' },
      { id: 'select_filter', label: 'predicates filter exactly' },
      { id: 'join_correct', label: 'nested-loop join matches the reference' },
      { id: 'aggregate_correct', label: 'group/count/sum match the reference' },
      { id: 'query_suite', label: 'the fixed query suite, end to end, over your own storage' },
    ],
    brief: [
      'The volcano model is the most reused idea in databases: every operator is an iterator with open/next/close, a query plan is a tree of them, and executing means calling next() at the root and letting the pulls cascade. No operator knows or cares what feeds it — that is the entire trick, and it composes from seq-scan to distributed SQL.',
      'This lab is where the course\'s artifacts converge: the scan reads records through your lab-01 page layout, the index scan descends your lab-02 tree, and the operators on top treat both as tuple streams. A nested-loop join is two pulls and a predicate; a hash join materializes the inner side first — the materialization point the lesson warns about.',
      'The harness checks tuples, not plans: a fixed suite of select/project/join/aggregate queries over a seeded dataset, compared row-for-row against a reference executor. Wrong order, wrong multiplicity, dropped NULL group — the reference catches all of it, because SQL semantics are exact even when your plan choices are not.',
    ],
  },
  {
    id: 'hnsw',
    index: 6,
    title: 'Approximately Right, Measurably Fast',
    hook: 'The capstone. Build the index everyone tunes by superstition: layered small-world graphs, greedy descent, honest recall — then a cost model that chooses your index only when it actually wins.',
    trackId: 't6',
    lessonId: 't6.l2',
    minutes: 90,
    zip: '/labs/hnsw.zip',
    artifact: 'target/wasm32-unknown-unknown/release/hnsw.wasm',
    editFile: 'src/hnsw.rs',
    completion: {
      title: 'all five green — you built the index behind the vector boom.',
      next: 'next: Crash Week. Four dying engines, and you have seen every one of their ghosts in simulation.',
    },
    checks: [
      { id: 'graph_invariants', label: 'layers bounded, every node reachable from the entry point' },
      { id: 'recall_band', label: 'recall@10 within the calibrated band vs brute force' },
      { id: 'latency_win', label: 'beats exact scan by the required margin' },
      { id: 'planner_choice', label: 'scan-vs-index chosen iff the index actually wins' },
      { id: 'curve', label: 'your (recall, latency) point dominates the naive build' },
    ],
    brief: [
      'HNSW is a skip list reincarnated as a graph: sparse express layers on top, dense streets at layer 0, and a greedy walk that starts at an entry point and descends. Insert descends and connects each node to m well-chosen neighbors — "well-chosen" meaning reachability, not just proximity. Every knob you have ever seen in pgvector (m, ef_construction, ef_search) is a direct price on this graph: degree, build thoroughness, beam width.',
      'Grading here is honest about what ANN is: not "correct" but measurably close. The harness computes brute-force ground truth in-page, then checks your recall@10 against a calibrated band, your latency against exact scan, and — the planner_choice check — whether your tiny cost model picks the index iff it genuinely wins given table size and dimension. An index chosen when it loses is a planner bug, not a feature.',
      'The curve check is the capstone\'s soul: your (recall, latency) operating point must dominate a naive build (small m, tiny ef) on the seeded corpus. One point on one curve, measured against truth — that is the whole vector-database business case, and it is also the Crash Week capstone: the "should we buy a vector DB?" question gets recomputed from YOUR measurements.',
    ],
  },
  {
    id: 'buffer-pool',
    index: 7,
    title: 'The Engine\'s Pulse',
    hook: 'The 15-445 opening project, our way: a buffer pool with an LRU-K replacer — pins, dirty writeback, backward k-distance, and scan resistance — graded against a reference pool under hostile traces.',
    trackId: 't0',
    lessonId: 't0.l5',
    minutes: 75,
    zip: '/labs/buffer-pool.zip',
    artifact: 'target/wasm32-unknown-unknown/release/buffer_pool.wasm',
    editFile: 'src/pool.rs',
    completion: {
      title: 'all five green — your pool keeps the working set alive.',
      next: 'next: the T7 pair. Your pool is about to feed a columnar, vectorized executor.',
    },
    checks: [
      { id: 'fetch_pin', label: 'fetch pins, unpin releases, a pinned frame is never evicted' },
      { id: 'evict_order', label: 'LRU-K picks the true backward-k-distance victim' },
      { id: 'dirty_writeback', label: 'dirty victim is written back; clean victim is not — counts exact' },
      { id: 'scan_resistance', label: 'a one-touch flood does not evict the working set' },
      { id: 'storm', label: 'seeded hostile trace vs a reference pool, stats to the unit' },
    ],
    brief: [
      'Everything above the storage layer asks for pages, and this is the component that answers: a pool of frames, a page table, pin counts, dirty bits, and a replacer that decides who leaves. T0 taught the policy landscape; this lab is the 15-445 opening project rebuilt on our terms — the replacer is LRU-K, and it is graded on the exact backward k-distance semantics the papers define.',
      'The discipline is twofold. Mechanical: a pinned frame is untouchable, a dirty victim must be written back exactly once, and the page table must never lie about residency. Policy: LRU-K tracks the last K touch times per page and evicts the page whose k-th-most-recent touch is oldest — one-touch scan pages never earn a second timestamp, so the flood dies in the history list while the working set survives. That is the T0.L4 flood story, now with your name on it.',
      'The harness is the teacher: scripted pin/unpin sequences, a trace that interleaves a hot set with one-touch floods, and a storm checked against a reference pool to the unit — hits, reads, writes, evictions. If your k-distance is off by one anywhere, the evict_order check will say which frame should have died instead.',
    ],
  },
  {
    id: 'optimizer',
    index: 8,
    title: 'The Search That Never Sleeps',
    hook: 'System R\'s 1979 dynamic program as code: enumerate join orders left-deep, prune by cost, keep interesting orders — graded on exact arithmetic against a reference optimizer over random query graphs.',
    trackId: 't7',
    lessonId: 't7.l3',
    minutes: 90,
    zip: '/labs/optimizer.zip',
    artifact: 'target/wasm32-unknown-unknown/release/optimizer.wasm',
    editFile: 'src/planner.rs',
    completion: {
      title: 'all five green — you built the component that out-argues developers.',
      next: 'next: the columnar lab. Your plan costs are about to meet a layout that changes the arithmetic.',
    },
    checks: [
      { id: 'cost_model', label: 'cost arithmetic matches the harness model exactly' },
      { id: 'left_deep_dp', label: 'cheapest left-deep plan on a 4-table chain' },
      { id: 'interesting_orders', label: 'a sorted intermediate kept when it saves a sort later' },
      { id: 'beats_naive', label: 'DP plan never loses to the naive left-to-right order' },
      { id: 'storm', label: 'seeded random query graphs: exact cost + plan match vs reference DP' },
    ],
    brief: [
      'The planner you blamed in T5 is, underneath, one beautiful algorithm: Selinger\'s dynamic program. Build plans level by level — best way to reach every pair of tables, then every triple — pruning anything dominated on cost, and keeping a dominated plan only when its output ORDER is useful downstream (the interesting-order exception that saves a sort later). n tables is n! orders to a fool and 2^n states to System R.',
      'You get the harness\'s statistics card: table cardinalities, join selectivities, per-method costs (seq scan, index scan, hash, merge — the T0/T5 constants). Your job is the search: enumerate, cost, prune, and reconstruct the winning plan with its join methods attached. The interesting_orders check is the one that separates a memoizer from an optimizer: sometimes the second-cheapest pair join is the one whose output arrives sorted, because it makes the merge join above it free.',
      'The storm grades against a reference DP over seeded random query graphs — chains, stars, cycles — and demands an exact cost match and a valid plan. Naive left-to-right ordering is provided as the punching bag: your DP must never lose to it, and on star graphs it should humiliate it.',
    ],
  },
  {
    id: 'columnar',
    index: 9,
    title: 'Ten Thousand Rows Per Heartbeat',
    hook: 'The analytical engine in miniature: compressed columns (dictionary + RLE), min-max zone maps, and batched vectorized operators — graded on exact answers, blocks skipped, and a calibrated compression band.',
    trackId: 't7',
    lessonId: 't7.l2',
    minutes: 75,
    zip: '/labs/columnar.zip',
    artifact: 'target/wasm32-unknown-unknown/release/columnar.wasm',
    editFile: 'src/column.rs',
    completion: {
      title: 'all five green — your engine reads 2% of the bytes and answers anyway.',
      next: 'next: the whole arc is yours. Crash Week is waiting — go read four dying engines.',
    },
    checks: [
      { id: 'encode_roundtrip', label: 'dictionary + RLE round-trip is byte-exact' },
      { id: 'zone_skip', label: 'min-max zones skip exactly the blocks they should' },
      { id: 'vectorized_ops', label: 'batched filter + sum over compressed columns, exact' },
      { id: 'compression_band', label: 'ratio within the calibrated band on the seeded corpus' },
      { id: 'storm', label: 'mixed query storm vs a row-store reference model' },
    ],
    brief: [
      'Turn the page sideways. A column store keeps each attribute contiguous: suddenly a scan of one column reads 2% of the bytes, compression loves the same-type runs, and the executor trades one-tuple-at-a-time for 1024-value batches that keep the CPU pipeline fed. This lab builds the smallest honest version: dictionary + run-length encodings, zone maps for skipping, and vectorized filter/sum that never decode more than they must.',
      'The graded disciplines: round-trip fidelity (compressed bytes must decode byte-exact — a lossy column store is a bug farm); zone maps that skip exactly the blocks whose min-max proves no match (the harness counts blocks read); and operators that run on batch vectors with selection masks, the X100 shape from T7.L2. The compression_band check is calibrated from the reference build on the seeded corpus — honest bands, not vibes.',
      'The storm runs a mixed analytical query load against your column store and a naive row-store reference, demanding identical answers and counting the bytes each touched. Same questions, 2% of the reads — that gap is why DuckDB exists, and you just built its childhood.',
    ],
  },
]

export function forgeLabById(id: string | undefined): ForgeLab | undefined {
  return FORGE_LABS.find((l) => l.id === id)
}
