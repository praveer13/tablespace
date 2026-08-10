import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l1',
  slug: 'anatomy-of-a-page',
  trackId: 't1',
  index: 1,
  title: 'Anatomy of a Page',
  minutes: 16,
  hook: 'Header, slot array, records growing the other way: the slotted-page layout that lets rows move without breaking every index. Then you build one — lab 01.',
  exercise: 'code',
  blocks: [
    {
      type: 'prose',
      md: `T0 left you with the page as the unit of everything: reads fetch pages, writes dirty pages, the buffer pool caches pages. Now open one. An 8192-byte heap page is not a blob the engine rummages through — it is a **tiny memory allocator**, running malloc and free inside a fixed arena, with one brutal constraint the JVM never faces: **all of its bookkeeping must live in the page's own bytes.** No side tables, no heap shadows. When lab 03 writes this page to disk, whatever is not in the 8192 bytes does not exist.

The layout that every row-store engine converged on is the **slotted page**: a header up front, a directory of slots growing one way, record bytes growing the other way, and free space in the middle. Lab 01 hands you exactly this design — so learn it at byte precision, because the grader counts at byte precision.`,
    },
    {
      type: 'prose',
      md: `## The layout, byte by byte

Draw the page with byte 0 at the top and byte 8192 at the bottom. All integers are little-endian. This is lab 01's exact contract — the same numbers the harness checks:

- **\`[0,2)\` slot_count, u16** — how many slots exist in the array, live *and* dead. Deleting a record never shrinks this.
- **\`[2,4)\` records_start, u16** — the record area is \`[records_start, 8192)\`. Fresh page: 8192, an empty range at the very bottom.
- **\`[4,6)\` dead_bytes, u16** — record bytes marked dead, awaiting defrag. Freed in the accounting, not yet in the layout.
- **\`[6,8)\` reserved, u16** — keep 0; later labs spend these bytes on page type and LSN.

Then the two growth fronts, meeting in the middle:

- **Slot array** starts at byte 8 and grows *down* the picture (toward higher addresses): slot \`i\` sits at \`8 + i*6\`, six bytes as \`[offset u16][len u16][flags u16]\`, with flags bit 0 = \`LIVE\`.
- **Record bytes** grow *up* the picture from byte 8192 (toward lower addresses): an insert copies the record to \`[records_start − len, records_start)\` and drops \`records_start\`.

The contiguous free region is whatever is left between them: \`[8 + slot_count*6, records_start)\`. An insert that needs \`len\` record bytes plus one fresh 6-byte slot asks the middle for \`len + 6\`. A fresh page answers \`free_space() = 8192 − 8 = 8184\`.`,
    },
    {
      type: 'code',
      filename: 'the lab 01 page, at birth',
      lang: 'text',
      code: `byte 0   ┌──────────────────────────────┐
         │ slot_count    u16   = 0      │  header: 8 bytes,
byte 2   │ records_start u16   = 8192   │  the only fields
byte 4   │ dead_bytes    u16   = 0      │  you may keep
byte 6   │ reserved      u16   = 0      │
byte 8   ├──────────────────────────────┤
         │  slot array grows down  ↓    │  6 B/slot:
         │  [offset][len][flags]        │  flags bit 0 = LIVE
         │                              │
         │      contiguous free         │  free_space()
         │        = 8184 bytes          │  at birth
         │                              │
         │  ↑  record bytes grow up     │
         │     from byte 8192           │
byte8192 └──────────────────────────────┘`,
      chips: ['8192 B arena', '0 side tables'],
    },
    {
      type: 'prose',
      md: `## Why the indirection

Notice what the slot buys. The outside world — every index, every \`ctid\`, every foreign pointer — refers to a row as **(page, slot)**. Not a byte offset: a *slot number*. The slot is a stable handle; the record it points at is a moveable payload. When defrag slides a record from \`[7020, 7120)\` to \`[8092, 8192)\`, exactly one thing changes on disk: the \`offset\` field inside slot \`i\`. The handle \`(7, 3)\` still works. Every index that stores it never notices.

The alternative is unbuildable. If indexes stored physical byte offsets, then defrag — or any update that shifts a row — would invalidate *every index entry for every moved row*, across the whole table, in structures that live on other pages you would now have to find and rewrite. The slot array is a one-entry-per-row handle table that makes all of that someone else's problem. Cost: 6 bytes per row (4 in real Postgres). That is the cheapest insurance in the engine.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `You already own this pattern twice over. A **file descriptor** is a slot id: an int that stays stable while the kernel moves, buffers, or re-points the thing behind it. And the contrast case is your **compacting GC**: the JVM solves "objects must move" by stopping the world and rewriting every reference in the heap — possible because all the references are in memory. The database's references live in indexes, on *other pages, on disk*. It cannot rewrite the world, so it interposes a handle and never rewrites anything but the handle's contents.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — insert, delete, defrag on one page',
      height: 62,
      nodes: [
        { id: 'op', x: 4, y: 26, w: 16, h: 10, label: 'op', sub: 'insert / delete', color: '#FBBF24' },
        { id: 'idx', x: 4, y: 44, w: 16, h: 9, label: 'index', sub: 'stores (page, slot)', color: '#5CA8FF' },
        { id: 'hdr', x: 34, y: 4, w: 46, h: 9, label: 'header · 8 B', sub: 'slot_count · records_start · dead_bytes', color: '#3EF2A4' },
        { id: 'slots', x: 34, y: 16, w: 46, h: 9, label: 'slot array', sub: 'grows down ↓ · 6 B per slot', color: '#5CA8FF' },
        { id: 'free', x: 34, y: 28, w: 46, h: 9, label: 'contiguous free', sub: 'the middle funds every insert', color: '#94A3B8' },
        { id: 'dead', x: 34, y: 40, w: 46, h: 9, label: 'dead bytes', sub: 'accounting-only until defrag', color: '#A78BFA' },
        { id: 'recs', x: 34, y: 52, w: 46, h: 9, label: 'record area', sub: '↑ grows up from byte 8192', color: '#3EF2A4' },
      ],
      edges: [
        { from: 'op', to: 'hdr', label: 'bump counters' },
        { from: 'op', to: 'slots', label: 'append or reuse slot' },
        { from: 'op', to: 'recs', label: 'copy record bytes' },
        { from: 'idx', to: 'slots', label: '(page, slot) survives it all' },
      ],
      steps: [
        { caption: 'A fresh page: slot_count 0, records_start 8192, dead_bytes 0. free_space() = 8184, all of it contiguous middle.', active: ['hdr', 'free'] },
        { caption: 'insert(100): claim 6 B for slot 0 plus 100 B for the record, both from the middle. Slot 0 = (offset 8092, len 100, LIVE); records_start drops to 8092.', active: ['op', 'slots', 'recs', 'free'], edges: ['op->slots', 'op->recs'] },
        { caption: 'insert(200): slot 1 appended, record lands at [7892, 8092). The middle shrinks from both ends: 6 B on top, 200 B below.', active: ['op', 'slots', 'recs'], edges: ['op->slots', 'op->recs'] },
        { caption: 'delete(slot 0): clear the LIVE bit, dead_bytes += 100. The bytes stay put — free_space() rises by 100, but the contiguous region does not move.', active: ['op', 'hdr', 'dead'], edges: ['op->hdr'] },
        { caption: 'insert(50): slot 0 is a tombstone — reuse it (lowest tombstone first) and pay no slot bytes. The 50 record bytes still come from the contiguous region alone; dead space is not allocatable yet.', active: ['op', 'slots', 'dead'], edges: ['op->slots', 'op->recs'] },
        { caption: 'defrag: live records slide back against byte 8192, slot offsets are rewritten, dead_bytes zeroed. Live slot ids never change — the index never notices.', active: ['recs', 'slots', 'idx', 'hdr'], edges: ['idx->slots'] },
      ],
    },
    {
      type: 'prose',
      md: `## The slot's tiny state machine

A slot in lab 01 is one flag bit, but it already walks the real state machine:

1. **Unused → live.** Insert appends a slot (or revives a tombstone) and sets \`LIVE\`. Reads return the exact bytes.
2. **Live → dead (tombstone).** Delete clears \`LIVE\`, adds \`len\` to \`dead_bytes\`, done. The record's bytes stay exactly where they were; reads now return \`None\`. This is two facts at once: the *accounting* frees immediately, the *bytes* wait for defrag.
3. **Dead → live (reuse).** The next insert that needs a slot takes the **lowest** tombstone instead of appending — it claims zero slot bytes from the middle, only record bytes.
4. **Dead bytes → contiguous (defrag).** \`defrag()\` slides the live records back against byte 8192, rewrites their slot offsets, and zeroes \`dead_bytes\`. Tombstones **stay in the array** — removing them would shift every live slot number above them, and stable ids are the whole point. One escape hatch: with zero live records, nothing outside the page can point into it, so defrag resets the page to mint condition.

Production Postgres runs the same machine with four line-pointer states instead of one bit: \`LP_UNUSED\`, \`LP_NORMAL\`, \`LP_REDIRECT\`, \`LP_DEAD\`. The redirect state is a forwarding address *within* the page — it exists for the update-that-moves-in-place trick you will meet in T1.L3. Lab 01 keeps one bit; the design gene is identical.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '8192', label: 'bytes, the whole arena', hint: 'One page, one allocation size, one unit of I/O — T0’s contract.' },
        { value: '8 B', label: 'header', hint: 'slot_count + records_start + dead_bytes + reserved. The entire permitted bookkeeping.' },
        { value: '6 B', label: 'per slot', hint: 'offset + len + flags. The handle that lets records move.' },
        { value: '8184', label: 'free_space() at birth', hint: '8192 − 8 header. The storm check demands this exact number again at the end.' },
      ],
    },
    {
      type: 'prose',
      md: `## Lab 01: you build this

Lab 01 (slotted-pages) hands you \`src/page.rs\` — the only file you edit — and a \`Page\` struct that must be *literally* one \`[u8; 8192]\` buffer. The harness opens with \`size_of::<Page>() == PAGE_SIZE\`: if your state does not fit in the page, it does not exist. Lab 02 will hang a B+tree on these pages; lab 03 will write them to disk. The ops: \`insert\`, \`read\`, \`delete\`, \`defrag\`, \`free_space\`, plus \`slot_range\`, the checker's window into your layout. Five checks grade it:

- **insert_read** — records of many sizes round-trip byte-exact; a full page refuses with \`None\` (no panic, and a refused insert changes *nothing*); 0-byte records are refused.
- **no_overlap** — a 150-op mix of inserts/deletes/defrags, then every pair of live records must occupy disjoint byte ranges, all still reading back exactly.
- **freespace_accounting** — a scripted walk of every accounting branch; after **every single op**, \`free_space()\` must equal the harness's reference books, to the byte. Off by +n: you promised bytes you do not have. Off by −n: a leak.
- **delete_reuse** — fill the page, delete half, prove a 512 B record is *refused* while the space is dead-but-not-defragged, then prove defrag makes it fit — survivors byte-exact.
- **storm** — 2000 seeded ops against a reference model. Then every record is deleted, one defrag runs, and the page must report exactly 8184 free: the leak check.

The invariant to hold in your head while you code, because the storm proves it two thousand times:

\`8192 = 8 header + 6·slot_count + live record bytes + dead_bytes + contiguous\`

and no two live records' byte ranges ever intersect. \`free_space()\` is contiguous + dead_bytes, and it is a number you **maintain from the header fields on each op — never a scan**. Accounting is data.`,
    },
    {
      type: 'lab',
      lab: 'page-surgery',
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'Defrag slides a live record from [7020, 7120) to [8092, 8192). What happens to the index entries pointing at that row?',
          options: [
            'They are rewritten to the new byte offset during defrag',
            'Nothing — indexes store (page, slot), and defrag only rewrites the offset inside the slot; the handle and what it reads are unchanged',
            'They are marked LP_DEAD and rebuilt lazily on next lookup',
            'Defrag is forbidden on pages referenced by an index',
          ],
          correct: [1],
          explanation:
            'The slot array exists precisely so this is a non-event. (page, slot) is a stable handle; the offset behind it is page-private. Indexes on other pages never observe intra-page movement.',
        },
        {
          q: 'A page has 500 contiguous free bytes and 200 dead bytes. A 200 B record was just deleted. You now insert a 300 B record. What happens?',
          options: [
            'Refused — the free space is fragmented, so defrag runs first',
            'It succeeds, consuming 100 of the 200 dead bytes',
            'It succeeds — the delete left a tombstone, so the insert reuses it and claims only its 300 record bytes from the contiguous region; the 200 dead bytes wait for defrag',
            'It succeeds, appending a new slot and claiming 306 contiguous bytes',
          ],
          correct: [2],
          explanation:
            'Two rules meet here: a tombstone exists, so no 6 B slot charge (reuse the lowest one), and dead space is accounting-only — insert draws from the contiguous region alone. 300 ≤ 500 fits.',
        },
        {
          q: 'free_space() returns 1000, yet inserting a 900 B record returns None even though a tombstone exists (no slot charge needed). Is the page lying?',
          options: [
            'Yes — free_space() must never report bytes an insert cannot use',
            'No — free_space() is contiguous + dead_bytes; 900 of those 1000 are dead bytes awaiting defrag, and only the 100 contiguous bytes fund inserts',
            'No — the record also needs 6 slot bytes, and 906 > 1000',
            'Yes — a correct page defrags automatically when contiguous space runs low',
          ],
          correct: [1],
          explanation:
            'free_space() counts every byte that is not a live record or a slot — including dead bytes. That is deliberate: it tells you what defrag would reclaim. The insert fitness test reads contiguous space alone, and lab 01 grades both numbers separately.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the real thing',
      md: `Hold lab 01's page next to Postgres's: \`src/include/storage/bufpage.h\` (\`PageHeaderData\` — a 24-byte header carrying free-space bounds and LSN) and \`src/include/storage/itemid.h\` (\`ItemIdData\` — the 4-byte line pointer packing \`lp_off\`, \`lp_flags\`, \`lp_len\` into 32 bits with the four states above). The lab's 8-byte header and 6-byte slot are the same design with the fields you don't need yet stripped out. Then: the interdb.jp *Internals of PostgreSQL* chapter 1 walkthrough of a heap file's layout is the best free page-by-page tour, and Alex Petrov's *Database Internals* (O'Reilly, 2019) chapter 3 covers slotted pages across engines — including the sibling design this course omits: cells and un-grouped slots in SQLite. Now go write \`page.rs\`; the storm is waiting.`,
    },
  ],
}

export default lesson
