import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't4.l1',
  slug: 'many-worlds-one-truth-each',
  trackId: 't4',
  index: 1,
  title: 'Many Worlds, One Truth Each',
  minutes: 16,
  hook: 'Version chains and snapshots: how readers never block writers, and what a transaction can see at every instant. Then lab 04, under a deterministic scheduler.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `T1.L4 left a promise hanging: a deleted row is *condemned*, not erased — "reclaim it when provably safe" — and it flatly refused to say what "provably safe" means. This lesson pays that debt, and the answer turns out to be the whole of MVCC in one predicate.

Start from the problem it solves. One row, two transactions: one is reading it, one is rewriting it. The single-version answer is a lock — the reader blocks the writer or the writer blocks the reader, and concurrency dies on whichever ordering you picked. MVCC's answer is insolent: **keep both.** Every transaction reads from its own private version of the world, taken at a moment in time, and the engine's job is to keep all of those worlds honest at once. Readers never block writers; writers never block readers. The fine print is the rest of this track.`,
    },
    {
      type: 'prose',
      md: `## The move: append, never overwrite

One rule underneath everything: **an UPDATE writes a new version; it never edits the old one.** The new tuple gets its own (page, slot) — with all the index consequences T1.L3 priced — and its header's \`xmin\` is stamped with your transaction id. The old tuple is not touched except for one write: its \`xmax\`, stamped with your transaction id. DELETE is the same operation minus the new version: stamp \`xmax\`, done — T1.L2's four-byte death certificate.

