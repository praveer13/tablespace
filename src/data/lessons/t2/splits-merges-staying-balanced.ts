import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l2',
  slug: 'splits-merges-staying-balanced',
  trackId: 't2',
  index: 2,
  title: 'Splits, Merges, and Staying Balanced',
  minutes: 14,
  hook: 'The insert that cascades to the root, the delete that forces a rebalance, and the occupancy proofs that keep the tree shallow — by construction.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `T2.L1 gave you the static contract: every leaf at the same depth, every non-root node at least half full, every separator truthful. This lesson is the dynamic half — what happens when writes hit that contract. The entire maintenance burden is carried by two algorithms: the **split**, which absorbs overflow on insert, and the **rebalance**, which absorbs underflow on delete. Everything else — every cascade, every adversarial key order, every production war story about bloated indexes — is a consequence of those two. Learn them at the level lab 02 grades them: exact counts, exact separators, exact order of operations.`,
    },
    {
      type: 'prose',
      md: `## The leaf split, exactly

An insert descends to its leaf and finds it full: 32 records, \`LEAF_MAX\`. The new record makes 33 — one over, and no page can hold it. So the leaf divides:

1. **Left keeps 17 records, a new right leaf takes 16.**
2. **A copy of the right leaf's first key climbs to the parent** as a separator, with the new leaf as its child.
3. **The \`next\` chain is spliced**: the new leaf points where the old one pointed; the old one points at the new. Scans cross the split without noticing.

Read step 2 twice, because it is the law in miniature. The record **stays in the right leaf** — what climbs is a *copy*, a signpost. Records live in leaves; separators live above; after the split that one key exists twice, doing two different jobs. An insert that "moves the median record into the parent" has just invented a B-tree, lost the record's home, and broken the scan spine. The harness's audit walks the chain and counts records leaf by leaf; a promoted-and-removed record fails both.

The parent, meanwhile, just gained one separator and one child. Which might make it 33 separators.`,
    },
    {
      type: 'prose',
      md: `## The cascade, and the only way up

An internal node at 33 separators splits too — but the split differs in the one way that breaks students: **16 separators stay left, 16 go right, and the middle separator moves up. It stays in no child.** Why the asymmetry with leaves: a leaf separator's key owns a record that must remain below; an internal separator owns nothing — it was always pure boundary, and the median is the honest boundary between the two halves, so it climbs and vanishes from both.

Now the recursion writes itself. If the parent had room, the story ends: one separator inserted, every leaf still at the same depth. If the parent was full, it splits and climbs further. And if the splitting node **was the root**, there is no parent — so one is manufactured: a brand-new root with one separator and two children. That, and only that, increases height.

Notice what this design refuses to do. There is no rotation, no rebalancing pass, no repair-after-the-fact like an AVL or red-black tree. The B+tree grows *at the top*, under the only node allowed to be lopsided — and that is precisely why every leaf remains at one depth after any insert sequence, forever. Balance is not restored. It is never lost.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — a split cascade climbs: leaf → internal → new root',
      height: 56,
      nodes: [
        { id: 'op', x: 4, y: 26, w: 18, h: 10, label: 'insert(k, v)', sub: 'descends to a leaf', color: '#FBBF24' },
        { id: 'root', x: 34, y: 8, w: 52, h: 10, label: 'the root', sub: 'splitting HERE grows a new root: height +1', color: '#A78BFA' },
        { id: 'intl', x: 34, y: 24, w: 52, h: 10, label: 'internal level', sub: '32 separators → the 33rd splits 16 | median ↑ | 16', color: '#5CA8FF' },
        { id: 'leaf', x: 34, y: 40, w: 52, h: 10, label: 'leaf level', sub: 'LEAF_MAX 32 → the 33rd record splits 17 | 16', color: '#3EF2A4' },
      ],
      edges: [
        { from: 'op', to: 'leaf', label: 'overflow' },
        { from: 'leaf', to: 'intl', label: 'separator copy climbs' },
        { from: 'intl', to: 'root', label: 'median climbs' },
      ],
      steps: [
        { caption: 'Every insert descends to a leaf. If it has room, the story ends: sorted position, len + 1, done. The tree handles that case a million times without ceremony.', active: ['op', 'leaf'], edges: ['op->leaf'] },
        { caption: 'The 33rd record overflows the leaf: left keeps 17, a new right leaf takes 16, and a COPY of the right leaf\'s first key climbs to the parent. The record never leaves the leaf level — what climbs is a signpost. The next chain is spliced across the new leaf.', active: ['leaf', 'intl'], edges: ['leaf->intl'] },
        { caption: 'If that makes the parent 33 separators: the internal split is different — 16 stay left, 16 go right, and the MIDDLE separator moves up, remaining in NO child. It owned no record; it was always pure boundary.', active: ['intl', 'root'], edges: ['intl->root'] },
        { caption: 'If the splitting node was the root itself, a new root is manufactured: one separator, two children. This — and only this — increases height. Every leaf just got one level deeper, together, without a single leaf moving.', active: ['root'] },
        { caption: 'The law afterwards: separators refreshed along the path (no stale signposts), chain spliced, every leaf at the same depth, every non-root node at least half full. The split is not damage control — it is how balance is kept.', active: ['leaf', 'intl', 'root'] },
      ],
    },
    {
      type: 'prose',
      md: `## Minimum occupancy: the floor under the proof

The split rule says what happens at the ceiling. The **occupancy floor** says what must always be true beneath it: a non-root leaf holds at least \`LEAF_MIN = 16\` records, a non-root internal node at least \`INTERNAL_MIN = 16\` separators (17 children) — exactly half of max. The root is exempt: an internal root may legally hold one separator and two children, and an empty root leaf is a legal empty tree.

The floor is what turns "balanced" into a number. Walk a height-3 tree at the floor: the root has at least 2 children, each internal at least 17, each leaf at least 16 records — at least 2 × 17 × 16 = 544 records. At the ceiling the same height holds 34,848. So height is pinned between two exponentials in the fanout: it can never degenerate the way a binary search tree does. Feed a plain BST ascending keys and you get a linked list, n deep. Feed this tree the same keys and you get exactly \`expected_height\` levels — the split_balance check proves it at 2,048 keys, and the harness message is blunt: an extra level is a balance bug, not bad luck.

One honest wrinkle: **balanced is not packed.** Ascending inserts retire every leaf at exactly 17 records — the split leaves a left half that no future key will ever visit again. The tree is perfectly balanced and barely over half full. Production engines play the same game with different split points (some detect monotone inserts and split lopsidedly so retired pages stay nearly full), but the invariant they all keep is the floor, not the packing.`,
    },
    {
      type: 'prose',
      md: `## Delete: underflow, borrow, merge

Delete is insert's mirror, and the uglier operation, because underflow has two remedies and choosing between them is the algorithm. A leaf drops below 16 records → rebalance through the parent, in this order:

1. **Borrow, if a sibling can give.** Left sibling first: if it holds *more* than the minimum, rotate one record through the parent's separator — the sibling's largest record moves into the underfull leaf, and the parent separator is rewritten to the new boundary. (The law admits no stale signposts.) No left sibling, or it sits exactly at the floor? Try the right sibling the same way. Internal nodes borrow identically, rotating one separator **and one child** through the parent.
2. **Merge, when neither sibling can give.** Into the left sibling if there is one; otherwise absorb the right one. A leaf merge concatenates the records — two minimally-full siblings hold 16 + 16, which fits in 32; the floor being *half* of max is what makes a merge always fit — splices the \`next\` chain, and drops the parent's copy-separator. An internal merge pulls the parent's separator **down** between the two key arrays — the exact inverse of the split that once pushed a median up. The emptied node leaves the arena; its slot becomes a tombstone.

And the cascade runs downward: the parent just lost a separator, so it may underflow too — borrow or merge one level up, and so on. A root that shrinks to **one child** hands that child the crown: the only way height decreases, mirroring the root split as the only way it grows.`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Why real engines under-merge',
      md: `Count what a merge costs: two pages rewritten, the parent rewritten, maybe a cascade to the root — all of it WAL-logged (T3's tax), all of it under latches up the spine (T4's problem) — to reclaim one page that next week's inserts will need right back. So production engines merge lazily or not at all. Postgres's nbtree essentially never merges non-empty pages; fully empty ones get recycled for reuse. InnoDB merges on underflow, but nobody is in a hurry. The floor is enforced where it is cheap — at split and borrow time — and tolerated where it is not. Lab 02 is stricter than Postgres here: the audit walks occupancy after the worst storms it can seed, so YOUR tree borrows or merges on every underflow. Learn the strict form first; production relaxes it with its eyes open.`,
    },
    {
      type: 'prose',
      md: `## The adversarial shapes

Three key orders, three different stress shapes. The adversarial_orders check runs all three, and the storm mixes them:

- **Ascending — every auto-increment primary key in production.** Every insert lands in the rightmost leaf; every split happens on the rightmost path; each retired leaf freezes at 17 records, one over the floor. At lab capacities, 2,048 ascending keys produce exactly 3 levels — the split_balance check exists because this shape is not an edge case, it is the default primary key of the last thirty years.
- **Descending — the leftmost mirror.** Every split happens on the leftmost path, and every insert is a new tree minimum. The subtle part: the leftmost child has no separator to its left, so no parent signpost needs rewriting on insert — but your descent (\`partition_point\`, ties right) and your chain splice get exercised at the cold end of every split, where off-by-ones go to hide.
- **Duplicates and zipf — an upsert is not an insert.** The same 50 keys written 40 times must leave \`len == 50\` with last-write-wins values: no split, no structural change, just an overwrite at the leaf. Sounds trivial; it fails constantly, because the path that "found no key, insert one" and the path that "found it, overwrite" share code right up until they don't — and \`len\` is the first casualty.

Each shape stresses a different line of your implementation: the split arithmetic, the separator bookkeeping, the counter you maintain. The harness seeds all of them, on purpose, after your polite tests pass.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '17 | 16', label: 'leaf split at 33 records', hint: 'Left keeps 17, right takes 16, and a COPY of the right leaf’s first key climbs. The record stays below.' },
        { value: '16 | ↑ | 16', label: 'internal split at 33 separators', hint: 'The middle separator MOVES up and stays in no child — the asymmetry that breaks students.' },
        { value: '±1', label: 'height changes, root-only', hint: 'A split root grows a new root; a one-child root hands over the crown. Nothing else ever moves height.' },
        { value: '3', label: 'levels after 2,048 ascending keys', hint: 'split_balance demands exactly this at the pinned capacities — an extra level is a bug, not luck.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'A leaf holding 32 records receives the insert that makes 33. After the split, where does the promoted separator\'s record live?',
          options: [
            'In the parent — the median record moves up and is removed from the leaf',
            'In the right (new) leaf — only a COPY of its key climbs; the record itself never leaves the leaf level, and the same key now exists twice doing two different jobs',
            'In whichever leaf sorts lower, and the parent entry is marked as a moved record',
            'In a separate overflow page until the next rebalance',
          ],
          correct: [1],
          explanation:
            'Leaf splits promote a copy, internal splits move the median — that asymmetry is the law in miniature. Records live in leaves; separators are signposts. Move the record up and you have broken the next chain, the record count, and the rule that every key is exactly height fetches away.',
        },
        {
          q: 'An internal node reaches 33 separators and splits. What happens to the middle separator?',
          options: [
            'A copy of it climbs to the parent; it also stays in the right half, like the leaf case',
            'It is deleted and recomputed on the next lookup',
            'It stays in the left half as that half\'s high key',
            'It MOVES up to the parent and remains in neither child — left keeps 16 separators / 17 children, right takes 16 / 17, and the median becomes the parent\'s signpost between them',
          ],
          correct: [3],
          explanation:
            'An internal separator owns no record, so there is nothing to preserve below — the median is simply the honest boundary between the two halves. Copying it (leaf behavior) would leave a signpost routing to a subtree that no longer contains its key.',
        },
        {
          q: 'A delete leaves a leaf with 15 records (floor: 16). Its left sibling holds exactly 16, its right sibling 20. What does a correct rebalance do?',
          options: [
            'Merge with the left sibling — merges are preferred over borrows',
            'Borrow from the left sibling — left is always tried first',
            'Borrow from the RIGHT sibling: the left sits exactly at the minimum and cannot give (only a sibling with MORE than the minimum donates), so one record rotates from the right sibling through the parent separator, which is rewritten to the new boundary',
            'Nothing — 15 of 32 is within tolerance until the next checkpoint',
          ],
          correct: [2],
          explanation:
            'Lab 02\'s order is exact: borrow left if it holds more than the minimum, else right, else merge. "More than the minimum" is the gate — a sibling at the floor has nothing to give. Lab 02 is stricter than production here: Postgres\'s nbtree would let the page sit sparse; the harness audit will not.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the textbook vs the codebase',
      md: `The gap between the textbook algorithms and production code is this lesson's real content, and it is documented in the open. Postgres's nbtree README (\`src/backend/access/nbtree/README\`) explains why deletion merges almost nothing and what a half-dead page is, and it pairs with Lehman & Yao's 1981 paper "Efficient Locking for Concurrent Operations on B-Trees" — the B-link tree, whose right-links at every level you will meet as the high-key fence when T4 takes on index concurrency. Petrov's *Database Internals* chapter 2 covers the rebalancing schools across engines, and the B+tree lectures of **CMU 15-445** end where this lesson does: why the root split is the only growth, and why nobody in production is in a hurry to shrink. Then make your own tree honest — borrow left first, and splice the chain before you admire your work.`,
    },
  ],
}

export default lesson
