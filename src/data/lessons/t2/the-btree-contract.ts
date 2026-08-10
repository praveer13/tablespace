import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l1',
  slug: 'the-btree-contract',
  trackId: 't2',
  index: 1,
  title: 'The B+Tree Contract',
  minutes: 16,
  hook: 'Separators, fanout, and why every lookup costs exactly the same: the invariants that made this tree the default index for fifty years. Then you build one — lab 02.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `Ten million users, one query: \`SELECT * FROM users WHERE id = 817234\`. Without an index the engine reads the table whole — every heap page, about 125,000 of them at T0's arithmetic — to hand back one row. With an index it reads **three pages**. That gap is what \`CREATE INDEX\` buys, and what gets built is, with probability close to one, a **B+tree**. It has been the default index of every relational engine since the 1970s — Postgres's nbtree, InnoDB's clustered index, SQLite's table format, SQL Server, Oracle — and it outlived fifty years of hardware revolutions because its invariants are tuned to the one thing that never changed: the page. This lesson is the contract those invariants form. The next one is what it costs to keep them under writes. Then lab 02 grades whether you can keep them yourself.`,
    },
    {
      type: 'prose',
      md: `## Why a tree at all

Start from what the executor demands of an index, because the structure is just those demands made of pages:

- **Point lookups, fast.** \`id = 817234\` in a handful of page fetches, not a scan.
- **Order and ranges, native.** \`WHERE ts BETWEEN a AND b ORDER BY ts LIMIT 50\` must fall out of the structure already sorted — no sort pass, no heap of candidates.
- **Dynamic, always.** Inserts and deletes every second, with no rebuild window and no slow degradation as the data grows.

Now walk the candidates off the stage. A **sorted array** binary-searches beautifully and inserts catastrophically: every insert memmoves half the array, and on disk that is a rewrite of every page after the insertion point. A **hash table** answers equality in one probe and knows nothing about order — \`>\`, \`BETWEEN\`, and \`ORDER BY\` are not its business (T2.L4 gives it its honest due). A **linked list** or skiplist is O(log n) only in memory; on disk, pointer-chasing n nodes is n random page faults.

What survives is a tree — but the branching factor is where the database parts ways with your algorithms class. A binary search tree over 10M keys is ~24 levels deep, and on disk each level is a pointer chase to a random page: ~24 I/Os per lookup. The fix is to size the node to the unit the hardware already moves: **one page, holding hundreds of keys.** Fanout stops being 2 and becomes ~500, and depth collapses from 24 to 3. Sorted order + log-time descent + page-sized nodes: that is the entire idea. Everything else in this lesson is bookkeeping for it.`,
    },
    {
      type: 'prose',
      md: `## B+ vs B: records at the bottom, signposts above

The original B-tree (Bayer & McCreight, 1972) stores records at *every* level — an internal node holds keys, child pointers, and payloads. The **B+tree** moves every record to the leaves. Internal nodes carry only **separators**: (key, child pointer) pairs whose entire job is routing. That one change buys three things:

- **Fanout.** An internal page with no payload packs ~500 separators into 8KB instead of ~80 records-with-pointers. Shallower tree, same data.
- **Scans.** The leaves are linked left → right — a \`next\` chain. A range scan descends once to the left endpoint, then walks *sideways*, leaf to leaf, in order. No stack, no revisiting internal pages.
- **Uniform cost.** Every key lives exactly \`height\` page fetches from the root. No key is luckier than any other; the cost of a lookup is a constant you can quote in an SLA.

And here is the contract itself, because lab 02 grades it verbatim — three promises:

1. **Every leaf sits at the same depth.** Balance is not a hope or an average; it is a structural fact.
2. **Every non-root node is at least half full.** Occupancy has a floor, and the floor is what makes the height guarantee a proof instead of a vibe (T2.L2 does the math).
3. **Every separator tells the truth.** In an internal node, \`keys[i]\` is *the smallest key reachable through \`children[i+1]\`*. A separator is a signpost, not a record — it owns no data, it only points. Break that law once and lookups don't crash; they go silently wrong, which is worse.`,
    },
    {
      type: 'code',
      filename: 'the signpost law, as descent',
      lang: 'rust',
      code: `// one level of the descent — tree.rs hands you this exact hint
let c = node.keys.partition_point(|&s| s <= key);
let next = node.children[c];   // separators <= key sit left of the child we want

// separators [10 | 30 | 50], looking for 30:
// partition_point counts the separators <= 30 → 2 → children[2]
// a separator is a COPY of its right subtree's smallest key,
// so equality always descends right. children.len() == keys.len() + 1, always.`,
      chips: ['ties go right', 'no records above the leaves'],
    },
    {
      type: 'diagram',
      caption: 'fig 1 — the anatomy: signposts above, records below, scans sideways',
      height: 52,
      nodes: [
        { id: 'root', x: 33, y: 2, w: 34, h: 10, label: 'root — internal page', sub: '[ 50 ]', color: '#FBBF24' },
        { id: 'il', x: 6, y: 18, w: 36, h: 10, label: 'internal page', sub: '[ 10 | 30 ]', color: '#5CA8FF' },
        { id: 'ir', x: 58, y: 18, w: 36, h: 10, label: 'internal page', sub: '[ 70 ]', color: '#5CA8FF' },
        { id: 'l0', x: 1, y: 36, w: 17, h: 10, label: 'leaf', sub: '3 · 7', color: '#3EF2A4' },
        { id: 'l1', x: 21.5, y: 36, w: 17, h: 10, label: 'leaf', sub: '10 · 20', color: '#3EF2A4' },
        { id: 'l2', x: 42, y: 36, w: 17, h: 10, label: 'leaf', sub: '30 · 44', color: '#3EF2A4' },
        { id: 'l3', x: 62.5, y: 36, w: 17, h: 10, label: 'leaf', sub: '50 · 66', color: '#3EF2A4' },
        { id: 'l4', x: 83, y: 36, w: 17, h: 10, label: 'leaf', sub: '70 · 88', color: '#3EF2A4' },
      ],
      edges: [
        { from: 'root', to: 'il' },
        { from: 'root', to: 'ir' },
        { from: 'il', to: 'l0' },
        { from: 'il', to: 'l1' },
        { from: 'il', to: 'l2' },
        { from: 'ir', to: 'l3' },
        { from: 'ir', to: 'l4' },
        { from: 'l0', to: 'l1', label: 'next' },
        { from: 'l1', to: 'l2' },
        { from: 'l2', to: 'l3' },
        { from: 'l3', to: 'l4' },
      ],
      steps: [
        { caption: 'The contract on one canvas: internal pages hold only separators — keys with child pointers, no records. Every record lives in a leaf; every leaf sits at the same depth; the leaves are linked left → right. That chain is the scan spine.', active: ['root', 'il', 'ir', 'l0', 'l1', 'l2', 'l3', 'l4'] },
        { caption: 'get(44): the root\'s only separator is 50, and 44 < 50 — descend left. On [10, 30], partition_point(separators ≤ 44) = 2, so the third child. Each level is one page and one binary search inside it.', active: ['root', 'il', 'l2'], edges: ['root->il', 'il->l2'] },
        { caption: 'get(50): 50 ≥ 50 — ties go right, because a separator is a copy of its right subtree\'s smallest key. Equality always descends to children[i+1].', active: ['root', 'ir', 'l3'], edges: ['root->ir', 'ir->l3'] },
        { caption: 'scan(20, 70): descend once to the leaf that would hold 20, then walk the next chain until a key exceeds 70. One descent, then pure sideways motion — the internal pages are never touched again.', active: ['il', 'l1', 'l2', 'l3'], edges: ['il->l1', 'l1->l2', 'l2->l3'] },
        { caption: 'What you actually pay on disk: with ~500-way fanout the root and the next level are a few hundred pages — the buffer pool pins them. A point lookup is one or two real I/Os: the leaf, then the heap page the leaf entry points at.', active: ['root', 'il', 'ir'] },
      ],
    },
    {
      type: 'prose',
      md: `## Fanout arithmetic

Run the numbers at production scale. A 100-byte row packs ~80 per 8KB leaf page; an 8-byte key plus child pointer and slot overhead runs ~16 bytes, so an internal page carries **~500 separators**. Now multiply:

- height 1 (root is a leaf): ~80 records
- height 2: 500 × 80 = 40,000
- height 3: 500² × 80 = 20,000,000
- height 4: 500³ × 80 = ten billion

**Ten million rows sit three levels down.** And the top of the tree is tiny: the root plus the 500 pages of level 2 is about 4MB — the buffer pool holds it without being asked. So of the three fetches in a point lookup, the first two are RAM hits; the disk sees the leaf and the heap page. That is the "two, maybe three I/Os" behind every \`WHERE id = ?\` you have ever run.

Lab 02 pins the same arithmetic at toy scale so the checks can prove balance instead of hoping: \`LEAF_MAX = 32\` records, \`INTERNAL_MAX = 32\` separators (33 children). Height 2 caps at 32 × 33 = 1,056 records; height 3 at 34,848; height 4 past a million. The harness's own \`expected_height\` does exactly this multiplication — at 2,048 ascending keys it demands **exactly 3 levels**, and an extra level is a balance bug, not bad luck.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '~500', label: 'separators per 8KB internal page', hint: 'The fanout. An 8-byte key + child pointer + slot overhead ≈ 16 B per signpost. Binary trees dream of this.' },
        { value: '~80', label: 'records per 8KB leaf', hint: '~100-byte rows at T0\'s arithmetic. The leaf is lab 01\'s slotted page wearing an index hat.' },
        { value: '3', label: 'levels for 10M rows', hint: '80 → 40K → 20M. The fourth level carries you past a billion rows.' },
        { value: '1–2', label: 'real I/Os per point lookup', hint: 'The top levels are pinned in the buffer pool. You pay for the leaf and the heap page.' },
      ],
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `Your CPU queries a tree built to this spec on every memory access. The x86-64 page table is a 4-level tree of 4KB nodes, each holding exactly 512 eight-byte entries, rooted at CR3 — page-sized nodes, fanout in the hundreds, fixed-depth log descent. Two honest differences: it descends by *bit-slice* (9 address bits per level) instead of by comparison, which makes it a radix tree; and it is born full height, whereas your B+tree starts as one leaf and grows only at the root. But the shape that won on disk and the shape that won in the MMU are the same shape: wide, shallow, page-granular.`,
    },
    {
      type: 'prose',
      md: `## Lab 02: you build this

Lab 02 (btree) hands you \`src/tree.rs\` — the only file you edit — and a B+tree over i64 keys in an arena addressed by \`NodeId\`. One expectation to set: the course narrative hangs this tree on lab 01's pages, but the grading surface is the tree's *logical* invariants, so nodes are plain structs in a \`Vec<Option<Node>>\` arena. The node ids you hand out are lab 03's page ids in waiting. Ops: \`insert\` (an **upsert** — existing key overwrites, \`len\` does not move), \`get\`, \`scan\`, \`delete\`, \`len\`, \`height\` — and \`validate()\`, your own invariant checker, which is itself graded. Five checks:

- **lookup_correct** — a hand-written edge set (\`i64::MIN\`, \`i64::MAX\`, −1, 0, 1) plus 400 seeded upserts over a 300-key band: every key returns its *latest* value, and never-written keys — inside the band and far outside it — return \`None\`. An upsert that bumps \`len\` fails here.
- **ordered_scans** — the full scan equals the sorted model snapshot exactly; a dozen seeded ranges match with *both ends inclusive*; a point range returns exactly one record; inverted ranges (\`lo > hi\`) return empty — never a panic.
- **split_balance** — 2,048 ascending inserts, the auto-increment primary key that haunts production, must land at exactly 3 levels with every non-root node at least half full. Your \`validate()\` and the harness's independent walk must agree.
- **adversarial_orders** — three fresh trees: 2,000 descending inserts (leftmost-path splits, a new tree minimum on every insert), a zipf-skewed write storm into a tiny hot range, and the same 50 keys written 40 times (last write wins; \`len == 50\`).
- **storm** — 3,000 seeded ops: ~55% inserts, ~30% deletes of live and absent keys, ~15% point lookups asserted inline. \`validate()\` and the audit fire mid-storm; then the reckoning — full-scan equality, every point lookup, exact \`len\`.

Hold the separator law in your head while you code, because the storm proves it a thousand times: \`keys[i]\` === the smallest key reachable through \`children[i+1]\`, and \`children.len() == keys.len() + 1\`, always. The harness audits invariants instead of trusting your tests — phantoms and stale signposts are corruption, not style violations.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Why does a B+tree keep every record in the leaves instead of storing some in internal pages, the way the original B-tree does?',
          options: [
            'So that records stay sorted by primary key within each page',
            'So deletes never have to touch internal nodes',
            'Internal pages free of payload pack ~500 routing separators into 8KB — fanout goes up, the tree gets shallower, every lookup costs exactly height fetches, and the linked leaves make range scans a sideways walk',
            'Because records are too large to fit next to child pointers',
          ],
          correct: [2],
          explanation:
            'The plus is fanout plus scans. A separator is ~16 bytes; a record is ~100. Routing pages that hold only signposts make the tree three levels deep at 10M rows, and the leaf chain turns ranges into one descent plus a sideways walk. Uniform height also makes lookup cost a constant, not a distribution.',
        },
        {
          q: 'An internal node holds separators [10, 30, 50]. A lookup for key 30 descends to which child?',
          options: [
            'children[1] — key 30 matches separator index 1',
            'children[2] — two separators are ≤ 30, and a separator is a copy of its right subtree\'s smallest key, so equality always descends right',
            'children[3] — the largest separator wins ties',
            'Either children[1] or children[2] — both subtrees may contain 30',
          ],
          correct: [1],
          explanation:
            'partition_point(|&s| s <= 30) over [10, 30, 50] is 2. The law keys[i] = min(children[i+1]) means a key equal to a separator lives in the subtree to that separator\'s right — never the left. Get the tie direction wrong and every exact-match lookup on a separator key silently misses.',
        },
        {
          q: 'A table holds 10M rows of ~100 bytes (~80 per 8KB leaf), with ~500-way fanout. What does a point lookup cost, and why is the real number lower than the worst case?',
          options: [
            '~24 page fetches — the depth of a balanced binary search',
            '125,000 page fetches — one per leaf page, halved on average',
            '3 tree fetches (80 → 40K → 20M covers 10M) plus 1 heap fetch; the root and next level are ~4MB and live in the buffer pool, so the disk usually sees only the leaf and the heap page',
            '500 fetches — one per separator on the descent path',
          ],
          correct: [2],
          explanation:
            'Height is log base fanout: 3 levels at 10M rows. The tree\'s top is tiny and hot — the buffer pool pins it — so the quoted worst case (height + heap) and the common case (leaf + heap page, both from disk) differ by exactly the cached levels.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: fifty years of the same tree',
      md: `Read the people who own the format. Postgres's nbtree README (\`src/backend/access/nbtree/README\`) is the best written tour of a production B+tree — page layout, the high-key fence that makes concurrent descent safe (cashed in T2.L6), and a deletion policy far lazier than any textbook admits. Alex Petrov's *Database Internals* (O'Reilly, 2019) chapter 2 is the cleanest taxonomy of the B-tree family, and the two B+tree lectures of **CMU 15-445** (Andy Pavlo, free on YouTube) walk the same descent you just wrote, at whiteboard speed. For lineage: Bayer & McCreight, "Organization and Maintenance of Large Ordered Indices" (1972) is the founding paper, and Douglas Comer's 1979 survey "The Ubiquitous B-Tree" named the era you still live in. Then open \`tree.rs\` — the storm is the teacher now.`,
    },
  ],
}

export default lesson
