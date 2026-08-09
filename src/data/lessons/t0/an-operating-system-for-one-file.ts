import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l3',
  slug: 'an-operating-system-for-one-file',
  trackId: 't0',
  index: 3,
  title: 'An Operating System for One File',
  minutes: 20,
  hook: 'The buffer pool: frames, pins, dirty bits — and why the database distrusts the OS page cache it runs on top of.',
  exercise: 'quiz+sim',
  simId: 'engine',
  blocks: [
    {
      type: 'prose',
      md: `T0.L1 made the page the atom; T0.L2 priced it: ~100ns if the page is in DRAM, ~50µs if you have to go to NVMe — a 500× gap. The engine's entire runtime strategy follows from that gap: **don't go to disk.** The machine built for that refusal is the **buffer pool**: a userspace cache of page-sized frames that the engine allocates, indexes, and defends itself — pointedly duplicating machinery the OS already has.

This lesson is the machinery — four fields per frame — and then the argument you should be able to have at a whiteboard: why not just \`mmap\` the data files and let the kernel do its job?`,
    },
    {
      type: 'prose',
      md: `## Four fields run the engine

The size is fixed at startup — \`shared_buffers\` in Postgres (default 128MB, a 2002 default somehow still shipping on 2026 hardware), \`innodb_buffer_pool_size\` in MySQL (also 128MB; the folk rule for a dedicated box is 60–80% of RAM). From then on, the pool is:

- **Frames.** A fixed array of page-sized slots. A frame is the RAM twin of a disk page: same 8KB — one lives in the heap file, one lives here.
- **The page table.** A hash map from \`(file, page #)\` → frame. Yes, the same name as your VM page table, and yes, the same job: identity → location, expected O(1). Every page access in the engine goes through this map — it is one of the hottest data structures in the system.
- **Pin count.** How many backends are reading or writing this frame *right now*. A frame with pin > 0 is unevictable, full stop. A pin is a borrow: the backend holds a raw pointer into shared memory, and the pool may not reclaim what it is holding.
- **Dirty bit.** Set when the page in the frame has been modified since it was read in. A dirty victim can't simply be dropped — it must be written back, and by T3's law, the WAL records describing its changes must be durable *first*.

That last constraint has vocabulary you should own: every serious engine runs **STEAL / NO-FORCE**. STEAL: the pool may evict a page dirtied by a transaction that hasn't committed yet (stealing its frame). NO-FORCE: commit does *not* force the transaction's data pages to disk — only the WAL is forced. This pair is why commits are cheap and crashes are survivable, and it only works because the log exists. T3 is the proof.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — the pool at work: one lookup, three outcomes',
      height: 44,
      nodes: [
        { id: 'exec', x: 4, y: 10, w: 16, h: 10, label: 'executor', sub: 'needs page 47', color: '#22D3EE' },
        { id: 'ptab', x: 26, y: 10, w: 20, h: 10, label: 'page table', sub: 'hash: page → frame', color: '#3EF2A4' },
        { id: 'f0', x: 54, y: 1, w: 20, h: 8, label: 'frame 0', sub: 'p47 · pin 1', color: '#3EF2A4' },
        { id: 'f1', x: 54, y: 11, w: 20, h: 8, label: 'frame 1', sub: 'p12 · dirty', color: '#FBBF24' },
        { id: 'f2', x: 54, y: 21, w: 20, h: 8, label: 'frame 2', sub: 'p08 · pin 0', color: '#A78BFA' },
        { id: 'f3', x: 54, y: 31, w: 20, h: 8, label: 'frame 3', sub: 'empty' },
        { id: 'disk', x: 82, y: 12, w: 14, h: 14, label: 'disk', sub: '~50µs', color: '#FB7185' },
      ],
      edges: [
        { from: 'exec', to: 'ptab', label: 'lookup' },
        { from: 'ptab', to: 'f0', label: 'hit' },
        { from: 'ptab', to: 'disk', label: 'miss' },
      ],
      steps: [
        { caption: 'Hit: the page table maps page 47 to frame 0. Pin it (pin 1) — while any backend holds a pin, the frame is untouchable. Cost: ~100ns and a hash probe.', active: ['exec', 'ptab', 'f0'], edges: ['exec->ptab', 'ptab->f0'] },
        { caption: 'Miss: no entry. A victim with pin 0 must be chosen — frame 2 is eligible — the old page is dropped, page 47 is read in: ~50µs on NVMe, ~500× the hit path.', active: ['ptab', 'f2', 'disk'], edges: ['ptab->disk'] },
        { caption: 'The twist: if the chosen victim is dirty (frame 1), it must be written back first — and the WAL describing its changes must already be durable. That ordering law is all of T3.', active: ['f1'] },
      ],
    },
    {
      type: 'prose',
      md: `## Why not mmap?

You already own a page cache: the kernel's. \`mmap\` the heap file, read bytes, and the OS faults whole pages in and out on demand — zero lines of cache code. Every serious relational engine refuses the deal, and the refusal is the lesson:

- **The OS evicts on its schedule, blind to your workload.** Global page reclamation cannot tell your B+tree root from a backup tarball streaming through the page cache. One \`tar czf\` of the data directory and your working set is on disk.
- **The OS flushes on its schedule.** Dirty writeback runs on kernel cadence (the classic 30-second \`dirty_expire\` timer) and can stall your writes in bursts you cannot order, throttle, or even observe cleanly.
- **The OS knows nothing about your WAL.** T3's durability law: a dirty data page must not reach disk before the log record describing it. The kernel has never heard of your log and will cheerfully violate the ordering.
- **Errors arrive as SIGBUS, not errno.** A failed read on an \`mmap\`'d page doesn't return EIO from a \`read()\` call you can wrap in error handling — it delivers a signal to your process. Databases are not allowed to segfault on I/O errors.

So engines do their own I/O: \`pread\`/\`pwrite\` into the pool, increasingly with \`O_DIRECT\` to skip the OS cache entirely (InnoDB's default) or with async I/O — Postgres lived with double buffering (OS cache plus its own pool) for decades and only landed real asynchronous I/O, via io_uring, in Postgres 18. The honorable exception: **LMDB** is built on \`mmap\` and says so in its design docs — it traded the control away deliberately (single writer, no WAL, the OS flushes when it flushes) and gets read performance and radical simplicity in return. That is the shape of a real engineering argument: not "mmap bad," but *know which controls you are selling.*`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'the tarball that ate your hit rate',
      md: `A classic 02:00 incident: the nightly backup — \`rsync\`, \`tar\`, \`pg_basebackup\` — streams the entire data directory through the OS page cache. The kernel, blind, evicts genuinely hot pages to hold file copies nothing will ever re-read. Hit rate craters, p99 climbs, everything recovers by 03:00, and the postmortem says "load spike." The OS cache has no workload awareness because it *can't*: it doesn't know which pages are your index roots and which are one-pass copies. Your buffer pool exists because that knowledge *is* available — one level up. (T0.L4 is about what happens when the pool makes the same mistake internally, with its own scans.)`,
    },
    {
      type: 'prose',
      md: `## Hit rate is the pulse

Do the mean-service-time arithmetic once and you will read hit-rate dashboards differently forever. Miss cost on NVMe ≈ 50µs; hit cost ≈ 100ns — call the hit free:

- **99% hit** → mean ≈ 0.01 × 50µs = **500ns** per logical read.
- **90% hit** → 0.10 × 50µs = **5µs**. Ten times slower, from a nine-point drop.
- **50% hit** → **25µs**. Fifty times slower than 99%.

On spinning rust (miss ≈ 10ms) the same 90% is **1ms per read** — you now own a disk-speed database carrying an expensive RAM ornament. When a miss costs ~500 hits, the tail doesn't dominate the mean; it *is* the mean.

This is why operators watch hit rate like an ECG (\`pg_stat_database.blks_hit\` / \`blks_read\`), and why "how much RAM does the database need?" has a real answer: **enough that the working set fits** — the set of pages re-referenced within your workload's re-reference window. Gray & Putzolu priced the trade in 1987 as the **five-minute rule**: cache a page if it will be re-referenced more often than every ~5 minutes; below that frequency, re-reading is cheaper than the RAM it sits in. The interval floats with hardware prices (flash moved it), but the framing is eternal: the pool is money — spend it on pages that pay rent.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '500 ns', label: 'mean read @ 99% hit', hint: '0.01 × 50µs NVMe miss. Healthy OLTP territory.' },
        { value: '5 µs', label: 'mean read @ 90% hit', hint: 'Ten times slower than 99% — from a nine-point drop. The miss tail is the mean.' },
        { value: '25 µs', label: 'mean read @ 50% hit', hint: 'Half your reads are disk round-trips; the pool is mostly decoration at this point.' },
        { value: '1 ms', label: 'mean read @ 90% hit, HDD', hint: 'Same hit rate, spinning disk: a disk-speed database with a RAM ornament.' },
      ],
    },
    {
      type: 'exercise',
      simId: 'engine',
      title: 'First contact: find the working set',
      tasks: [
        'Open The Engine, pick the oltp trace, set the pool to 8 frames, and run it to the end. Note the final hit rate.',
        'Run the identical trace at 64 frames. Same requests, same order — only the frame count changed. Compare the hit-rate curves.',
        'Keep doubling until the hit rate stops climbing. The pool size where the curve bends is the trace\'s working set — write it down.',
        'At the knee size, flip the eviction toggle between LRU and clock-sweep and rerun. Watch whether the curves separate. T0.L4 explains what you just saw.',
      ],
      note: `What you just saw: hit rate vs pool size is a **knee curve**, and the knee sits at the working set. Below it, the pool thrashes — nearly every eviction is a near-future miss, so each added frame buys hit rate almost linearly. Above it, extra frames cache pages nobody re-reads, and the curve flattens toward 100% only as the whole trace fits. The trace player is deterministic — the identical request stream every run — so any difference between two runs is your knob, never luck. If your curves match a classmate's exactly, that is the determinism working, not a bug.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'The eviction pass needs a victim, and frame 12\'s pin count is 2. What happens?',
          options: [
            'The frame is written to disk and evicted anyway',
            'The pin count is decremented and the frame is evicted',
            'The frame is skipped — pins mean backends are actively reading or writing it; only pin-0 frames are candidates',
            'The eviction pass blocks until the pins drop to zero',
          ],
          correct: [2],
          explanation:
            'A pin is a borrow: the backend holds a raw pointer into shared pool memory. Evicting under a live pin is a use-after-free with extra steps — which is why "evicted the wrong frame" bugs in buffer managers corrupt state instead of merely losing cache.',
        },
        {
          q: 'Why do serious engines refuse to just mmap the data files?',
          options: [
            'mmap is always slower than read()',
            'mmap files are limited to the size of RAM',
            'The OS evicts and flushes on its own schedule, blind to the workload — and it knows nothing about the WAL, so a dirty page can reach disk before the log that must precede it; I/O errors arrive as SIGBUS, not errno',
            'mmap breaks page checksums',
          ],
          correct: [2],
          explanation:
            'Durability needs ordering (WAL before data — T3) and performance needs workload-aware eviction; the kernel offers neither. LMDB is the deliberate counterexample — it accepted those exact constraints by design. Know which controls you are selling.',
        },
        {
          q: 'On NVMe (~50µs random page read), a pool\'s hit rate slides from 99% to 90%. The mean logical read gets…',
          options: [
            'About 10% slower',
            'About 2× slower',
            'About 10× slower — ~500ns to ~5µs: when a miss costs ~500 hits, the miss tail is the mean',
            'Unchanged until hit rate crosses below 50%',
          ],
          correct: [2],
          explanation:
            'Mean ≈ miss rate × miss cost: 0.01 × 50µs = 500ns; 0.10 × 50µs = 5µs. Nine points of hit rate bought a 10× wall-clock regression — this is why hit-rate graphs get watched like a pulse, and why "add RAM" is so often the correct answer.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the economics and the argument',
      md: `The economics: **Gray & Putzolu, "The 5 Minute Rule for Trading Memory for Disc Accesses" (1987)**, then **Goetz Graefe's 20-year revisit (2007)** for what flash did to the interval — the knee you just found in the sim, priced in dollars. The mmap argument, in public: the **pgsql-hackers mmap threads** for the refusal, and **LMDB's design documents (Symas)** for the acceptance — the best engineering arguments have two honest sides, so read both. The present tense: **Postgres 18's asynchronous I/O (io_uring)** release notes — the "just pread" era ending in production, and an applied lesson in why it took this long.`,
    },
  ],
}

export default lesson
