import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l6',
  slug: 'latch-crabbing',
  trackId: 't2',
  index: 6,
  title: 'Latch Crabbing: The Concurrent B+Tree',
  minutes: 15,
  hook: 'A B+tree under 16 writer threads is a queue disguised as an index — unless you crab: hold the parent, grab the child, release the parent only when the child is safe.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `T2.L1 and T2.L2 gave you the whole tree — the contract, the splits, the merges — for exactly one thread. Production hands that tree to sixteen writer threads and a hundred readers, and the naive answer collapses on contact: put one latch on the root and you have built a **queue that happens to contain an index**. Every insert serializes behind every other insert; adding cores adds nothing. This lesson is the protocol that lets threads pass each other *inside* the tree — latch crabbing — and the 1981 observation that makes reads nearly free. Along the way, T2.L1's deepdive promise comes due: the high-key fence, the right-link, and the paper that made the concurrent B+tree a solved problem before most of your tools existed.`,
    },
    {
      type: 'prose',
      md: `## Latch ≠ lock

First, vocabulary, because the industry says "lock" for both and T4 will bill you for the confusion:

- A **lock** is *logical*: it protects transactions from each other — rows, tables, predicates. It is held to commit, it participates in deadlock detection, and it rolls back with its transaction. Locks are T4's subject.
- A **latch** is *physical*: it protects the in-memory representation of a structure — one page's bytes, one node's pointers — from concurrent access. It is held for the microseconds of a page visit, it knows nothing about transactions, and **no deadlock detector is watching it.**

That last absence runs the whole lesson. With no detector to shoot a victim, latches are deadlock-free *by discipline*: every thread acquires in the same order — top-down, left-to-right within a level — so a cycle can never form. The ordering convention is not a style guide; it is the entire deadlock-avoidance argument. Break it once, in one rarely-hit code path, and two threads will someday hold parent and child in opposite orders, waiting forever, with nothing in the system even able to notice.`,
    },
    {
      type: 'prose',
      md: `## Crabbing: hold the parent, grab the child

The protocol is called **crabbing** (lock coupling in the older literature — Bayer & Schkolnick, 1977), and it works the way a crab walks a branch: never let go of what you are holding until the next hold is secure.

A **search** descends hand over hand: read-latch the parent, read-latch the child, release the parent. The release is safe because the descent decision was made from the parent's contents while the parent was latched, and the child you chose is now latched in your own hand — whatever happens above, your footing cannot move. At most two latches are held at any instant.

A **writer** cannot afford that optimism, because a split or merge propagates *upward* (T2.L2). So it descends taking **write** latches — parent, then child — and releases the parent only when it can *prove* the climb is impossible. That proof is the next section.`,
    },
    {
      type: 'prose',
      md: `## The safe-node rule

The rule that decides when ancestors may be released:

- On **insert**, a node is **safe** if it is not full: even if the child below splits, this node absorbs the new separator without splitting itself. The cascade provably dies here.
- On **delete**, a node is safe if it holds **more than the minimum**: even if the child below merges away, this node can drop a separator without underflowing.

So the writer descends, write-latching parent and child in turn, and the moment the freshly-latched child is safe, **every ancestor latch is released.** In the common case the leaf's parent is safe — the insert completes holding two latches, and the other fifteen writer threads never knew you were there. In the worst case the whole spine to the root stays latched, which is *correct*: that is exactly the case where the root might split — T2.L2's only way up.

