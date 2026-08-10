import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l2',
  slug: 'the-cost-model-of-reality',
  trackId: 't0',
  index: 2,
  title: 'The Cost Model of Reality',
  minutes: 16,
  hook: 'Random vs sequential I/O, HDD physics vs SSD truth, and the orders-of-magnitude table every query planner secretly carries.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `You memorized the latency ladder for system-design interviews and then never used it. Your query planner uses it every day: the ladder below *is* the cost model. When EXPLAIN tells you a plan costs 128,542, it is quoting a price in a currency whose denominations come from this table — page fetches, priced by how the storage layer actually behaves.

Two facts organize everything in this lesson. First, the ladder is not a smooth ramp: **each rung is orders of magnitude from the next**, so the slowest thing you do is the only thing you do. Second, on any given device, *how* you ask matters as much as what you ask: **random vs sequential is the axis** the whole storage world turns on.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~1 ns', label: 'L1 cache hit', hint: 'A few CPU cycles. The unit every other number here is compared against.' },
        { value: '~4 ns', label: 'L2 cache hit', hint: 'Roughly a dozen cycles. Already 4× off the fastest path, and still effectively free.' },
        { value: '~100 ns', label: 'DRAM access', hint: 'The buffer pool\'s hit path. T0.L3 is about never leaving this rung.' },
        { value: '~50 µs', label: 'NVMe random 8KB read', hint: 'Modern Gen4 drive at low queue depth — ~500× a DRAM hit. Drives and queue depths move this number; the order of magnitude is the point.' },
        { value: '~10 ms', label: 'HDD random 8KB read', hint: 'Seek (~4ms) + half a platter rotation (~4ms) + transfer. The most expensive milliseconds in computing.' },
      ],
    },
    {
      type: 'prose',
      md: `## Spinning rust: physics you can hear

A hard drive is a record player with an attitude. To read one random page, three things happen in sequence: the actuator arm **seeks** to the right track (milliseconds — ~4ms on average for a decent drive), the platter **rotates** until the sector arrives under the head (7200 rpm is one revolution per 8.3ms, so ~4ms of average wait), and only then does data move — the transfer itself is noise. Call it ~10ms for one random 8KB page.

Now read the *next* page, physically adjacent: no seek, no rotation, just transfer — at ~200MB/s, 8KB costs ~40µs. **Sequential is ~200× random** on spinning disks. That single ratio is the fossil record of classical database design: B+trees are short and wide to minimize random hops (T2); bulk loads sort first because writing sorted is writing sequential; "clustered" tables exist to make one query pattern's reads physically adjacent. If your mental model of databases came from documentation written before 2015, it is a model of this paragraph.`,
    },
    {
      type: 'prose',
      md: `## Flash: no seek, but not free

An SSD has no arm and no platter, so the seek/rotate tax is gone — a random 8KB read is ~50µs no matter where the last one was. But NAND flash has its own physics, and it is weirder:

- **You read and write in pages** (4–16KB of NAND) but **erase in blocks** (megabytes), and a page cannot be overwritten until its whole block is erased.
- So the drive maintains a **flash translation layer**: a logical→physical page map, plus a garbage collector that compacts live pages out of stale blocks to free them. Your SSD contains a small database, complete with its own page table and its own vacuum process.
- The GC's side effect is **write amplification**: once the drive fills with stale pages, one logical 8KB write can cause megabytes of physical rewriting. Random writes make it worse; a nearly-full drive makes it much worse. This is why LSM trees (T2) — which turn small random writes into large sequential ones — are a flash-native design.

And the axis survives. A random read still costs ~50µs of latency, while a page inside a sequential stream costs ~1µs of bus time at 7GB/s — roughly a 50× gap, not 200×, and random *throughput* scales with queue depth (a modern drive sustains on the order of 1M 4KB random-read IOPS if you keep enough requests in flight). The gap narrowed; it did not close. **Random vs sequential is still the axis** — it just stopped being the only thing that matters, and writes picked up an amplification problem HDDs never had.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      title: 'your SSD is running a database down there',
      md: `The FTL's page map is the same shape as the buffer pool's page table (T0.L3); its garbage collector is the same shape as Postgres's vacuum (T4) — dead versions reclaimed in the background, and when it falls behind you don't lose correctness, you lose throughput to compac— sorry, to *write amplification*. The recursion goes deeper: many drives batch FTL updates through log-structured layouts. It is LSMs (T2) all the way down.`,
    },
    {
      type: 'prose',
      md: `## The planner's secret table

Which brings us to the bill. Postgres's cost constants, with defaults:

| constant | default | what it prices |
|---|---|---|
| \`seq_page_cost\` | 1.0 | one sequential page fetch — the unit of account |
| \`random_page_cost\` | 4.0 | one random fetch — priced for a 2005 HDD behind a small cache |
| \`cpu_tuple_cost\` | 0.01 | processing one row — two orders of magnitude below one page |
| \`effective_cache_size\` | 4GB | not an allocation — the planner's guess at how much caching exists between it and the disk |

Look at \`random_page_cost = 4\`. On 1990s hardware the honest ratio was ~200; on your NVMe box it is ~1–2. The 4.0 is not a measurement — it is a fossil compromise that also folds in "some random pages will be cache hits anyway." And now the punchline you will use in production: **"the planner guessed wrong" is very often "the cost constants stopped matching your disk."** A query that flip-flops between index scan and seq scan right after a migration to faster storage is usually this table, not broken statistics. Re-price it for flash — practitioners start at \`random_page_cost = 1.1\` plus an honest \`effective_cache_size\` — and the flip-flop stops. T5 opens the whole cost model; today's takeaway is that the table exists, it is configuration, and its defaults were priced for a disk you no longer own.`,
    },
    {
      type: 'lab',
      lab: 'cost-model',
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'A buffer-pool miss goes to a modern NVMe SSD for a random 8KB page. Roughly how much slower is that than the DRAM hit it replaces?',
          options: [
            'About 2×',
            'About 10×',
            'About 500× — ~50µs against ~100ns; the miss path is three orders of magnitude off the hit path',
            'About 50,000×',
          ],
          correct: [2],
          explanation:
            'This ratio is why hit rate is the pulse (T0.L3): when a miss costs ~500 hits, a 1% miss rate already makes the mean read ~600ns — six times the pure-cache path, from a single miss in a hundred. The tail doesn\'t dominate the mean; at these ratios it *is* the mean.',
        },
        {
          q: 'Why is sequential I/O ~200× faster than random I/O on a hard drive?',
          options: [
            'Sequential reads use a bigger on-drive cache',
            'The filesystem keeps sequential files defragmented',
            'HDDs compress sequential streams on the fly',
            'Physics: a random page pays a seek (~4ms) plus half a platter rotation (~4ms) before any bytes move; an adjacent page pays only transfer time (~40µs at ~200MB/s)',
          ],
          correct: [3],
          explanation:
            'The most expensive milliseconds in computing are mechanical. Nearly every classical structure in this course is seek-avoidance wearing a data-structure costume: B+tree fanout (T2), sorted bulk loads, clustered tables. The ratio is the design.',
        },
        {
          q: 'Right after migrating a database from HDDs to NVMe, a dashboard query flips from an index scan to a sequential scan and gets slower. Statistics are fresh. Most likely cause?',
          options: [
            'NVMe drives are bad at random reads',
            'The cost constants no longer match the disk: random_page_cost = 4 prices random I/O at 4× sequential, so on flash the planner over-avoids index scans',
            'The WAL needs a checkpoint',
            'The planner has to be restarted to notice new hardware',
          ],
          correct: [1],
          explanation:
            'On NVMe the honest random:sequential ratio is ~1–2×. Dropping random_page_cost toward 1.1–2 and setting effective_cache_size to something truthful re-prices the index scan correctly. Fresh statistics cannot fix a cost model priced for hardware you no longer own.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the ladder, the knobs, the drive',
      md: `The ladder, maintained: **"Latency Numbers Every Programmer Should Know"** — Jeff Dean's original list, kept current year-by-year at colin-scott.github.io/personal_website/research/interactive_latency.html; drag the year slider and watch the SSD rung move. The knobs, documented: **PostgreSQL docs, "Planner Cost Constants"** — the surrounding text admits the defaults are a model, not a measurement, which is the whole point of this lesson. The drive's side of the story: **Petrov, Database Internals, ch. 3** on flash, or Michael Cornwell's ACM Queue piece **"Anatomy of a Solid-State Drive" (2012)** for the FTL, GC, and write amplification from the firmware's point of view.`,
    },
  ],
}

export default lesson
