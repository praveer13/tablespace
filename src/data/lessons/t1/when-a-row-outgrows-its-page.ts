import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l3',
  slug: 'when-a-row-outgrows-its-page',
  trackId: 't1',
  index: 3,
  title: 'When a Row Outgrows Its Page',
  minutes: 12,
  hook: 'Overflow pages and the TOAST pattern: oversized values, out-of-line storage, compression, and the update that has to move.',
  exercise: 'read',
  blocks: [
    {
      type: 'prose',
      md: `Two facts you now hold are on a collision course. Fact one, from T1.L1: a tuple lives entirely inside one 8192-byte page — rows do not span pages, ever. Fact two, from your production database right now: somebody is storing a 1 MB JSON document in a \`jsonb\` column, and Postgres accepted it without complaint. Both facts are true, and the machinery that reconciles them is one of the most quietly load-bearing subsystems in the engine: **TOAST** — The Oversized-Attribute Storage Technique. You will never name it in a migration. It runs under every wide row you have ever inserted.`,
    },
    {
      type: 'prose',
      md: `## The TOAST move: compress, then out-of-line

The trigger is roughly **2032 bytes**. When an inserted or updated tuple would exceed that threshold, the toaster goes to work — and it works **per column**, not per row, and only on columns whose types allow it (variable-length types like \`text\`, \`bytea\`, \`jsonb\`; your \`BIGINT\` is never a candidate). Two moves, always in this order:

1. **Compress in place.** The oversized value is compressed (pglz) and kept inline if that gets the tuple under the wire. Compression is tried first because it is the cheap move: CPU cycles instead of extra I/O, and the value stays on the row's own page where a fetch already has it.
2. **Out-of-line.** Still too big? The value is sliced into chunks of ~1996 bytes and written to the table's hidden **toast table** — a real heap table of its own (\`pg_toast.pg_toast_<oid>\`), with an index on \`(chunk_id, chunk_seq)\`. The main tuple keeps an **18-byte external pointer**: which toast table, which value id, the raw and compressed sizes. Read the column and the engine follows the pointer, walks the index, and glues the chunks back together (detoast) — invisibly to your query.

A row can hold several toasted columns, each with its own pointer. The threshold is a *target*: the toaster compresses and externalizes the widest columns one at a time until the tuple fits — which is why a 1 MB JSON sits comfortably next to an 8-byte \`id\` in a row whose on-page footprint is a few dozen bytes.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — a toasted row',
      height: 48,
      nodes: [
        { id: 'row', x: 4, y: 6, w: 26, h: 10, label: 'main tuple', sub: 'inline cols + 18 B ptr', color: '#3EF2A4' },
        { id: 'ptr', x: 8, y: 26, w: 18, h: 8, label: '18 B pointer', sub: 'toastrelid · valueid', color: '#FBBF24' },
        { id: 'toast', x: 52, y: 6, w: 40, h: 10, label: 'toast table', sub: 'a hidden heap table + index', color: '#5CA8FF' },
        { id: 'c1', x: 36, y: 30, w: 18, h: 8, label: 'chunk 0', sub: '≤ 1996 B', color: '#A78BFA' },
        { id: 'c2', x: 58, y: 30, w: 18, h: 8, label: 'chunk 1', sub: '≤ 1996 B', color: '#A78BFA' },
        { id: 'c3', x: 80, y: 30, w: 18, h: 8, label: 'chunk 2', sub: 'remainder', color: '#A78BFA' },
      ],
      edges: [
        { from: 'ptr', to: 'toast', label: 'followed only on access' },
        { from: 'toast', to: 'c1', label: '(chunk_id, chunk_seq)' },
        { from: 'toast', to: 'c2' },
        { from: 'toast', to: 'c3' },
      ],
      steps: [
        { caption: 'The row is over the ~2 KB threshold. The toaster considers only the oversized variable-length columns — the rest of the row stays put.', active: ['row'] },
        { caption: 'First move: compress in place. If the compressed value gets the tuple under the target, nothing leaves the page.', active: ['row'] },
        { caption: 'Still too big: the value is sliced into ~2 KB chunks in the toast table, indexed by (chunk_id, chunk_seq). The main tuple keeps an 18-byte pointer — and scans that never read the column never follow it.', active: ['ptr', 'toast', 'c1', 'c2', 'c3'], edges: ['ptr->toast', 'toast->c1', 'toast->c2', 'toast->c3'] },
      ],
    },
    {
      type: 'statline',
      stats: [
        { value: '8192 B', label: 'the hard ceiling', hint: 'A heap tuple must fit in one page; rows never span pages.' },
        { value: '2032 B', label: 'toast trigger', hint: 'TOAST_TUPLE_THRESHOLD — the tuple-size target that wakes the toaster.' },
        { value: '18 B', label: 'external pointer', hint: 'What the main tuple keeps: toast table oid, value id, raw and compressed sizes.' },
        { value: '1996 B', label: 'per chunk', hint: 'TOAST_MAX_CHUNK_SIZE — the slice width in the toast table.' },
      ],
    },
    {
      type: 'callout',
      variant: 'analogy',
      md: `You have built TOAST by hand, probably more than once: "put the blob in S3, store the key in the row." The database automated that exact architecture — pointer inline, payload in a side store, reassembly on read — and made two improvements your version didn't have: it decides **per column** instead of per table, and it tries **compression before indirection**. There is no controller to write, no consistency bug between row and blob to ship. The toast table and its index are maintained, vacuumed, and crash-recovered by the same machinery as every other page.`,
    },
    {
      type: 'prose',
      md: `## Transparent to scans, painful to random access

The design's best property is laziness: **nothing touches toast pages until the column is actually read** — projected into the result, filtered on, or passed to a function. A sequential scan that selects the narrow columns of a JSON-heavy table never pays for the JSON; the pointer rides along unread, 18 bytes of inert metadata. This is why "just add a jsonb column" so often *doesn't* tank your scan performance, and why the advice to fear wide rows needs the qualifier "wide in the columns you actually touch."

The flip side is random access. Fetch 1000 rows *with* the toasted column and each one is a pointer chase: an index probe into the toast table plus a chunk read per ~2 KB of payload. A 1 MB value is ~500 chunks behind one pointer. Your ORM's \`select(*)\` habit turns one indexed lookup into hundreds of extra page reads per row — and functions on the value (JSON path queries, \`substr\` past the compression boundary) pay decompression or detoast on *every call*. Toasted values are for payload you retrieve whole and rarely; they are not for data you compute over.`,
    },
    {
      type: 'prose',
      md: `## The update that has to move

TOAST handles values that outgrow a page at birth. The harder case is the row that outgrows its page *later*. An update in an MVCC engine is physically a new tuple version (the old one is marked dead — T1.L4 and T4 own that story), and the new version must land somewhere. If it grew and no longer fits back on its page, it **moves to another page** — and inherits a brand-new (page, slot). Remember who stores that address: *every index on the table*. A row move means one heap write plus a new entry in every index, each a page write of its own. One logical UPDATE, half a dozen dirty pages. That is write amplification you can measure.

Postgres's escape hatch is the **HOT update** (heap-only tuple): if no *indexed* column changed and the new version fits on the **same page**, the indexes are left untouched — the old slot becomes a same-page forwarding address (\`LP_REDIRECT\`, the fourth line-pointer state from T1.L1) pointing at the new line pointer, and the chain is pruned later. This is T1.L1's whole argument, completed: movement *within* a page is invisible to the world behind the slot handle; movement *across* pages is a new address every index must learn. Two practical corollaries: leave headroom on hot pages (that is what \`fillfactor\` is for), and know that updating an indexed column forfeits HOT even when the row stays put. One mercy: an update that doesn't touch the toasted value keeps the same toast pointer — the new tuple version points at the existing chunks, no rewrite.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'You insert a row whose jsonb column holds 1 MB. What does the engine do?',
          options: [
            'Rejects the insert — a tuple may not exceed one page',
            'Stores the whole row on a chain of overflow pages, starting at the row’s own page',
            'Tries to compress the big column inline; if the tuple is still over the ~2 KB target, slices the value into ~2 KB chunks in a hidden toast table and keeps an 18-byte pointer in the main tuple',
            'Moves the entire row, all columns, into the toast table',
          ],
          correct: [2],
          explanation:
            'Per column, compression first (CPU is cheaper than I/O), out-of-line second. Only the oversized variable-length columns are candidates — the rest of the row never moves, and rows themselves never span pages.',
        },
        {
          q: 'A seq scan over a heavily toasted table selects only narrow columns (id, created_at). The toast pages are…',
          options: [
            'Read anyway — a scan reads every page of the relation',
            'Never touched — detoast is lazy; the 18-byte pointers ride along unread until some query actually accesses the column',
            'Read, but from a separate toast buffer pool',
            'Skipped only when an index covers the query',
          ],
          correct: [1],
          explanation:
            'The toast table is a separate heap; nothing reads it until a column value is demanded. That laziness is why wide JSON columns coexist with fast narrow scans — and why select(*) is the footgun that turns it off.',
        },
        {
          q: 'An UPDATE makes a row grow past what its page can hold. The consequence for indexes is…',
          options: [
            'None — the slot handle keeps indexes valid across the move',
            'The new version lands on another page with a new (page, slot), so every index on the table gains a new entry — one heap write plus one write per index',
            'Only the primary-key index is updated; secondary indexes follow the redirect',
            'The row is toasted automatically so it fits and no index changes',
          ],
          correct: [1],
          explanation:
            'Slots hide movement within a page, not across pages: a cross-page move is a new ctid, and ctids are what indexes store. The HOT optimization (same page + no indexed column changed) is the only case where indexes are left alone — via an in-page LP_REDIRECT.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: watch the toaster work',
      md: `This subsystem is unusually inspectable. Create a table with a \`text\` column, insert a 100 KB string, then find its toast table: \`SELECT reltoastrelid::regclass FROM pg_class WHERE relname = 'your_table'\` — and query the chunks directly (\`chunk_id\`, \`chunk_seq\`, \`length(chunk_data)\`). The PG docs chapter "Database Physical Storage" has the canonical TOAST section; the implementation is \`src/backend/access/table/tuptoaster.c\`, and the 18-byte pointer is \`varatt_external\` in \`src/include/varatt.h\`. For the update-that-moves, \`src/backend/access/heap/README.HOT\` is a superb design doc on the redirect machinery and its vacuum interaction. Storage knobs when you're ready: column \`STORAGE\` attributes (\`PLAIN\`/\`EXTENDED\`/\`EXTERNAL\`/\`MAIN\`) let you forbid or force toasting per column — useful the day someone toasts a column you filter on.`,
    },
  ],
}

export default lesson