Real engines (and 15-445's grader) usually add the **optimistic** variant: descend with *read* latches as if you were a search, take a *write* latch only at the leaf. If the leaf is safe — has room for this insert, which is nearly always — the write completes having write-latched exactly one node. If the leaf is full, shrug and restart the descent pessimistically. The optimistic path pays a rare restart on splits and wins the tree's whole latching budget the rest of the time — splits are one insert in ~fanout, so the trade is not close.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — crabbing down the spine: release at the first safe node',
      height: 60,
      nodes: [
        { id: 't', x: 4, y: 26, w: 16, h: 10, label: 'writer', sub: 'insert(42)', color: '#FBBF24' },
        { id: 't2', x: 72, y: 17, w: 26, h: 10, label: 'next thread', sub: 'enters once spine is free', color: '#3EF2A4' },
        { id: 'root', x: 30, y: 2, w: 34, h: 10, label: 'root', sub: 'W-latched on entry', color: '#A78BFA' },
        { id: 'i1', x: 30, y: 17, w: 34, h: 10, label: 'internal', sub: 'FULL — not safe', color: '#5CA8FF' },
        { id: 'i2', x: 30, y: 32, w: 34, h: 10, label: 'internal', sub: 'has room — SAFE', color: '#5CA8FF' },
        { id: 'leaf', x: 30, y: 47, w: 34, h: 10, label: 'leaf', sub: 'splits here', color: '#FB7185' },
      ],
      edges: [
        { from: 't', to: 'root', label: 'W-latch' },
        { from: 'root', to: 'i1' },
        { from: 'i1', to: 'i2' },
        { from: 'i2', to: 'leaf' },
        { from: 't2', to: 'root', label: 'after release' },
      ],
      steps: [
        { caption: 'Pessimistic descent: write-latch the root — in the worst case (T2.L2’s root split) the cascade climbs here, so the latch must be here too. Everything you hold is closed to other writers.', active: ['t', 'root'], edges: ['t->root'] },
        { caption: 'Latch the child BEFORE releasing the parent — never hold fewer latches than the frontier. This internal node is FULL: not safe. A split below would climb into it, so the ancestors stay held.', active: ['root', 'i1'], edges: ['root->i1'] },
        { caption: 'Next level: room for one more separator — SAFE for an insert. Latch it, then release EVERY ancestor: the cascade provably dies here. The spine opens; the next thread pours in behind you.', active: ['i1', 'i2', 't2'], edges: ['i1->i2', 't2->root'] },
        { caption: 'The leaf splits holding only two latches: its own and the safe parent’s. The whole rest of the tree stayed open the entire time — that is the protocol’s entire point.', active: ['i2', 'leaf'], edges: ['i2->leaf'] },
      ],
    },
    {
      type: 'prose',
      md: `## Lehman-Yao: land, check the fence, slide right

One observation upgrades the whole design. **Lehman & Yao, 1981: splits only propagate to the right.** A splitting node keeps its left half and gains a right sibling; no key ever moves *left* across a node's boundary. So give every node — at every level, not just the leaves — two extra fields:

- a **high-key fence**: the largest key this node is responsible for — the signpost law (T2.L1) extended into a per-node upper bound, and
- a **right-sibling link**: the leaf chain you already know, extended upward through every level.

Now a search can race a split and *win*. It descends by possibly-stale signposts — fine, signposts only ever go stale rightward — lands on a node, and checks the fence: is my key beyond the high key? If yes, its range moved right during the descent: follow the sibling link, check again, repeat. The search never retries from the root; it **slides right** along the level until some fence says *here*. And because fence-plus-link makes every transient state readable, a B-link search takes **no latches at all** — zero. Writers still couple, briefly (the splitting node, its new sibling, then one level up — a small constant, never the spine), but readers stop existing as far as contention is concerned.

This is the **B-link tree**, and it is not a toy: Postgres's nbtree is a Lehman-Yao descendant — right-links and high-key fences in production, on your data, right now. Deletion is where production deviates: the 1981 paper is famously quiet about merges, and nbtree's deletion machinery is its own saga (the deepdive points at the README).`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'The convoy no protocol can fix',
      md: `Crabbing lets threads pass each other in the spine; it does not let them share one page. Point a monotonic key stream — \`BIGSERIAL\`, \`created_at\`, anything ascending — at your beautiful concurrent tree and **every writer wants the same rightmost leaf's write latch at the same instant.** The protocol is perfect; the serialization is real. Crash Week's INC-3 is this exact telemetry: 8 writer connections → 42k inserts/s, 16 connections → 27k — CPU idle, disk idle, one wait event dominating: that leaf. T4.L4 names the disease (and its heap-page cousin, the single hot counter row); the cure is not a cleverer protocol but a different **key shape** — hash-prefix, UUIDs, partition the index — so no single page is the whole world's destination. When the pager goes off, no latch trick saves you. The shape does.`,
    },
    {
      type: 'statline',
      stats: [
        { value: 'µs', label: 'latch hold time', hint: 'Held for a page visit, never to commit; no deadlock detector, no transaction semantics. T4’s locks are a different animal.' },
        { value: '≤ 2', label: 'latches a crabbing descent holds', hint: 'Parent plus child, hand over hand; the parent is released the moment the child is latched — and safe.' },
        { value: '0', label: 'latches a B-link search takes', hint: 'Lehman-Yao: land, check the high-key fence, slide right if a split moved your keys. Reads stop existing as contention.' },
        { value: 'top-down', label: 'the only legal acquire order', hint: 'No deadlock detector exists, so the ordering discipline IS deadlock avoidance. Break it once and wait forever.' },
      ],
    },
    {
      type: 'prose',
      md: `## Why this is P2's last boss

15-445's second project builds the B+tree index in BusTub, and its final task — task 4, the concurrent index — is this lesson with a grader attached. The task exists separately from "build a B+tree" because concurrency is where correct-looking trees go to die:

- Every invariant from T2.L1 and T2.L2 must now hold **transiently**, under interleavings you cannot enumerate. A split that is correct sequentially can still tear a concurrent search if you release one latch one line too early.
- The failures are Heisenbugs: no assertion fires in your single-threaded tests, and the corrupt tree appears only when two descents cross. The grader's entire job is to make them cross — many threads, small trees, adversarial timing — and it is good at its job.
- The protocol is the deliverable: hand-over-hand order, safe-node release, and an optimistic fast path that knows when to give up and go pessimistic. Get the discipline right and the stress test is boring — which is exactly what you want a concurrent index to be.

And the INC-3 callout is the bridge forward: latches are the *physical* layer of contention. T4 builds the *logical* layer — locks, snapshots, conflicts — on top of it, and Crash Week grades you on telling the two apart from telemetry.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Which statement correctly separates a latch from a lock?',
          options: [
            'A latch is a lock with a shorter timeout',
            'Latches protect rows; locks protect pages',
            'They are synonyms — Postgres says latch, MySQL says mutex',
            'A latch guards a physical structure — a page\'s bytes — for microseconds, with no deadlock detector and no transaction semantics; a lock guards logical content to commit, with deadlock detection and rollback behind it',
          ],
          correct: [3],
          explanation:
            'Physical vs logical, microseconds vs commit, discipline vs detector. Both engines distinguish both words, by the way: InnoDB’s mutexes and rw-locks are latches by another name — the taxonomy is universal even where the vocabulary is not.',
        },
        {
          q: 'An insert crabs down the spine holding a write latch on the root. It has just write-latched an internal child that has room for one more separator. What does the protocol do next?',
          options: [
            'Hold the root until the leaf is latched — splits can cascade',
            'Downgrade the root latch to a read latch',
            'Release the root (and every other ancestor): the child is SAFE — even if the subtree below splits, this node absorbs the separator without splitting, so nothing above it can change',
            'Restart the descent optimistically',
          ],
          correct: [2],
          explanation:
            'The safe-node rule: not-full on insert (above-minimum on delete) means the cascade provably dies at this node, so ancestors are dead weight. Holding them "just in case" is how you rebuild the root-latch queue this lesson exists to destroy.',
        },
        {
          q: 'A B-link search descends for key 42 while a concurrent split moves 42\'s keys to a new right sibling. The search lands on the old node. What happens?',
          options: [
            'It retries from the root against a fresh snapshot of the signposts',
            'It takes a write latch and waits for the split to finish',
            'It returns NOT_FOUND — the key is mid-split and temporarily invisible',
            'It checks the node\'s high-key fence: 42 lies beyond it, so it follows the right-sibling link and continues — no latch, no restart, because splits only ever move keys rightward',
          ],
          correct: [3],
          explanation:
            'The fence plus the right-link is the whole Lehman-Yao trick: every transient state is readable, so searches tolerate the race instead of preventing it. Returning NOT_FOUND for a key that exists is the corruption this design was built to make impossible.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the 1981 paper and its production descendants',
      md: `The paper: **Lehman & Yao, "Efficient Locking for Concurrent Operations on B-Trees" (ACM TODS 6(4), 1981)** — high-key fences, right-links at every level, latch-free searches, and the famous silence about deletion that every production implementor since has had to break. The lecture: **CMU 15-445's index-concurrency lecture** — crabbing, the safe-node rule, and the optimistic descent, whiteboarded, and the spec behind BusTub P2's final task. The shipping descendant: **Postgres's nbtree README** (\`src/backend/access/nbtree/README\`) — a B-link tree with forty years of deletion machinery bolted on; T2.L1 sent you there for the page layout, so now read the concurrency sections with this lesson's eyes. And the contrast that keeps you honest: **SQLite** ships a B-tree with **no latches at all** — one writer at a time, serialized by a single mutex, the concurrent-index problem solved by refusal. It is correct for its substrate: an embedded library where "one writer" is the contract, not a limitation. Crabbing is what you build when refusal is not on the menu.`,
    },
  ],
}

export default lesson
