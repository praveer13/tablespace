import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l5',
  slug: 'lru-k',
  trackId: 't0',
  index: 5,
  title: 'Eviction at Production Grade: LRU-K',
  minutes: 14,
  hook: 'The five-minute rule, backward k-distance, and why "when did you last touch it" is the wrong question — the replacer CMU makes you build first.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `T0.L4 ended with a surrender dressed as engineering: nobody ships textbook LRU, because the sequential flood beats it and clock-sweep is the cheap approximation that survives. This lesson is the road not taken in that story — the policy that doesn't patch LRU's *answer* but rejects LRU's *question*. And because this is T0, the question gets priced before it gets answered. The replacer's job is not bookkeeping. It is a purchasing decision, made on evidence, per frame, hundreds of thousands of times a second.`,
    },
    {
      type: 'prose',
      md: `## The five-minute rule: eviction is economics

In 1987, Jim Gray and Franco Putzolu asked a disarmingly practical question: *when does a page deserve RAM?* Put a price on both sides. A megabyte of DRAM costs some dollars and holds some pages; a disk costs some dollars and delivers some IOPS. There is a break-even **re-reference interval**: if a page is re-referenced more often than this, the RAM it sits in is cheaper than the repeated disk reads; re-referenced less often, you are paying rent for a squatter. At 1987 prices the arithmetic landed near five minutes — hence the name. The interval has floated with hardware ever since (flash moved it, Graefe's 20-year revisit repriced it), but the framing is permanent: **the buffer pool is money, and pages pay rent in re-references.**

Now hold that framing next to what a replacer actually computes. The correct question is: *what is this page's re-reference interval?* — estimated from its past, evicting the page with the longest estimated future wait. Everything else in this lesson is two answers to that question: LRU's, which answers a different question entirely, and LRU-K's, which answers this one.`,
    },
    {
      type: 'prose',
      md: `## LRU's blindness: one timestamp per page

LRU remembers exactly one fact about each page: when it was last touched. That single timestamp must stand in for everything — frequency, regularity, the interval the five-minute rule prices — and it folds exactly where real workloads live:

- A page touched five hundred times an hour for a month, but not in the last ten minutes, ranks **below** a page touched *once, just now*.
- The sequential flood (T0.L4) manufactures "once, just now" pages in bulk: every scan page is briefly the most-recently-used page in the system, so the scan evicts your working set to cache pages it will never touch again.

The failure is not that the heuristic is sometimes wrong — every heuristic is. The failure is that LRU **throws away the information that would have saved it.** Recency is a summary, and the summary is lossy precisely where one-touch traffic lives. "When did you last touch it?" turns out to be the wrong question.`,
    },
    {
      type: 'prose',
      md: `## LRU-K: remember the last K touches

O'Neil, O'Neil, and Weikum's fix (1993) keeps more of the evidence. **LRU-K records the times of the last K references to each page** and evicts by **backward k-distance**: the elapsed time from the Kth-most-recent reference to now. Larger distance, colder history — and *history*, not last contact, is the estimator the five-minute rule wanted.

Two disciplines make it work:

- **Fewer than K references → distance +∞.** A page without a full history has no sampled interval; its backward k-distance is defined as infinite, and it evicts ahead of every fully-historied page. Among the ∞s, the **earliest timestamp loses** — one-touch pages drain oldest-first, plain FIFO in the limit case.
- **The history outlives the residency.** In the paper's full design, an evicted page leaves a stub behind: its last K timestamps are retained for a *correlated reference period* — the **history list**, kept distinct from the **buffer list** of resident pages — so a page that faults back in does not start its history from zero, and stale stubs are pruned when the retention window passes. BusTub's classroom version tracks the records per frame and drops them on eviction; the idea survives the simplification.

K=2 is the classic setting, and its meaning deserves a pause: backward 2-distance is *now minus the previous touch* — an actual sample of the page's re-reference interval. LRU asks "when did you last touch it?"; LRU-2 asks "how long was the gap between its last two touches?" The second question is the five-minute rule's question, estimated from evidence instead of assumed from recency.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — backward k-distance decides, K=2, now=100',
      height: 58,
      nodes: [
        { id: 'op', x: 4, y: 24, w: 18, h: 10, label: 'pool full', sub: 'needs a victim', color: '#FBBF24' },
        { id: 'now', x: 28, y: 24, w: 18, h: 10, label: 'now = 100', sub: 'K = 2', color: '#94A3B8' },
        { id: 'A', x: 56, y: 2, w: 40, h: 10, label: 'page A · touched 40, 95', sub: 'distance 100 − 40 = 60', color: '#3EF2A4' },
        { id: 'C', x: 56, y: 16, w: 40, h: 10, label: 'page C · touched 10, 50', sub: 'distance 100 − 10 = 90', color: '#3EF2A4' },
        { id: 'B', x: 56, y: 30, w: 40, h: 10, label: 'page B · touched 92', sub: 'one touch → +∞', color: '#FB7185' },
        { id: 'D', x: 56, y: 44, w: 40, h: 10, label: 'page D · touched 98', sub: 'one touch → +∞', color: '#FB7185' },
      ],
      edges: [
        { from: 'now', to: 'A', label: 'score' },
        { from: 'now', to: 'C', label: 'score' },
        { from: 'now', to: 'B', label: 'score' },
        { from: 'now', to: 'D', label: 'score' },
      ],
      steps: [
        { caption: 'K=2: the replacer remembers the last TWO touch times of every page. LRU is the special case K=1 — and its blindness is the special case too.', active: ['now', 'A', 'C'] },
        { caption: 'Backward k-distance = now − the Kth-newest touch. A: 100 − 40 = 60. C: 100 − 10 = 90. The page whose PREVIOUS life is oldest is the coldest — a sampled re-reference interval, not a guess from recency.', active: ['A', 'C'], edges: ['now->A', 'now->C'] },
        { caption: 'Fewer than K touches → distance +∞. B and D evict ahead of EVERY fully-historied page. Their single, recent touch is exactly the evidence LRU would have rewarded — and exactly the evidence that proves nothing.', active: ['B', 'D'], edges: ['now->B', 'now->D'] },
        { caption: 'Among the ∞s, the earliest timestamp loses: B (92) drains before D (98). One-touch pages leave oldest-first — FIFO in the limit case.', active: ['B'], edges: ['now->B'] },
        { caption: 'Only when every candidate has a full history does the finite contest run: C (90) evicts before A (60). Either way, a one-touch page never outranks a twice-touched one — that is the flood, neutralized by the scoring.', active: ['A', 'C'], edges: ['now->A', 'now->C'] },
      ],
    },
    {
      type: 'prose',
      md: `## Why K=2 survives the flood

Replay T0.L4's horror against this scoring. The scan streams through, one touch per page. Every scan page has backward 2-distance **+∞ — it never earns a second timestamp** — so the moment the pool fills, scan pages begin evicting *each other*, oldest-first, while every twice-touched working-set page sits behind a finite score the scan can never beat. The flood poisons itself. No ring buffer, no midpoint insertion, no admission sketch: scan resistance falls out of asking for two timestamps instead of one.

Now the honest ledger, because nothing here is free:

- **Memory.** K timestamps per page, plus the history stubs — the paper's own accounting, and the reason K stays small. K=2 captures most of the measured win; the paper's gains flatten by K=3.
- **Maintenance.** The victim is a maximum over backward k-distances — a priority structure updated on every reference, under a latch (BusTub makes you hold exactly that latch). Clock-sweep's hit path sets one bit; LRU-K's updates a heap. That delta is the entire reason production mostly ships the approximation from T0.L4 instead.
- **Heuristics at the edges.** The correlated reference period, stub retention — the paper earns its margins on real traces, and the edges are where classroom implementations quietly diverge from it. Under the correlated-reference assumptions the authors prove LRU-K near-optimal; workloads that violate them get a very good heuristic, not a theorem.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `Your kernel already runs a poor man's LRU-2. Linux page reclaim splits its lists into **inactive** and **active**: a freshly faulted page lands on inactive, and only a *second* reference while inactive earns promotion to active; reclaim scans inactive first. One touch buys residency on probation — the second touch is the evidence. That is K=2 wearing a kernel costume, and it is the same move as InnoDB's midpoint insertion from T0.L4: **recency must earn its way in.** LRU-K is the version with the training wheels off — explicit timestamps, an explicit distance, and no place for a one-hit wonder to hide.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~5 min', label: 'the 1987 break-even', hint: 'Gray & Putzolu: re-reference a page more often than this and its RAM is paid for; less often, re-read it. The interval floats with prices; the equation does not.' },
        { value: 'K = 2', label: 'the classic setting', hint: 'Backward 2-distance = now − the previous touch: a sampled re-reference interval. The paper’s measured wins flatten by K=3.' },
        { value: '+∞', label: 'distance with < K touches', hint: 'One-touch pages evict ahead of every fully-historied page; among ∞s the earliest timestamp loses — FIFO in the limit.' },
        { value: 'K stamps', label: 'per page, vs LRU’s one', hint: 'Plus a priority structure under a latch on every hit. The price of asking a better question — and why production ships clock-sweep.' },
      ],
    },
    {
      type: 'prose',
      md: `## Why CMU starts here

Fifteen years of 15-445 students have written this replacer as their first database code: BusTub's Project 1 opens the buffer-pool project with it, before a page is ever fetched. The placement is deliberate, and worth understanding:

- **Small enough to finish, subtle enough to fail.** The spec fits in a paragraph; the tie-breaks — the +∞ ordering, earliest-timestamp-loses, frames that are not currently evictable — are exactly where first implementations drift. You will believe you understand LRU-K and the grader will educate you. That is the shape of every good first project.
- **It forces the physical discipline early.** The replacer is consulted under a latch, on every frame, on every access: timestamps, thread-safety, and T0.L3's pin rule (a pinned frame is not a candidate, whatever its distance says) all land in one small class.
- **It installs the right question first.** Everything this course says later about scans, working sets, and admission assumes you have internalized that eviction is interval estimation. LRU-K is where that stops being a slogan.

And it sets up the honest contrast for the rest of the track: Postgres looked at the same problem and shipped clock-sweep — one bit per frame stretched to a 0–5 counter, a hand, no timestamps at all. Two answers to one question; the deepdive has both receipts.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'The five-minute rule prices…',
          options: [
            'How long a dirty page may sit in the pool before writeback',
            'The break-even re-reference interval: if a page is re-referenced more often than this, the RAM it sits in is cheaper than re-reading it from disk — eviction is a purchasing decision, not a chronology',
            'How often the eviction pass should run',
            'The WAL flush cadence that keeps commit latency acceptable',
          ],
          correct: [1],
          explanation:
            'It is an economic threshold, not a timer: RAM-per-page-per-second priced against IOPS-per-dollar. The interval floats with hardware prices — flash moved it — but the framing is permanent: pages pay rent in re-references, and the replacer’s job is estimating the interval.',
        },
        {
          q: 'K=2, now=100. Page A was touched at 10 and 50; page B once, at 92; page C at 80 and 95. Which evicts first?',
          options: [
            'A — its most recent touch (50) is the oldest of the three',
            'C — the gap between its two touches is the shortest',
            'A and B tie, so the larger page wins',
            'B — fewer than K touches means backward k-distance +∞, which evicts ahead of every finite distance (A: 90, C: 20); the recency of its single touch is exactly the evidence that proves nothing',
          ],
          correct: [3],
          explanation:
            'Under plain LRU, B’s fresh timestamp makes it look hot — that is the blindness. LRU-2 discounts it: one touch is no sampled interval, so B is +∞ and drains first. Among several +∞ pages, the earliest timestamp loses.',
        },
        {
          q: 'Why does LRU-2 shrug off T0.L4\'s sequential flood?',
          options: [
            'It detects sequential patterns and bypasses the pool',
            'It pins the working set for the duration of any scan',
            'Scan pages are larger than OLTP pages, so they never fit the history list',
            'Each scan page is touched exactly once, so its backward 2-distance stays +∞ forever — scan pages evict each other oldest-first while every twice-touched working-set page hides behind a finite score',
          ],
          correct: [3],
          explanation:
            'No pattern detection, no quarantine — scan resistance is a consequence of the scoring. Under strict LRU each scan page is briefly the most-recently-used page in the system; under LRU-K it never earns the second timestamp that would let it outrank real pages.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the invoice, the paper, the project',
      md: `The economics: **Gray & Putzolu, "The 5 Minute Rule for Trading Memory for Disc Accesses" (1987)** — one page of arithmetic that reframed caching as purchasing; pair it with **Graefe's 20-year revisit (2007)**, which repriced the interval for flash-era hardware and found the equation outlived every price sheet fed into it. The algorithm: **O'Neil, O'Neil & Weikum, "The LRU-K Page Replacement Algorithm for Database Disk Buffering" (SIGMOD 1993)** — backward k-distance, the correlated reference period, and DB2 traces where plain LRU loses by margins that end arguments. The build: **CMU 15-445, Project 1 (the BusTub buffer pool)** — the replacer spec spells out the +∞ tie-break and the evictable-set discipline you get graded on; read it before you code, not after the grader mails you its feedback. The production alternative: **Postgres's clock-sweep** — \`StrategyGetBuffer\` in \`src/backend/storage/buffer/bufmgr.c\`, usage_count 0–5, one hand, zero timestamps — the bet that a cheap approximation beats an exact history at 100k hits a second. Read the paper, build the replacer, ship the clock.`,
    },
  ],
}

export default lesson
