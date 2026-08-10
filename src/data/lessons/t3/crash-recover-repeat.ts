import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't3.l2',
  slug: 'crash-recover-repeat',
  trackId: 't3',
  index: 2,
  title: 'Crash, Recover, Repeat',
  minutes: 15,
  hook: 'LSNs, checkpoints, and ARIES: redo the winners, undo the losers — recovery as a deterministic replay, even if you crash mid-recovery.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `It is 03:12 and your primary is dead. The data directory holds two sources of truth that disagree: the data pages — stale, and (thanks to steal) possibly holding changes nobody committed — and the WAL, complete through the last flush. **Recovery is the procedure that settles the argument**, and the industry's version of that procedure is ARIES: three passes over the log that rebuild the exact state at the crash, then surgically remove the transactions that never committed.

Its headline design constraint is not "a crash happened." It is: **a crash happened, and another one may happen while we are fixing it.** Everything in this lesson — the page-LSN guard, the compensation records, the checkpoint semantics — exists so that recovery survives its own crash.`,
    },
    {
      type: 'prose',
      md: `## Analysis: find out where you are

From the last checkpoint forward, scan the log and rebuild two in-memory tables:

- **The transaction table** — every transaction seen, its status, its last LSN. When the scan hits the end of the log, the transactions still open are the **losers** (to be undone); the committed ones are the **winners**.
- **The dirty page table** — which pages were dirty at crash time, and the oldest LSN that dirtied each. The minimum across it is the **REDO point**: the oldest change that might be missing from disk.

Analysis decides nothing about data. It finds out where the story starts and who was in the room when the lights went out.`,
    },
    {
      type: 'prose',
      md: `## Redo: repeat history, unconditionally

From the REDO point to the end of the log, replay **every** record, in LSN order — winners' records, losers' records, records for pages that are already up to date. No judgment calls about who committed: redo's job is to return every page to its exact crash-time state, which is the only ground on which undo can stand.

