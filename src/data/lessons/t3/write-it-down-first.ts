import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't3.l1',
  slug: 'write-it-down-first',
  trackId: 't3',
  index: 1,
  title: 'Write It Down First',
  minutes: 16,
  hook: 'The WAL rule: log before data, steal and no-force — and why one ordering constraint buys durability and speed at once. Then lab 03, where the grader kills you mid-write.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `T0 taught you the buffer pool: reads and writes happen against cached pages, and dirty ones go back to disk whenever the evictor feels like it (T0.L3). T1 and T2 taught you to mutate those pages — set bytes, dirty the frame, move on. Nobody has yet answered the only question durability ever asks: **the client got its \`COMMIT\` ok, and the process dies one millisecond later — what must be true?**

Two failure shapes hide inside that millisecond, and they pull in opposite directions. If an *uncommitted* transaction's dirty page was evicted to disk, the crash just published bytes that were never supposed to exist. If a *committed* transaction's pages sat only in memory, the crash just lost writes the client believes are safe. A correct engine must never publish the uncommitted and never lose the committed — and a buffer pool left to itself does both, routinely.`,
    },
    {
      type: 'prose',
      md: `## Steal and no-force: the policy worth paying for

The two knobs of buffer-pool discipline are named for what they allow:

- **Steal**: may the evictor write out a page dirtied by a transaction that is still open? (It is "stealing" the frame out from under the transaction.)
- **Force**: must every dirty page of a transaction be flushed to disk before its commit is acknowledged?

The "safe" answers — no-steal plus force — are unbuildable. No-steal pins dirty pages in the pool for the life of their transaction: one long transaction holds the whole pool hostage, and T0.L4's eviction bet becomes "evict nothing, ever." Force turns every commit into a random-write storm: one random page write per touched page, at T0.L2 prices (~50µs each on NVMe, ~10ms on spinning rust), so your commit rate is capped by random-write IOPS forever.

