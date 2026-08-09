import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't0.l1',
  slug: 'everything-is-a-page',
  trackId: 't0',
  index: 1,
  title: 'Everything Is a Page',
  minutes: 16,
  hook: 'The atom of database storage: why engines read and write fixed-size pages, what 8KB buys you, and why "just read one row" is never one row.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Run \`SELECT * FROM users WHERE id = 42\` against a cold cache. The row that comes back is maybe a hundred bytes. The disk was asked for **8,192**. Nothing is broken — that gap is the design. **The engine never reads rows; it reads the page the row lives on**, pulls the whole thing into memory, and only then dissects it to find your tuple inside. A row is not something the storage layer can see. A row is an interpretation of bytes inside a page.

Everything above storage — indexes, joins, the planner — is machinery for fetching *fewer pages*. Everything at storage level — the file layout, the buffer pool, the WAL — is organized around this one fixed-size unit. This lesson is about the unit: why fixed, why 8KB, and why one size everywhere is the architecture, not a limitation.`,
    },
    {
      type: 'prose',
      md: `## The fixed-size decision

Start with the file. A Postgres table is a file (a sequence of 1GB segment files, to be exact) treated as an **array of pages**: page N lives at byte offset \`N × 8192\`, full stop. Reading page 47 is one \`pread(fd, buf, 8192, 47 * 8192)\`. No extent lists, no variable-size allocation, no fragmentation *between* pages — allocation is arithmetic. You have seen this trick before: it is a slab allocator with exactly one size class. jemalloc's size classes, the kernel's \`kmem_cache\`, Netty's pooled \`ByteBuf\` arenas — one size class is what lets each of them allocate in O(1) without splintering memory.

One size buys three things at once:

- **One allocation unit.** A new page is an append to the file or a bit flipped in the free-space map. The file itself cannot fragment at the page level.
- **One I/O unit.** Every read and every write is a whole page. The engine never asks the kernel for 100 bytes; it asks for 8KB and owns the unpacking.
- **One caching unit.** The buffer pool (T0.L3) is an array of page-sized frames, so RAM doesn't fragment either.

Why 8KB and not 1KB or 1MB? Both directions cost you. Bigger pages amortize the fixed price of an I/O — one syscall, one seek on spinning rust, one DMA — over more rows, and make B+trees wider and shallower (T2). Smaller pages waste less: reading one row drags in less data you didn't want (read amplification), updating one row dirties fewer bytes (write amplification), and more distinct pages fit in the same RAM. 8KB was picked when a seek was 10ms and RAM was measured in megabytes — a fossil from a different hardware economy, frozen in place by on-disk compatibility. InnoDB picked 16KB; SQLite 4KB; SQL Server and Oracle 8KB. There is no right answer. There is a trade, made once, that everything downstream inherits.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '8KB', label: 'Postgres page (BLCKSZ)', hint: 'A compile-time constant. Your 100-byte row rides an 8KB read — it never crosses the disk boundary alone.' },
        { value: '16KB', label: 'InnoDB page', hint: 'innodb_page_size, fixed at cluster init. Twice the rows per I/O, twice the bytes dirtied per updated row.' },
        { value: '4KB', label: 'SQLite · x86 VM page', hint: 'SQLite defaults to 4,096 bytes — the same size your OS faults memory in. The isomorphism below is not subtle.' },
        { value: '~80', label: 'rows per 8KB page', hint: '8192 ÷ ~100 bytes of row plus overhead. "Fetch one row" reads eighty of them.' },
      ],
    },
    {
      type: 'prose',
      md: `## What's inside the 8KB (concept level)

A page is not a blob of rows; it is a small self-describing container. Three regions matter today:

- **The header** (24 bytes in Postgres): the page's identity, a checksum, pointers bounding the free space, and the **LSN** — the position in the write-ahead log of the last change made to this page. All of T3 is built on that one field.
- **The slot array** (line pointers), growing down from the header: one offset per record. This is the indirection layer, and it is what makes the rest of the design possible.
- **The records** — your tuples — growing up from the end of the page, with free space in the middle for both ends to grow into.

