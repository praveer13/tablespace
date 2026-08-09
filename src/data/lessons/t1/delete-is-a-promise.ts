import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l4',
  slug: 'delete-is-a-promise',
  trackId: 't1',
  index: 4,
  title: 'Delete Is a Promise, Not an Erasure',
  minutes: 12,
  hook: 'Tombstones, free-space maps, and why "deleted" rows occupy disk until somebody does the accounting.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Run \`DELETE FROM sessions WHERE expires_at < now()\` and watch it remove forty million rows in seconds. Then check the table's file on disk: **not one byte smaller.** Nothing was erased, and nothing was supposed to be. DELETE in a real engine is not an erasure — it is a *promise*: a mark that says "this row is dead, reclaim it when it is provably safe." This lesson is about why the promise is necessary, who keeps the books in the meantime, and when the bytes actually come back. It closes the loop with lab 01, where you already implemented all three acts: the mark, the accounting, and the reclaim.`,
    },
    {
      type: 'prose',
      md: `## Why erasure is not an option

Two independent reasons, and either one alone would be enough:

1. **Other snapshots may still see the row.** While your DELETE runs, another transaction holding an older snapshot may be *entitled* to read that row — its reality is defined as-of an earlier moment, and the engine's job is to keep both worlds consistent at once. Erasing the bytes would corrupt their world to build yours. So the row's \`xmax\` gets stamped with your transaction id (T1.L2's death certificate) and the body stays put; who may still see it is a per-snapshot question. That question — many worlds, one truth each — is all of T4. For now: **a deleted row is not gone, it is condemned**, and the difference is other people's snapshots.
2. **The delete itself is not final yet.** Your transaction might roll back. The server might crash mid-statement. Erasure is irreversible, and a storage engine that does irreversible things before the outcome is certain has no undo story and no recovery story (T3 builds both from the log). Bytes must survive until the decision is durable.

So DELETE does the cheapest definitive thing: a few bytes of header written, a WAL record, move on. The row is invisible to new snapshots immediately. The *space* is a separate matter entirely.`,
    },
    {
      type: 'prose',
      md: `## Tombstones: gone is not reclaimed

Hold the two events apart, because production confusion lives exactly in the gap:

- **Gone** is a *visibility* fact. It happens at DELETE: the header says dead, new snapshots skip the row. Instant.
- **Reclaimed** is an *accounting* fact. It happens when someone proves no snapshot anywhere can still see the row, and only then can the bytes be reused — and index entries pointing at the dead tuple have to be cleaned too.

Between the two, the dead tuple sits on its page as a **tombstone**: occupying bytes, skipped by readers, waiting. In Postgres the reclaimer is **VACUUM** (plus per-page pruning when a page is touched anyway); the accumulated backlog of dead tuples is **bloat**, and it is why tables that churn grow faster than the live data justifies. Lab 01's page is the same design in miniature, with the safety argument simplified away: \`delete()\` clears the \`LIVE\` bit and adds \`len\` to \`dead_bytes\` — \`free_space()\` counts those bytes *immediately* (the accounting reflects the promise) — but \`insert()\` cannot spend them, because they are not contiguous. \`defrag()\` is the reclaim: it slides the live records back against byte 8192, zeroes \`dead_bytes\`, and only then can the space fund new rows. Gone now, reclaimed later, and the books must show both numbers the whole time.`,
    },
    {
      type: 'callout',
      variant: 'analogy',
      md: `You run this exact runtime: it's **mark-and-sweep garbage collection**. A dead tuple is an unreachable object — the mark already happened (xmax stamped / \`LIVE\` bit cleared), the sweep is vacuum or defrag, and "the heap keeps growing even though almost nothing is live" is the same incident in both worlds, with the same postmortem. The database's twist is that its sweep must prove a negative — *no snapshot can still see this* — before freeing anything, which is why the sweep runs continuously instead of on allocation pressure.`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'The classic production confusion',
      md: `\`DELETE FROM\` a table completely, then watch the disk: the file does not shrink. Vacuum returns dead space to the *table* (pages become reusable for future inserts), not to the *filesystem* — giving bytes back to the OS takes a rewrite (\`VACUUM FULL\` / \`pg_repack\`), which takes locks you may not want at 3 pm. Plan for steady-state bloat, not for files that shrink.`,
    },
    {
      type: 'prose',
      md: `## The free-space map: remembering room without scanning

Deletes make room *somewhere*; inserts need to know *where*. The naive answer — walk the table's pages until one has enough contiguous space — is O(relation size) per insert, which is not a plan. So the engine keeps a **free-space map** (FSM): a side structure per relation that records, for each page, approximately how much free space it has. Postgres's version stores **one byte per page**, the free space rounded down into **32-byte buckets**, organized as a little tree whose upper levels hold the *maximum* of their children — so "find me a page with ≥ 600 free bytes" is a tree descent, not a scan.

Two properties make it work. **It is deliberately lossy**: a stale answer costs one wasted page visit, after which the visitor records the truth back into the map — heuristics, not locks. And **it is maintained in passing**: inserts and updates adjust entries as they go, and vacuum does the deep refresh. Sound familiar? Lab 01's \`free_space()\` is the one-page version of the same idea — a number you *maintain* from the header on every op, never a scan. The harness keeps its own reference books and diffs them against yours after **every single operation**. Accounting is data, at page scale and at table scale alike.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '0 B', label: 'erased at DELETE time', hint: 'The header is marked (xmax / LIVE bit); the body stays until reclaim is provably safe.' },
        { value: '2 events', label: 'gone vs reclaimed', hint: 'Visibility is instant; space returns only after no snapshot can see the row and the bytes are made contiguous.' },
        { value: '32 B', label: 'FSM bucket', hint: 'Per-page free space, rounded down — one byte per page, max-aggregated up a tree.' },
        { value: '8184', label: 'the storm’s final demand', hint: 'Delete everything, one defrag: free_space() must equal a mint page. Not one leaked byte.' },
      ],
    },
    {
      type: 'prose',
      md: `## Back to lab 01: the grader counts

Everything in this lesson is already graded in lab 01 — reread three checks with delete-eyes:

- **freespace_accounting** scripts the ugly cases deliberately: deleting the same slot twice, deleting a slot that never existed — all refused (\`false\`), all changing *nothing*. After every op, your \`free_space()\` must match the books to the byte.
- **delete_reuse** is the tombstone lesson as a test: fill the page, delete half — \`free_space()\` jumps immediately, yet a 512 B record is **refused** because dead bytes are accounting-only. Then \`defrag()\` runs, every survivor reads back byte-exact at its unchanged slot id, and the same 512 B record now fits.
- **storm** ends with the sweep: every record deleted, one defrag, and the page must report exactly 8184 free. If your accounting drifted by even one byte across 2000 ops, this is where it surfaces — the leak check.

The invariant from T1.L1, one last time: \`8192 = 8 header + 6·slot_count + live record bytes + dead_bytes + contiguous\`. A correct page is one where that equation holds after *every* op — gone, reclaimed, and everything in between, accounted to the byte.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Why can’t DELETE simply overwrite the row’s bytes and move on?',
          options: [
            'Because overwriting requires an exclusive lock on the page',
            'Because a transaction holding an older snapshot may still be entitled to read the row — and the delete itself may still roll back, so the bytes must survive until the outcome is durable',
            'Because the WAL must be checkpointed first',
            'It can — engines erase immediately; vacuum is only for index cleanup',
          ],
          correct: [1],
          explanation:
            'Two independent reasons: snapshot visibility (erasure would corrupt another transaction’s as-of reality — T4’s whole subject) and atomicity (an uncommitted delete must be undoable). So DELETE marks the header and the body stays until reclaim is provably safe.',
        },
        {
          q: 'In lab 01, free_space() jumps the moment you delete a record, yet a 512 B insert is refused until defrag runs. What exactly is the distinction?',
          options: [
            'A bug — free_space() should only count allocatable bytes',
            '“Gone” vs “reclaimed”: dead_bytes count as free in the accounting immediately, but only defrag makes them contiguous and therefore allocatable to inserts',
            'The slot array is full, so no insert can proceed regardless of space',
            'The free-space map is stale and needs a refresh',
          ],
          correct: [1],
          explanation:
            'free_space() = contiguous + dead_bytes by design: it reports what defrag would reclaim. Insert fitness reads the contiguous region alone. The delete_reuse check exists to prove you kept those two numbers separate.',
        },
        {
          q: 'The free-space map exists to…',
          options: [
            'Track which tuples are dead so vacuum can find them',
            'Record approximately how much free space each page has (rounded into 32-byte buckets, max-aggregated up a tree) so inserts find a candidate page without scanning the relation',
            'Map every ctid to its page for index lookups',
            'Remember which pages are pinned in the buffer pool',
          ],
          correct: [1],
          explanation:
            'It answers “which page has ≥ X bytes free?” in a tree descent instead of an O(relation) scan. Lossy is fine — a stale hint costs one wasted page visit, then the truth is recorded back. Dead-tuple tracking for vacuum is a different structure entirely.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: who keeps the promise',
      md: `The freespace machinery is documented in \`src/backend/storage/freespace/README\` (the bucket scheme and the max-aggregate tree), and the vacuum side is best learned from the interdb.jp *Internals of PostgreSQL* chapter 6 — the clearest free walkthrough of dead tuples, freeze, and what vacuum can and cannot reclaim — plus the PG docs chapter "Routine Vacuuming" for the operational knobs (\`autovacuum\` exists because "later" must actually arrive; a table that churns faster than its vacuum settings is the canonical bloat incident). Then look at your own tables: \`pg_stat_user_tables\` exposes \`n_dead_tup\` per table — the gone-but-not-reclaimed count, in the open, per relation. Next stop is T4 (\`many-worlds-one-truth-each\`), where \`xmin\`/\`xmax\` stop being trivia and become the visibility rule that decides exactly when "provably safe to reclaim" is true.`,
    },
  ],
}

export default lesson