The guard that makes this safe: apply a record to a page **only if the page's LSN is older than the record's** (\`pageLSN < record.LSN\`). A change already on the page — flushed before the crash, or applied by a *previous replay* — is skipped by comparison, not by memory. Replay the log twice and you get the same state as replaying it once: **idempotence by construction**, not by bookkeeping. That is lab 03's replay_idempotent check, and it is the reason crashing mid-recovery is a Tuesday instead of a restore-from-backup.`,
    },
    {
      type: 'prose',
      md: `## Undo: evict the losers

Now the losers' changes — some of which redo just faithfully re-applied — must vanish. For each loser, walk its records **backward** along the prev-LSN chain, restoring before-images, newest change first.

And here is the part people miss: **undo writes log records.** Each undo step is recorded as a **compensation log record (CLR)** — a redo-only record saying "this undo happened." If the machine dies mid-undo, the next recovery redoes the CLRs and resumes undo exactly where it stopped: undo work survives its own crash, and a loser can never be half-un-done. When the last CLR lands, each loser is exactly as if it had never happened — which is the definition of atomicity.

Postgres runs a deliberate simplification of all this: redo works exactly as described (page-LSN-guarded physical replay), but there is **no runtime undo pass**. An aborted transaction's versions are never scrubbed; they are simply never *visible* — T4's xmin/xmax machinery hides them from every snapshot — the commit log records the abort, and vacuum (T4.L4) takes out the trash eventually. ARIES's undo, delegated to MVCC and garbage collection. Learn the full ARIES model anyway: every engine teaches it, and lab 03 grades the redo-plus-cleanup discipline in full.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — one log, three passes',
      height: 58,
      nodes: [
        { id: 'cp', x: 3, y: 6, w: 17, h: 9, label: 'checkpoint', sub: 'last completed', color: '#A78BFA' },
        { id: 'redopt', x: 26, y: 6, w: 18, h: 9, label: 'REDO point', sub: 'oldest dirty pageLSN', color: '#FBBF24' },
        { id: 'eof', x: 78, y: 6, w: 19, h: 9, label: 'crash', sub: 'end of log', color: '#FB7185' },
        { id: 'analysis', x: 26, y: 27, w: 24, h: 10, label: '1 · analysis', sub: 'scan → txn + dirty tables', color: '#5CA8FF' },
        { id: 'redo', x: 26, y: 44, w: 30, h: 10, label: '2 · redo', sub: 'repeat history, LSN-guarded', color: '#3EF2A4' },
        { id: 'undo', x: 66, y: 44, w: 31, h: 10, label: '3 · undo', sub: 'losers rolled back via CLRs', color: '#FBBF24' },
      ],
      edges: [
        { from: 'cp', to: 'analysis', label: 'scan starts here' },
        { from: 'redopt', to: 'redo', label: 'replay from here' },
        { from: 'analysis', to: 'redo', label: 'winner/loser tables' },
        { from: 'redo', to: 'undo', label: 'pages at crash-time state' },
      ],
      steps: [
        { caption: 'The log as recovery finds it: a last completed checkpoint, a REDO point (the oldest change that may be missing from disk), and a torn tail where the crash cut the story off.', active: ['cp', 'redopt', 'eof'] },
        { caption: 'Analysis scans forward from the checkpoint, rebuilding the transaction table (winners vs losers) and the dirty page table. It decides nothing about data — it finds the REDO point and the guest list.', active: ['cp', 'analysis'], edges: ['cp->analysis'] },
        { caption: 'Redo replays every record from the REDO point to the log end, applying only where pageLSN < record.LSN. Winners, losers, everyone — pages return to their exact crash-time state, and replaying twice changes nothing.', active: ['redopt', 'redo'], edges: ['redopt->redo', 'analysis->redo'] },
        { caption: 'Undo walks each loser backward, restoring before-images and logging every step as a compensation record — so a crash mid-undo resumes, never restarts. The losers end as if they never happened.', active: ['undo'], edges: ['redo->undo'] },
      ],
    },
    {
      type: 'prose',
      md: `## Checkpoints: a bookmark, not a barrier

Without checkpoints, the REDO point is record zero and recovery time grows with the age of the log — restart becomes an outage measured in log volume. A **checkpoint** bounds it: flush the dirty pages (lazily, spread over minutes — a *fuzzy* checkpoint, no stop-the-world), then write a checkpoint record naming the REDO point and the transactions in flight. Recovery never needs to look behind the **last completed** checkpoint; everything older is recyclable.

Note the emphasized word. A checkpoint is a **performance bookmark**: it bounds how far back recovery must read. It is not a correctness barrier, and interrupting one costs time, never data — a crash 80% through a checkpoint just means that checkpoint never happened, and you redo from the one before it. That is Crash Week's **INC-1 — The Checkpoint That Never Finished**: the on-call channel drafts restore-from-backup while recovery is, in fact, fine. The operational lesson: watch the dirty-page curve and the last *completed* checkpoint, not the interrupted one.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '3 passes', label: 'analysis · redo · undo', hint: 'Find the story, repeat it, evict the losers. In that order, every restart.' },
        { value: '2 directions', label: 'redo forward, undo backward', hint: 'Redo replays in LSN order; undo walks each loser’s prev-LSN chain, newest first.' },
        { value: '≥2 replays', label: 'same state, guaranteed', hint: 'The pageLSN guard makes replay idempotent — the property lab 03 grades directly.' },
        { value: '0', label: 'data lost to an interrupted checkpoint', hint: 'A checkpoint bounds recovery time; it is a bookmark, not a barrier — INC-1.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'the design constraint, not the edge case',
      md: `Crashing mid-recovery is not bad luck — it is the case the whole design is built around. Power comes back flaky, the kernel panics again, an ops person kills the "stuck" recovery: recovery must assume it will be interrupted and make every step restartable. That is why redo is guarded by LSN comparison instead of memory, why undo logs CLRs, and why an interrupted checkpoint is a non-event. If your recovery can be hurt by the thing it is recovering from, you do not have recovery.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Why does ARIES redo re-apply log records belonging to transactions that never committed?',
          options: [
            'It is an optimization — undo is cheaper after redo',
            'Redo repeats history unconditionally to rebuild the exact crash-time page state; deciding commit status mid-replay would complicate the LSN guard and break idempotence — undo removes the losers afterwards',
            'Records cannot be attributed to transactions until redo finishes',
            'Committed and uncommitted records are checksummed identically',
          ],
          correct: [1],
          explanation:
            'Repeat history first, then fix it. The losers’ records are part of the crash-time state; undo (with its CLRs) is the pass that erases them, and undo is itself crash-safe.',
        },
        {
          q: 'What does the guard "apply a record only if pageLSN < record.LSN" buy you?',
          options: [
            'Faster replay — most records are skipped',
            'Protection against checksum failures at the log tail',
            'Idempotence: replaying the log any number of times converges to the same state, so crashing mid-recovery is survivable',
            'Pages stay clean during recovery',
          ],
          correct: [2],
          explanation:
            'Whether a change arrived via the original flush, a previous replay, or this one is decided by comparison, not memory. Lab 03’s replay_idempotent check is exactly this property.',
        },
        {
          q: 'A primary crashes 80% of the way through a checkpoint. What has been lost?',
          options: [
            'The dirty pages the checkpoint was midway through flushing',
            'All transactions since the previous checkpoint',
            'The WAL tail after the last flush',
            'Nothing — recovery redoes from the last COMPLETED checkpoint; an interrupted checkpoint is a bookmark that was never finished, not a barrier that was breached',
          ],
          correct: [3],
          explanation:
            'INC-1 in one answer. Checkpoints bound recovery time; correctness lives in the WAL rule, not in checkpoint completion.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: ARIES, all the way down',
      md: `The source: **Mohan et al., "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging," ACM TODS 17(1), 1992** — one of the few papers whose pseudocode shipped essentially unmodified (in DB2 first) and shaped every recovery subsystem since; its descendants (ARIES/IM for index logging, ARIES-NT for nested transactions) are worth the extra afternoon. For what Postgres actually runs: **src/backend/access/transam/xlogrecovery.c** and the README alongside it — redo-only recovery, no undo pass, the commit log (pg_xact) holding the winner/loser verdicts that MVCC enforces. The free chapter-length tour: **interdb.jp, The Internals of PostgreSQL, chapter 9**. For the textbook treatment across engines: **Petrov, *Database Internals* (O'Reilly, 2019), chapter 5** — recovery as one design space: ARIES's steal/no-force against the alternatives. And when you are done, Crash Week's INC-1 card is these same three passes, read off graphs at 03:12.`,
    },
  ],
}

export default lesson
