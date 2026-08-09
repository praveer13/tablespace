import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l4',
  slug: 'eviction-is-a-bet',
  trackId: 't0',
  index: 4,
  title: 'Eviction Is a Bet',
  minutes: 18,
  hook: 'LRU, clock-sweep, and the sequential-flood problem: eviction policies are predictions about your workload\'s future.',
  exercise: 'sim',
  simId: 'engine',
  blocks: [
    {
      type: 'prose',
      md: `Every page access you have ever made went through a cache that was too small. When the pool is full and a new page needs a frame, the engine must choose a victim — and that choice is a **bet**: *which resident page is least likely to be needed soon?* The perfect policy exists and is useless: Belady's MIN evicts the page needed furthest in the future, which requires knowing the future. Everything real is an approximation, and every approximation is a prediction about your workload wearing an algorithm costume.

**LRU** bets on recency: recently used pages will be used again soon. It is right often enough that it became the default everywhere — CPU caches, HTTP caches, your \`functools.lru_cache\`, your Caffeine instances. This lesson is about the workload that makes the bet lose in public, the approximation every real engine ships instead, and the scan-resistant designs that refuse to make the bet at all.`,
    },
    {
      type: 'prose',
      md: `## The sequential flood

The failure mode has a shape you will recognize instantly in the sim: a **one-pass scan** — \`SELECT count(*)\` over a 40GB table, a backup, a vacuum, your ETL's nightly extract. Every page is touched exactly once, in order, never again.

Under strict LRU, each scan page arrives as the *most recently used* page in the system. So the scan marches through the pool evicting your genuinely hot working set behind it, page by page. When the scan ends, the pool holds the tail of a table nobody will re-read, and the OLTP workload begins re-faulting its entire working set back in at ~50µs a page. Hit rate craters precisely while the box is busiest, then climbs back slowly. One scan — done, never returning — just cost you the whole cache.

Two more LRU taxes worth knowing. The hit path mutates a shared list (move-to-front on every access), which means one hot latch at hundreds of thousands of hits per second — InnoDB's buffer-pool mutex was a famous convoy before it was split into instances. And while LRU is at least immune to Belady's anomaly (it's a stack algorithm; FIFO provably isn't, and yes, there are traces where FIFO gets *worse* when you add frames), that immunity doesn't help here: the flood isn't a pathology. It's the bet simply losing.`,
    },
    {
      type: 'prose',
      md: `## Clock-sweep: the approximation everyone ships

Real engines mostly don't ship linked-list LRU. They ship **clock-sweep** (a.k.a. second chance, a.k.a. CLOCK): frames sit in a circular array; each frame carries a **usage bit**, set to 1 on every hit — cheap, no list mutation, no convoy. When a victim is needed, a **hand** sweeps the circle: bit is 1 → clear it to 0 and move on (the *second chance*); bit is 0 → victim. Eviction work is bounded by one sweep, and the hot path does almost nothing.

Postgres stretches the bit into a **usage_count from 0 to 5**: hits increment it (capped), the hand decrements it, a frame is evicted at 0 — a crude frequency counter. (\`StrategyGetBuffer\` in \`bufmgr.c\` — short enough to read standing up.) InnoDB instead keeps an LRU list but inserts new pages at the **midpoint**: the head of the "old" sublist, default 3/8 of the list (\`innodb_old_blocks_pct = 37\`). A page in the old sublist is promoted to young only if re-read **after** \`innodb_old_blocks_time\` (default 1000ms) — so a sequential flood churns only the old 3/8 and never earns promotion.

Notice what both designs are: **a recency policy patched with just enough frequency information to survive one-touch traffic.** The bit, the counter, the midpoint — the same idea in different costumes.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — clock-sweep: one hand, one bit per frame',
      height: 40,
      nodes: [
        { id: 'f0', x: 2, y: 6, w: 14, h: 9, label: 'f0', sub: 'use: 1', color: '#3EF2A4' },
        { id: 'f1', x: 18, y: 6, w: 14, h: 9, label: 'f1', sub: 'use: 1', color: '#3EF2A4' },
        { id: 'f2', x: 34, y: 6, w: 14, h: 9, label: 'f2', sub: 'use: 0', color: '#3EF2A4' },
        { id: 'f3', x: 50, y: 6, w: 14, h: 9, label: 'f3', sub: 'use: 1', color: '#3EF2A4' },
        { id: 'f4', x: 66, y: 6, w: 14, h: 9, label: 'f4', sub: 'use: 1', color: '#FB7185' },
        { id: 'f5', x: 82, y: 6, w: 14, h: 9, label: 'f5', sub: 'use: 1', color: '#FB7185' },
        { id: 'hand', x: 41, y: 26, w: 18, h: 8, label: 'hand', sub: 'sweeps →', color: '#FBBF24' },
      ],
      steps: [
        { caption: 'Every hit sets the frame\'s usage bit — no list mutation, no latch convoy. This is the entire hit path, and it is why clock-sweep ships in real engines. (Mint: the working set. Red: one-touch scan pages.)', active: ['f1', 'f4'] },
        { caption: 'Pool full: the hand checks f0 — bit 1, so it clears it to 0 and moves on. The frame was touched recently; it gets a second chance.', active: ['hand', 'f0'] },
        { caption: 'f1 also holds a 1 → cleared. At f2 the bit reads 0: victim. Eviction is bounded by one sweep and costs nothing on hits.', active: ['hand', 'f2'] },
        { caption: 'Why the flood loses here: scan pages arrive with bit 1 but are never re-touched, so the hand\'s first pass strips them and they drain first. Hot pages keep re-earning their bit between sweeps — second chance is a poor man\'s frequency counter.', active: ['hand', 'f4', 'f5'] },
      ],
    },
    {
      type: 'prose',
      md: `## Scan resistance by construction

The other school doesn't patch LRU — it **quarantines the scan**. Postgres's rule: a sequential scan bigger than \`shared_buffers/4\` doesn't enter the main pool at all. It gets a private **ring buffer of 32 pages (256KB)**: the scan cycles through its own tiny ring, evicting *its own* pages, and the working set in the main pool never sees the traffic. (VACUUM gets its own ring; bulk writes get a third, larger one.) The insight is worth stealing for your own services: when two workloads share one victim pool, the one-pass workload always wins the eviction race and loses you the cache. Separate the traffic instead.

The honest negative result, which the sim will show you: for a *pure* scan with zero reuse, **no eviction policy can help** — a cache with no locality to exploit is a pass-through. Policy choice matters on the *mixed* workload, where the question is whether the scan gets to poison the OLTP pages. That is the bet, priced.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '32 pages', label: 'Postgres scan ring', hint: 'A 256KB private buffer for scans larger than shared_buffers/4 — the flood evicts its own pages, not yours.' },
        { value: '3/8', label: 'InnoDB old sublist', hint: 'innodb_old_blocks_pct = 37: new pages insert at the midpoint and churn only this slice until promoted.' },
        { value: '1000 ms', label: 'InnoDB promotion delay', hint: 'innodb_old_blocks_time: re-read an old-sublist page inside this window and it does NOT count as reuse.' },
        { value: '0–5', label: 'Postgres usage_count', hint: 'Clock-sweep\'s per-frame frequency counter: hits raise it, the hand lowers it, eviction happens at 0.' },
      ],
    },
    {
      type: 'callout',
      variant: 'analogy',
      md: `You have fought the flood in your own stack. **Caffeine** — the Java cache you'd actually reach for — answers it with *admission*, not eviction: a W-TinyLFU frequency sketch (a Count-Min of 4-bit counters) makes an incoming one-hit-wonder duel the incumbent for entry, and the scan page loses. Same idea as InnoDB's midpoint, different costume: **recency must earn its way in.** And Python's \`functools.lru_cache\` is strict LRU with the classic failure intact: iterate one big dict through a cached function and you have flushed your own working set.`,
    },
    {
      type: 'exercise',
      simId: 'engine',
      title: 'Watch the bet get lost',
      tasks: [
        'Run the mixed trace — OLTP with a periodic full scan — under LRU at pool size 32. Watch the hit-rate line dip at every scan and claw its way back.',
        'Same trace, same pool, toggle to clock-sweep. Compare the curves: shallower dips, shorter recoveries, or both?',
        'Now run the pure scan trace under both policies. Neither curve should impress you — confirm the floor: zero reuse means no policy can win.',
        'Back on the mixed trace, try pool size 8 and 64 under both policies. Notice where the policy gap matters most.',
      ],
      note: `What just happened: LRU loses the bet against scans because recency is exactly the signal a scan manufactures — every scan page is hot exactly once and cold forever. Clock-sweep's second chance acts as a crude frequency detector: a page must be re-touched between hand passes to keep its bit, so one-touch pages drain first and the working set mostly survives — hence the shallower dips. The pure-scan run is the honest negative result: eviction policies monetize locality, and when the workload has none, the pool is a pass-through; the only real fixes are quarantine (Postgres's ring buffer) or not scanning through the cache at all. And the determinism caveat: identical trace every run — if your two policies tied exactly on the pure scan, that's the floor, not a bug.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Why does one big sequential scan wreck a strict-LRU buffer pool?',
          options: [
            'Scans pin every page they touch',
            'LRU degrades to O(n) per access under scans',
            'Scan pages are larger than normal pages',
            'Each scan page is briefly the most-recently-used, so the scan evicts the entire working set to cache pages it will never touch again',
          ],
          correct: [3],
          explanation:
            'LRU\'s bet — recency predicts reuse — is exactly wrong for one-pass traffic: every page is hot once and cold forever. This is why no production engine ships textbook LRU unmodified.',
        },
        {
          q: 'Clock-sweep\'s usage bit buys you…',
          options: [
            'Exact frequency counts per page',
            'A cheap second chance: hits set a bit (no list mutation, no latch convoy); the hand clears 1→0 and evicts only at 0 — bounded eviction work, and one-touch pages drain before re-touched ones',
            'Perfect immunity to scans',
            'Lock-free access to the page table',
          ],
          correct: [1],
          explanation:
            'It is LRU approximated for speed: the bit is a poor man\'s frequency counter — Postgres stretches it to a 0–5 usage_count. The real win over strict LRU is the hit path: set a bit instead of moving a list node under a latch.',
        },
        {
          q: 'Postgres\'s ring buffer and InnoDB\'s midpoint insertion are the same idea in different costumes:',
          options: [
            'Evict dirty pages before clean ones',
            'Pin index pages permanently in the pool',
            'Quarantine one-time traffic so it can\'t flush the working set — scans cycle a private 32-page ring, or churn only the old 3/8 of the list until re-reads earn promotion',
            'Compress pages before evicting them',
          ],
          correct: [2],
          explanation:
            'Both stop trying to pick better victims inside one shared pool and instead keep the workloads\' pages out of each other\'s way — admission control (InnoDB) or isolation ring (Postgres). If you remember one move from this lesson, make it that one.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the classics and the source',
      md: `The classics: **Belady (1966)** for the anomaly and the optimal-but-unimplementable MIN — worth one page of your life just for the definition of a stack algorithm. **Megiddo & Modha, "ARC: A Self-Tuning, Low Overhead Replacement Cache" (FAST '03)**: recency and frequency lists with a self-tuning split — shipped in DB2, adopted by ZFS, and IBM's patent is the usual explanation for why your favorite open-source engine ships approximations instead. The Java-world version as readable source: **Einziger et al., TinyLFU (ACM TOCS 2017)** plus the Caffeine design docs. And the production truth in the project's own words: **\`src/backend/storage/buffer/README\`** in the Postgres tree — the ring-buffer and clock-sweep rationale, straight from the people who have to defend it.`,
    },
  ],
}

export default lesson