Why the slots? Because a row's durable address is **(page, slot)** — that is what an index entry stores (T2). If compaction slides a record to a new offset inside the page, only the slot updates; every pointer in every index stays valid. Indirection buys the freedom to rearrange the page's interior without asking anyone's permission — the same freedom your JVM gets when a copying GC moves an object and owns all the references, except here the fix-up is free, because nobody is allowed to hold an interior address in the first place.

Tuple headers, null bitmaps, what happens when a row outgrows its page — that is T1's job, in gory detail. Today you need the shape: header, slots, free middle, records.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — a page, conceptually (T1 draws it to scale)',
      height: 50,
      nodes: [
        { id: 'hdr', x: 8, y: 4, w: 84, h: 9, label: 'header — 24B', sub: 'page id · checksum · LSN · free-space bounds', color: '#22D3EE' },
        { id: 'slots', x: 8, y: 16, w: 84, h: 9, label: 'slot array ↓', sub: 'offsets to records — grows downward', color: '#3EF2A4' },
        { id: 'free', x: 8, y: 28, w: 84, h: 9, label: 'free space', sub: 'both ends grow into the middle', color: '#FBBF24' },
        { id: 'recs', x: 8, y: 40, w: 84, h: 9, label: 'records ↑', sub: 'your tuples, packed from the end upward', color: '#A78BFA' },
      ],
      edges: [
        { from: 'slots', to: 'recs', label: 'slot → offset' },
      ],
      steps: [
        { caption: 'The header is the page\'s passport: which page this is, whether it tore mid-write (checksum), and the LSN — the WAL position of its last change. Crash recovery (T3) trusts this field over the data file.', active: ['hdr'] },
        { caption: 'A row\'s address is (page, slot) — never a raw offset. Rearrange the page\'s interior, update one slot, and every index pointer on disk stays valid. Indirection is why compaction is cheap.', active: ['slots', 'recs'], edges: ['slots->recs'] },
        { caption: 'Inserts take from the middle; the page is full when the middle is gone, whatever the byte math says. Deleted rows leave their space behind until someone reclaims it — T1 and T4 both collect that debt.', active: ['free'] },
      ],
    },
    {
      type: 'prose',
      md: `## One size, everywhere

Follow one page through the engine and you have the course map. The executor asks for page 47; the **buffer pool** answers with a frame — page and frame are the same 8KB, one on disk, one in RAM. A transaction modifies the page in its frame; the page is now **dirty**. Before that dirty page may reach disk, the **WAL** record describing the change must be durable (T3 owns that protocol). A checkpoint later writes the page out, whole. The **planner** prices candidate plans in page fetches (T5): its cost constants are denominated in this unit. Even concurrency drops to page granularity in places — the latch protecting a page's interior is among the hottest locks in the engine (T4).

Because the unit never changes size, the whole engine is arrays and hash maps of same-sized things: the simplest memory architecture that exists, run in userspace, at terabyte scale. When T2 shows you a B+tree, notice the node size — one page. When T6 shows you a vector index, watch it fight to stay page-aligned. Everything in this course is a way to avoid fetching pages, avoid writing them, or fetch them in a better order.`,
    },
    {
      type: 'isomorphism',
      title: 'your OS ran this argument first',
      pairs: [
        {
          os: 'virtual memory page · 4KB',
          osLine: 'Your process never reads bytes from a file either — the MMU faults whole pages in and out, and your byte access is an interpretation of one.',
          llm: 'database page · 8KB',
          llmLine: 'The engine never reads rows — it fetches whole pages and interprets the bytes inside. Same trick, one floor up.',
        },
        {
          os: 'physical frame',
          osLine: 'RAM, from the kernel\'s side: an array of page-sized slots, plus the standing question of which page owns each slot.',
          llm: 'buffer-pool frame',
          llmLine: 'The same array, managed in userspace by the engine itself, holding heap pages. T0.L3 is the full tour.',
        },
        {
          os: 'page table',
          osLine: 'virtual → physical: the map from a page\'s identity to the frame currently holding it.',
          llm: 'the pool\'s page table',
          llmLine: 'Same map, different key: (file, page #) → frame, as a hash map. The name collision is honest — it is the same data structure.',
        },
        {
          os: 'dirty bit → writeback',
          osLine: 'A modified frame can\'t just be dropped; the kernel writes it back, on the kernel\'s schedule.',
          llm: 'dirty page → WAL first',
          llmLine: 'Same rule, one stricter law: the log record describing the change must be durable before the page may be flushed. T3 proves it.',
        },
      ],
    },
    {
      type: 'callout',
      variant: 'segfault',
      title: 'the torn page',
      md: `Your 8KB write is not atomic. The drive's atomic unit is a sector — 512 bytes, maybe 4KB — so a power cut mid-write can leave a page that is half old, half new: a **torn page**, and its checksum will (hopefully) catch it. Every serious engine has a specific mechanism for this hole: InnoDB keeps a **doublewrite buffer** (pages go to a contiguous staging area first, then to their real location); Postgres writes a **full-page image** into the WAL on the first touch after each checkpoint. File the asymmetry away: the page file is allowed to tear, the log is not — which is why T3 will tell you the log is the real database and the data files are a cache of it.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'You run SELECT * FROM users WHERE id = 42 on a cold cache and get one 100-byte row back. What did the storage layer actually read from disk?',
          options: [
            '100 bytes — just the row',
            'One 512-byte sector',
            'One page — 8KB in Postgres: the page is the I/O unit, and the row is dissected out of it in memory',
            'The whole 1GB table segment',
          ],
          correct: [2],
          explanation:
            'Page N lives at offset N×8192 and arrives in one pread of BLCKSZ bytes. This is read amplification, and it is why row locality matters: a hot row next to hot rows is nearly free; a hot row alone on a page costs 8KB per access. Clustering and covering indexes (T2) are storage-layout answers to exactly this.',
        },
        {
          q: 'Why do engines insist on one fixed page size for a given store?',
          options: [
            'The hardware requires exactly 8KB',
            'It makes checksumming possible',
            'B+trees cannot stay balanced otherwise',
            'One size = one addressing scheme (page N at N×size), one allocation class, one I/O unit, one frame size — no external fragmentation anywhere in the stack',
          ],
          correct: [3],
          explanation:
            'It is a slab allocator with one size class: allocation becomes arithmetic and nothing between pages can splinter. Variable-size extents would reintroduce free-lists and external fragmentation — the fight your malloc loses slowly all day, moved into your durability-critical file format.',
        },
        {
          q: 'What does the slot array buy the engine?',
          options: [
            'Indirection: rows are addressed as (page, slot), so records can be moved or compacted inside the page without breaking any pointer stored outside it',
            'Compression of small rows',
            'A sort order for the records',
            'Faster page checksums',
          ],
          correct: [0],
          explanation:
            'Indexes store (page, slot) as a row\'s durable address (T2). Because nobody is allowed to hold a raw interior offset, the engine can rearrange a page\'s contents and fix up one slot instead of every reference — the same freedom a copying GC gets from owning all the pointers.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: read the format yourself',
      md: `The page file is the rare binary format you can just read. Start with **Database Internals (Alex Petrov), Part I** — the storage chapters are the cleanest written walk-through of slotted pages and file layout. Then the Postgres source, famously readable for a C codebase: \`src/include/storage/bufpage.h\` (PageHeaderData — 24 bytes, documented better than most textbooks) and \`src/backend/storage/page/bufpage.c\`. Finally, **CMU 15-445/645, lectures 3–4 (Andy Pavlo, "Database Storage")** — free on YouTube, and the fastest way to watch someone hex-dump a real page and mean it.`,
    },
  ],
}

export default lesson