So every real engine chooses **steal + no-force**: any page may be evicted at any time, and commit flushes nothing but the log. It is the only policy worth having — and it manufactures both failure shapes on purpose. Steal puts uncommitted bytes on disk (the debt is called **undo**); no-force leaves committed bytes only in memory (the debt is called **redo**). The write-ahead log is not a feature the engine happens to have; it is the payment schedule for the buffer policy the engine wants.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `You already run this architecture. **Event sourcing, the Kafka-shaped stack**: the log is the system of record; the tables — read models, materialized views — are disposable caches of it, rebuildable by replay. WAL is that idea worn by the database itself: the log is the truth, and the data pages are a derived, lazily maintained cache. If you have ever rebuilt a read model by replaying a topic, you have done crash recovery. T3.L2 is that replay, formalized.`,
    },
    {
      type: 'prose',
      md: `## The log record: the journal your intentions live in

Every mutation, before it is allowed to matter, is described by a log record:

| field | what it knows |
|---|---|
| LSN | 8-byte log sequence number — the record's monotonic byte address in the log |
| txn id | whose change this is (the commit/abort record is the verdict) |
| page id | which page this mutates |
| before-image | the bytes as they were — undo's raw material |
| after-image | the bytes as they should be — redo's raw material |
| checksum | over the whole record — a torn tail write must fail loudly, never apply |

Two of those fields do double duty. When a mutation is applied to a buffered page, the page's header is stamped with the LSN of the record describing it — the **page LSN** — so every page knows the newest change it has absorbed. (T1.L1's \`reserved\` header bytes finally get spent — on a page type and this stamp.) And the **checksum** is what lets recovery treat the log's tail as evidence: a crash interrupts writes mid-record, and a record that fails its checksum is dropped, never applied. A log without checksums cannot tell "torn write" from "your data."

Then the whole of WAL discipline is **one sentence**:

**No data page may be written to disk until the log records describing its changes are durable.**

In operational form: \`pageLSN ≤ flushedLSN\`, or the page stays put. Commit becomes: append the commit record, flush the log up to it, acknowledge. That flush is a **sequential append at the log tail** — bus time on T0.L2's axis — instead of a random-write-per-page storm. That is how no-force gets away with it: durability paid at the cheap I/O shape.`,
    },
    {
      type: 'code',
      filename: 'one log record, lab 03 shape',
      lang: 'text',
      code: `record @ LSN 0x04A0 ─┬─ txn 17 · UPDATE
                     ├─ page 7, slot 3
                     ├─ before: bal = 100
                     ├─ after:  bal = 90
                     ├─ prev:   LSN 0x0488   (txn 17's last record)
                     └─ crc32   over all of the above`,
      chips: ['8 B LSN · monotonic', "checksum or it didn't happen"],
    },
    {
      type: 'diagram',
      caption: 'fig 1 — the WAL rule, on one timeline',
      height: 56,
      nodes: [
        { id: 'txn', x: 4, y: 4, w: 18, h: 9, label: 'txn 17', sub: 'UPDATE bal', color: '#FBBF24' },
        { id: 'pool', x: 34, y: 4, w: 28, h: 10, label: 'buffer pool', sub: 'page 7 dirty · pageLSN 0x04A0', color: '#3EF2A4' },
        { id: 'walbuf', x: 70, y: 4, w: 26, h: 9, label: 'WAL buffer', sub: 'records in LSN order', color: '#5CA8FF' },
        { id: 'waldisk', x: 70, y: 22, w: 26, h: 10, label: 'WAL on disk', sub: 'flushedLSN — the durability line', color: '#5CA8FF' },
        { id: 'datadisk', x: 34, y: 22, w: 28, h: 10, label: 'data pages on disk', sub: 'stale by design', color: '#94A3B8' },
        { id: 'recovery', x: 4, y: 42, w: 30, h: 10, label: 'crash + recovery', sub: 'replay from the log', color: '#FB7185' },
      ],
      edges: [
        { from: 'txn', to: 'pool', label: 'mutate, stamp pageLSN' },
        { from: 'pool', to: 'walbuf', label: 'log record first' },
        { from: 'walbuf', to: 'waldisk', label: 'flush at commit' },
        { from: 'pool', to: 'datadisk', label: 'evict only if pageLSN ≤ flushedLSN' },
        { from: 'waldisk', to: 'recovery', label: 'everything committed is here' },
        { from: 'recovery', to: 'datadisk', label: 'truth, restored' },
      ],
      steps: [
        { caption: 'txn 17 updates page 7 in the pool: the frame goes dirty and the page header is stamped with the log record’s LSN. Nothing has touched disk.', active: ['txn', 'pool'], edges: ['txn->pool'] },
        { caption: 'The rule’s first half: the record describing the change is appended BEFORE the page may leave the pool — log before data.', active: ['pool', 'walbuf'], edges: ['pool->walbuf'] },
        { caption: 'Commit: append the commit record, flush WAL through its LSN, ack the client. The data page is still dirty in memory — fine: durability now lives in the log.', active: ['walbuf', 'waldisk'], edges: ['walbuf->waldisk'] },
        { caption: 'Later, the evictor wants page 7’s frame. Allowed: pageLSN 0x04A0 ≤ flushedLSN — the change is already durable in the log, so writing the page is safe but no longer urgent. That is no-force, working.', active: ['pool', 'datadisk'], edges: ['pool->datadisk'] },
        { caption: 'Crash. Memory is gone; the data pages on disk are a mix of stale and (via steal) uncommitted. The WAL is complete through the last flush. Recovery replays it — committed truth returns, uncommitted changes never surface. That replay is T3.L2.', active: ['recovery', 'waldisk', 'datadisk'], edges: ['waldisk->recovery', 'recovery->datadisk'] },
      ],
    },
    {
      type: 'statline',
      stats: [
        { value: '1 sentence', label: 'the entire WAL rule', hint: 'No data page before the log records describing it. One ordering constraint carries steal and no-force both.' },
        { value: '2 debts', label: 'steal → undo · no-force → redo', hint: 'Uncommitted pages may reach disk; committed pages may die in memory. The log pays both sides.' },
        { value: '8 B', label: 'the LSN', hint: 'A monotonic byte address in the log — a record’s id, and the page’s "newest change" stamp.' },
        { value: 'seq append', label: 'the commit I/O shape', hint: 'One flush at the log tail vs one random write per dirty page under force — T0.L2’s axis, spent deliberately.' },
      ],
    },
    {
      type: 'prose',
      md: `## Lab 03: the harness kills you

Lab 03 (wal) hands you \`src/wal.rs\` — a log writer plus the recovery that replays it — and grades this lesson's two sentences with five checks:

- **log_first** — the harness watches the ordering: state never changes before its log record is durable. Logging after the fact is the one cheat this check was built to catch.
- **checksum_corruption** — the tail is truncated mid-record and payloads are bit-flipped: torn/corrupt records must be detected and dropped, never applied. The boundary between "the log ends here" and "garbage" is the checksum.
- **replay_idempotent** — replay the log twice, get the same state. Non-negotiable, because recovery itself can crash (T3.L2); idempotence is what makes that survivable.
- **committed_durable** — the module is killed mid-flush at seeded points. After recovery, every write the client was told committed is present, and nothing half-committed leaks in. That sentence is the entire durability contract of every database you have ever used — Crash Week's INC-1 is this check with a pager attached.
- **crash_storm** — random crash points across a long run, graded against a reference model.

The invariant to hold while you code: **the log is the truth; the store is a cache of it.** Anything the log doesn't say, recovery cannot know — and the grader kills you at exactly the moments when that distinction matters.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Why does the steal + no-force buffer policy make a write-ahead log necessary?',
          options: [
            'It makes pages dirty faster than the disk can flush them',
            'Steal lets uncommitted changes reach disk (undo becomes necessary); no-force lets committed changes die in memory (redo becomes necessary) — the log is the only record of what was true',
            'Sequential writes wear SSDs less than random writes',
            'The log compresses better than data pages',
          ],
          correct: [1],
          explanation:
            'Both failure shapes are manufactured by the policy: published-uncommitted and lost-committed. No-steal + force would avoid the log and is unbuildable (pool hostage, commit-latency catastrophe) — so real engines pay for WAL instead.',
        },
        {
          q: 'A dirty page’s header says pageLSN 0x04A0; the WAL has been flushed through 0x0480. The evictor wants the frame. What must happen?',
          options: [
            'Write the page — the 0x04A0 record will be replayed later anyway',
            'Flush the WAL through 0x04A0 first; only then may the page be written — no data page before the log records describing it',
            'Wait for the next checkpoint, then write the page',
            'Write the page and immediately append a compensating log record',
          ],
          correct: [1],
          explanation:
            'pageLSN ≤ flushedLSN is the whole rule in one comparison. Violating it loses the only durable copy of a change that may already be committed — a commit the client was told succeeded.',
        },
        {
          q: 'Under no-force, acknowledging a commit costs…',
          options: [
            'One random page write per page the transaction dirtied',
            'A full checkpoint',
            'Nothing — commit is free',
            'Appending the commit record and flushing the log tail up to it — a sequential append, the cheap shape on T0.L2’s axis',
          ],
          correct: [3],
          explanation:
            'That is the whole bargain: durability priced at a sequential flush instead of a random-write storm. T3.L3’s group commit then amortizes even that flush across many transactions.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the paper and the source',
      md: `The foundational text is **Mohan et al., "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging" (ACM TODS, 1992)** — steal/no-force, LSNs, page stamps, and the recovery T3.L2 walks through, all in one paper that reads like it was written last year. The Postgres version of the machinery: **src/backend/access/transam/README** in the source tree, plus the docs chapter **"Reliability and the Write-Ahead Log"** — including full_page_writes, PG's answer to the torn-page problem this lesson left in the margin (a crash can tear a data page mid-write; the first modification after each checkpoint logs the whole page image, so redo can rebuild it). The free walkthrough: **interdb.jp, The Internals of PostgreSQL, chapter 9 (WAL)**. Then open lab 03 — the grader is already reaching for the kill switch.`,
    },
  ],
}

export default lesson