Every row becomes a **version chain**, and overwriting is forbidden for one reason: the old version may still be somebody's *present*. Your past is another transaction's now. The \`xmin\`/\`xmax\` pair from T1.L2's 23-byte header — trivia then — is the entire design now: two 4-byte integers per tuple, from which every world is computed.`,
    },
    {
      type: 'prose',
      md: `## Snapshots: a timestamp plus a guest list

The private world is called a **snapshot**, and it is two pieces of data captured in an instant:

1. **The horizon** — the current transaction-counter value: everything committed *before* this is potentially visible to you.
2. **The in-flight set** — the transactions in progress *right now*: whatever they are doing, none of it is visible to you, even if they commit later.

(Taken at transaction begin under repeatable read; taken *per statement* under read committed — T4.L2 prices that difference.) Cost: proportional to the number of active transactions, no global lock, no coordination. Cheap to take, exact to evaluate.`,
    },
    {
      type: 'prose',
      md: `### The visibility predicate, stated exactly

A version **v** is visible to your snapshot **iff both** of these hold:

1. **Its creator was committed and in your past**: \`xmin\` committed before the snapshot was taken **and is not in the snapshot's in-flight set** (and isn't aborted) — with one exception: \`xmin\` may be **you**. You always read your own writes.
2. **Its deleter hadn't committed by then**: \`xmax\` is empty, or belongs to a transaction that was still in flight at your snapshot, or committed after it, or aborted.

Creator committed before your snapshot; deleter had not. That is the whole rule. Every isolation-level behavior in T4.L2 is a consequence of evaluating this predicate against different snapshots — and "provably safe to reclaim" is about to fall out of it as a one-liner.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — one row, three versions, two worlds',
      height: 46,
      nodes: [
        { id: 'v1', x: 4, y: 6, w: 26, h: 11, label: 'v1 · bal=100', sub: 'xmin 10 ✓ · xmax 30', color: '#94A3B8' },
        { id: 'v2', x: 37, y: 6, w: 26, h: 11, label: 'v2 · bal=90', sub: 'xmin 30 ✓ · xmax 41', color: '#3EF2A4' },
        { id: 'v3', x: 70, y: 6, w: 26, h: 11, label: 'v3 · bal=85', sub: 'xmin 41 · in flight', color: '#FB7185' },
        { id: 'snapB', x: 4, y: 30, w: 26, h: 10, label: 'snapshot B', sub: 'earlier · sees bal=100', color: '#5CA8FF' },
        { id: 'snapA', x: 37, y: 30, w: 26, h: 10, label: 'snapshot A', sub: 'later · sees bal=90', color: '#5CA8FF' },
        { id: 'vacuum', x: 70, y: 30, w: 26, h: 10, label: "T4.L4's problem", sub: 'bodies for the reaper', color: '#FBBF24' },
      ],
      edges: [
        { from: 'v1', to: 'v2', label: 'superseded by txn 30' },
        { from: 'v2', to: 'v3', label: 'superseded by txn 41' },
        { from: 'snapB', to: 'v1', label: 'creator 30 in flight → v2 invisible' },
        { from: 'snapA', to: 'v2', label: '30 committed, 41 not → v2' },
        { from: 'v3', to: 'vacuum', label: '41 aborts → born dead' },
      ],
      steps: [
        { caption: 'One row, three versions chained by supersession. v1 and v2’s creators committed; v3 exists only inside txn 41, which is still in flight.', active: ['v1', 'v2', 'v3'] },
        { caption: 'Snapshot B was taken while txn 30 was in flight: v2’s creator is in the in-flight set, failing clause 1 — so B’s world contains v1, and bal reads 100.', active: ['snapB', 'v1'], edges: ['snapB->v1'] },
        { caption: 'Snapshot A was taken after txn 30 committed, with 41 still in flight: v2’s creator is committed and in A’s past; its deleter had not committed. Both clauses hold — A’s world contains v2, bal reads 90. Two live transactions, two different truths, both correct.', active: ['snapA', 'v2'], edges: ['snapA->v2'] },
        { caption: 'Txn 41 aborts: v3’s creator fails clause 1 for every snapshot that exists or will ever exist — it was born dead. Its bytes are T4.L4’s raw material.', active: ['v3', 'vacuum'], edges: ['v3->vacuum'] },
      ],
    },
    {
      type: 'prose',
      md: `## "Provably safe", answered

T1.L4's handoff lands here. A dead version's bytes may be reclaimed **once no open snapshot can still see it** — and the predicate tells you exactly when that is: when the version's death (its committed \`xmax\`) is older than the **oldest open snapshot** in the system. The engine tracks that as a single number — the oldest xmin any active transaction could still care about, plus what replication slots demand (T4.L4) — the **watermark**. Everything dead below the watermark is garbage, provably; everything at or above it is someone's world, and it stays. Vacuum is the janitor that walks the watermark — and the watermark is why one forgotten transaction can hold the entire past hostage, which is T4.L4's incident.

One conflict MVCC refuses to version away: **two transactions updating the same row.** Sibling versions of one row would make the row's truth ambiguous across worlds — so the first writer wins, and the second must fail or wait. Lab 04 grades it as ww_conflict; T4.L3 gives it the full treatment.`,
    },
    {
      type: 'prose',
      md: `## Lab 04: many worlds, one scheduler

Lab 04 (mvcc) hands you \`src/mvcc.rs\` — a versioned store with snapshots — and grades the predicate under a **deterministic scheduler** that enumerates interleavings (begin / read / write / commit / abort across three transactions, every shuffled order that matters) and compares your answers against a **serial reference execution**. Five checks:

- **no_dirty_reads** — another transaction's uncommitted versions are invisible: the creator fails clause 1, always.
- **read_own_writes** — your own uncommitted versions are visible to you and no one else: the \`xmin\`-is-you exception, implemented exactly once.
- **snapshot_repeatable** — a snapshot taken at T returns the same answers at T+forever, no matter what commits later. Your world is frozen at birth.
- **ww_conflict** — the second writer to the same row is rejected. First-writer-wins, because the alternative is the lost update (T4.L2).
- **interleaving_storm** — the enumerated schedules, end to end, against the reference. Not "it passed when I tried it" — **it passes every schedule we could construct.**

The invariant to hold while you code: **every world is one evaluation of the predicate.** If you find yourself special-casing "recent" versions, you are building a bug the storm will find.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '2 × u32', label: 'xmin · xmax', hint: 'Birth and death certificates from T1.L2’s 23 B header — the entire per-tuple bookkeeping.' },
        { value: '1 predicate', label: 'every world', hint: 'Creator committed before the snapshot and not in flight; deleter hadn’t committed. Both clauses, always.' },
        { value: '2 things', label: 'a snapshot', hint: 'The horizon (counter value) plus the in-flight set. Cheap to take, exact to evaluate.' },
        { value: '1 number', label: 'the watermark', hint: 'Oldest open snapshot: the reclaim boundary — and the pin in T4.L4’s incident.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Your snapshot was taken while txn 41 was in flight. A version has xmin = 30 (committed before your snapshot) and xmax = 41 (commits *after* your snapshot). Visible to you?',
          options: [
            'No — the version is deleted, and deletes are final',
            'No — xmax is set, so the version is dead for everyone',
            'Yes — its creator was committed and in your past; its deleter was still in flight at your snapshot, so both clauses of the predicate hold',
            'Only if you are txn 41',
          ],
          correct: [2],
          explanation:
            'A delete that was not committed at snapshot time does not exist for you — the version lives on in your world. Clause 1 (creator) and clause 2 (deleter) both pass.',
        },
        {
          q: 'Under a snapshot taken at begin, you read bal = 100. Other transactions then commit changes to that row. Ten minutes later, still inside your transaction, you read it again. What do you see?',
          options: [
            'The newest committed value — reads always follow commits',
            '100 — your world froze at snapshot time; anything committed later fails clause 1 of the predicate',
            '100, but only if you ran no UPDATE in the meantime',
            'Whichever value the serial reference returns',
          ],
          correct: [1],
          explanation:
            'That is lab 04’s snapshot_repeatable check in one sentence: the snapshot’s horizon and in-flight set never change, so the predicate’s answers never change. Your own writes are the only exception.',
        },
        {
          q: 'Two transactions UPDATE the same row concurrently. Why must one of them fail or wait?',
          options: [
            'Because the row’s page latch is held for the whole transaction',
            'Because two sibling live versions would orphan one transaction’s write — the lost update — so first-writer-wins; T4.L3 prices the alternatives',
            'Because the WAL forbids two records for one page',
            'No reason — MVCC handles it; both versions coexist',
          ],
          correct: [1],
          explanation:
            'MVCC versions readers out of each other’s way, but a row has one future: letting both writes through silently discards one. Lab 04’s ww_conflict is the minimal honest enforcement.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the predicate as production code',
      md: `The visibility rule is not folklore — it is one C function: **HeapTupleSatisfiesMVCC** in Postgres's **src/backend/access/heap/heapam_visibility.c**, clause by clause, hint bits and all (the per-tuple "this xid committed" caches that keep the predicate cheap). The clearest free walkthrough of snapshots, xmin/xmax, and the visibility map: **interdb.jp, The Internals of PostgreSQL, chapter 5 (Concurrency Control)**. The doctrine: **PostgreSQL docs, "Transaction Isolation"** — which snapshot each level takes (per-statement vs per-transaction) is the entire read-committed-vs-repeatable-read difference, T4.L2's main exhibit. And the roots: multiversion concurrency goes back to **Reed (1978)** and **Bernstein & Goodman's concurrency-control survey (ACM Computing Surveys, 1981)** — worth reading after lab 04, whose deterministic scheduler is a direct descendant of the theory those works started.`,
    },
  ],
}

export default lesson
