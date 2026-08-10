import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l2',
  slug: 'the-anomaly-zoo',
  trackId: 't4',
  index: 2,
  title: 'The Anomaly Zoo',
  minutes: 15,
  hook: 'Dirty reads to write skew: the isolation levels as a menu of which anomalies your application can afford — named, shown, and priced.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Isolation levels are usually taught as four names to memorize, in order, from a table. That framing is backwards, and the table is worse than useless. **A level is not a thing — it is a refusal**: a list of interleavings the engine promises will never happen. Learn the refusals and the names price themselves; memorize the names and you will misconfigure production, because — as we will see — the names and the refusals stopped matching decades ago.

This lesson is the catalog: five anomalies, each small enough to hold in your head, each famous enough to have caused an outage.`,
    },
    {
      type: 'prose',
      md: `## The gallery, part one: reading lies

Each exhibit is a two-transaction strip. Time reads top to bottom; \`A\` and \`B\` are concurrent.

**Dirty read** — you used data that never existed:

| step | txn A | txn B |
|---|---|---|
| 1 | \`UPDATE bal = 90\` (uncommitted) | |
| 2 | | \`SELECT bal\` → **90** |
| 3 | \`ABORT\` | |

B's 90 was never committed by anyone — it is a rumor. Forbidden literally everywhere that matters: Postgres will not show you one at any level, and lab 04's no_dirty_reads is the same refusal in your own engine.

**Non-repeatable read** — same transaction, same row, two answers:

| step | txn A | txn B |
|---|---|---|
| 1 | | \`SELECT bal\` → 100 |
| 2 | \`UPDATE bal = 90; COMMIT\` | |
| 3 | | \`SELECT bal\` → **90** |

Allowed at read committed, where snapshots are per-*statement*; forbidden from repeatable read up, where the snapshot is per-*transaction* — T4.L1's frozen world.

**Phantom** — the row didn't change; the *predicate* did:

| step | txn A | txn B |
|---|---|---|
| 1 | | \`SELECT count(*) WHERE status='open'\` → 7 |
| 2 | \`INSERT ... status='open'; COMMIT\` | |
| 3 | | same query → **8** |

The non-repeatable read's set-valued cousin — and historically the boundary dispute between "repeatable read" and "serializable."`,
    },
    {
      type: 'prose',
      md: `## The gallery, part two: writing blind

**Lost update** — two writers, one row, and one increment evaporates:

| step | txn A | txn B |
|---|---|---|
| 1 | \`SELECT bal\` → 100 | |
| 2 | | \`SELECT bal\` → 100 |
| 3 | \`UPDATE bal = 90; COMMIT\`  (100 − 10) | |
| 4 | | \`UPDATE bal = 125; COMMIT\`  (100 + 25) |

Final balance 125: A's −10 never happened, because B computed from a stale read and overwrote blind. This is why first-writer-wins exists (T4.L3) — and why the correct counter update is \`UPDATE ... SET bal = bal + 25\`, not read-compute-write.

**Write skew** — the blind spot, and the one that ships to production. Invariant: *at least one doctor on call.*

| step | txn A | txn B |
|---|---|---|
| 1 | \`SELECT count(*) WHERE on_call\` → 2 | |
| 2 | | \`SELECT count(*) WHERE on_call\` → 2 |
| 3 | \`UPDATE ... SET on_call=false WHERE id=A\` | |
| 4 | | \`UPDATE ... SET on_call=false WHERE id=B\` |

Both checked the invariant; both passed; both committed; **zero doctors on call.** The reads overlap, but the writes are *disjoint* — there is no shared row to conflict on, so every per-row mechanism (row locks, first-writer-wins, snapshot isolation itself) lets it straight through.`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'the anomaly that passes code review',
      md: `Read either transaction alone and it is *correct*: check the guard, then act. The bug lives in the interleaving, and your test suite — which runs transactions one at a time, like everyone's — will never construct it. Real sightings beyond the hospital: wallet services double-spending (each debit checked \`balance ≥ amount\`), booking systems overbooking (each reservation checked \`seats > 0\`), admin consoles deleting the last admin (each delete checked \`count ≥ 1\`). If your invariant mentions more than one row, write skew is the exhibit to fear.`,
    },
    {
      type: 'prose',
      md: `## The standard vs what ships

SQL-92 defined the four levels by forbidding three phenomena — dirty read, non-repeatable read, phantom:

| level | dirty | non-repeatable | phantom |
|---|---|---|---|
| read uncommitted | allowed | allowed | allowed |
| read committed | — | allowed | allowed |
| repeatable read | — | — | allowed |
| serializable | — | — | — |

Two problems with this table. First, it is *incomplete*: lost update and write skew appear nowhere in it — Berenson et al.'s 1995 critique showed the standard's three phenomena are ambiguous and miss most of the zoo. Second, **nobody ships the table**:

- **Postgres**: read committed = per-statement snapshot; **repeatable read = snapshot isolation** — phantoms forbidden too, *stronger than the name implies*; serializable = SSI (T4.L3), which kills write skew.
- **Oracle**: "serializable" = snapshot isolation. Write skew walks straight through the top level — the most famous mislabel in the industry.
- **InnoDB**: repeatable read serves consistent reads from snapshots but takes next-key locks on locking reads, preventing phantoms there — a hybrid the standard never described.

So the operational rule: **memorize anomalies, not level names** — then read your engine's docs to learn which anomalies it actually refuses at the level you are paying for.`,
    },
    {
      type: 'prose',
      md: `## Choosing a level: which anomalies your invariants depend on

The menu question, finally, is about your invariants, not your feelings:

- **Row-local invariants** (balance never negative, legal status transitions): the enemy is the lost update. Atomic single-row statements (\`SET bal = bal − 10\`, evaluated under the row lock) or repeatable read cover it.
- **Cross-row invariants** (at least one admin; debits sum to credits; a slot booked at most once): the enemy is write skew. Snapshot isolation is *not enough* — you need serializable, or you materialize the conflict yourself: \`SELECT ... FOR UPDATE\` on a summary row, an explicit lock, a constraint trigger that touches a shared row.
- **Read-only analytics**: no invariant is being written at all — take a snapshot and never look back.

And price the direction: higher levels convert silent anomalies into loud **serialization errors** — transactions that must be retried (T4.L3's bill). You are never choosing "safety vs speed"; you are choosing *which failures you can afford to retry* versus *which you cannot afford at all*.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '5', label: 'anomalies, named and priced', hint: 'Dirty read, non-repeatable read, phantom, lost update, write skew — the catalog is short; the incidents are not.' },
        { value: '3', label: 'phenomena in SQL-92', hint: 'Dirty / non-repeatable / phantom. The 1995 critique: ambiguous, and missing most of the zoo.' },
        { value: '1', label: 'level stronger than its name', hint: 'Postgres repeatable read is snapshot isolation: phantoms forbidden, write skew possible.' },
        { value: '0', label: 'engines whose labels mean the standard', hint: 'Oracle’s "serializable" is SI. Read the docs, not the adjective.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Transaction A reads count(*) WHERE on_call → 2 and clears its own on_call flag; transaction B does the same concurrently. Both commit; no doctor is on call. Under snapshot isolation, what just happened?',
          options: [
            'A phantom — B’s second read saw a different set',
            'A lost update — both wrote the same row',
            'Write skew — each txn read a state the other’s disjoint write invalidated; no shared row, so SI’s per-row mechanisms never fired',
            'A dirty read — one of them saw uncommitted data',
          ],
          correct: [2],
          explanation:
            'Reads overlap, writes are disjoint — the signature of write skew and the reason snapshot isolation is not serializable. It is also why this exact shape keeps shipping: each transaction is locally correct.',
        },
        {
          q: 'Under Postgres REPEATABLE READ (snapshot isolation), which anomalies are prevented? (select all)',
          options: [
            'Dirty read',
            'Non-repeatable read',
            'Phantom',
            'Write skew',
          ],
          correct: [0, 1, 2],
          multi: true,
          explanation:
            'The frozen snapshot forbids all three read-side anomalies — PG’s repeatable read is stronger than the standard’s name. Write skew survives, because the writes never collide on a row; that is what SERIALIZABLE (SSI, T4.L3) exists for.',
        },
        {
          q: 'Your service enforces "at least one row with role=\'admin\'" in application code: check the count, then delete or demote. Which level actually protects the invariant?',
          options: [
            'Read committed — the count re-reads fresh data each statement',
            'Repeatable read — the snapshot prevents phantoms',
            'Serializable (SSI) — the check-then-act pair is a write-skew shape only cycle detection aborts — or materialize the conflict with SELECT ... FOR UPDATE on a shared row',
            'Read uncommitted is fine — deletes are rare',
          ],
          correct: [2],
          explanation:
            'A cross-row invariant is exactly snapshot isolation’s blind spot. Either pay for serializable and retry the 40001s, or make the two transactions collide on purpose so first-writer-wins can see them.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the critique, the map, the test suite',
      md: `The paper that broke the standard's table: **Berenson, Bernstein, Gray, Melton, O'Neil & O'Neil, "A Critique of ANSI SQL Isolation Levels" (SIGMOD 1995)** — short, polite, devastating; it names the phenomena the standard forgot and is the reason we talk about snapshot isolation at all. The modern map of the territory: **Jepsen's consistency models (jepsen.io/consistency)** — the zoo organized as a lattice, with the database-marketing translation layer included. The empirical answer to "what does my engine actually ship": **Martin Kleppmann's Hermitage (github.com/ept/hermitage)** — hand-run anomaly transcripts per engine and level; read your engine's file before your next migration. And the vendor truth, unusually candid: **PostgreSQL docs, "Transaction Isolation"** — one of the few manuals that admits which anomalies survive which level.`,
    },
  ],
}

export default lesson
