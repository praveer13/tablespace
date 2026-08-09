import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't1.l2',
  slug: 'what-a-tuple-costs',
  trackId: 't1',
  index: 2,
  title: 'What a Tuple Costs',
  minutes: 14,
  hook: 'Headers, null bitmaps, alignment, padding — the bytes you pay before your data starts, and why narrow tables are fast tables.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Ask a room of backend engineers how big a row is and someone will start adding column widths. \`BIGINT\` is 8, \`BOOLEAN\` is 1, timestamp is 8… that arithmetic is always wrong, and wrong in the expensive direction. Every tuple pays **rent before its first column byte**: a fixed header the engine needs for MVCC and bookkeeping, a null bitmap when the row has nulls, and padding inserted because the CPU refuses to read an 8-byte integer from a 3-byte-aligned address. T1.L1 gave the row a home and a handle; this lesson prices the row itself — because once you can price one row, "a billion rows" stops being a vibe and becomes a page count, a cache footprint, and an I/O bill.`,
    },
    {
      type: 'prose',
      md: `## The 23 bytes before your data

Postgres's heap tuple header (the design everyone else approximates) carries seven fields before a single user byte:

| field | bytes | what it knows |
|---|---|---|
| \`xmin\` | 4 | transaction id that **created** this row version |
| \`xmax\` | 4 | transaction id that **deleted or replaced** it (0 = still alive) |
| \`cid\` | 4 | command id within the transaction |
| \`ctid\` | 6 | this tuple's own (page, slot) — T1.L1's stable handle |
| \`infomask2\` | 2 | more flags (attribute count, update-chain bits) |
| \`infomask\` | 2 | flag bits: has nulls, visibility hints |
| \`t_hoff\` | 1 | offset to where user data starts |

That is 23 bytes, padded up to 24 before the first column. Stare at the first two rows of that table: **every tuple carries its own birth and death certificate.** \`xmin\`/\`xmax\` are MVCC in two integers — they are why a row can be deleted and simultaneously still visible to someone else, and they are the entire hook for T4. For now, file away one consequence: a delete is a *write of 4 bytes into a header*, not an erasure, and the body it condemns stays on disk. T1.L4 picks up that thread.`,
    },
    {
      type: 'callout',
      variant: 'analogy',
      md: `Your rows pay rent in every runtime you use — the database is just honest about it. A JVM object starts with a mark word plus a class pointer (12–16 bytes before your first field, and HotSpot pads the whole object to a multiple of 8). A CPython object starts with a refcount and a type pointer, and that is before its \`__dict__\`. At 23 bytes of metadata per tuple, your database rows are the *cheapest* objects you allocate all day.`,
    },
    {
      type: 'prose',
      md: `## Null bitmaps and the CPU's tax

Two more variable pieces, then you can price any row:

- **The null bitmap.** One bit per column, rounded up to a whole byte — and present *only when the row actually contains a NULL* (a flag in \`infomask\` says so). A row with no nulls pays zero. NULL itself costs nothing to store: the bit says "this column is absent," no bytes follow.
- **Alignment and padding.** Every type declares an alignment: \`BIGINT\`, \`TIMESTAMPTZ\`, \`DOUBLE\` want offsets divisible by 8; \`INT\` by 4; \`SMALLINT\` by 2; \`BOOLEAN\` and \`CHAR\` by 1. Columns are laid out **in declared order**, each starting at the next offset that satisfies its alignment, with silent padding in the gaps — and the finished tuple is padded to a multiple of 8. The CPU charges this tax because an unaligned 8-byte load is either slow or illegal, depending on the architecture.

The consequence that surprises everyone: **column order is a schema-level size decision.** Same columns, different order, different row size — and at a billion rows, different disk bill.`,
    },
    {
      type: 'prose',
      md: `## Worked: a users table, twice

Take a realistic \`users\` table — seven fixed-width columns so the arithmetic is exact (variable-width \`text\` would only add a length byte or two):

\`id BIGINT\`, \`is_active BOOL\`, \`email_verified BOOL\`, \`created_at TIMESTAMPTZ\`, \`last_login TIMESTAMPTZ\`, \`failed_logins INT\`, \`age SMALLINT\`

Assume one NULL somewhere, so the header is 23 + 1 bitmap byte = 24, already aligned. Now lay the columns out **as declared**, tracking each column's offset in the data area:

| column | align | padding before | occupies |
|---|---|---|---|
| id | 8 | 0 | 0–8 |
| is_active | 1 | 0 | 8–9 |
| email_verified | 1 | 0 | 9–10 |
| created_at | 8 | **6** | 16–24 |
| last_login | 8 | 0 | 24–32 |
| failed_logins | 4 | 0 | 32–36 |
| age | 2 | 0 | 36–38 |

Data ends at 38, padded to 40. **Row = 24 + 40 = 64 bytes**, of which 8 are padding you paid for nothing.

Same table, packed wide-to-narrow — \`id\`, \`created_at\`, \`last_login\`, \`failed_logins\`, \`age\`, \`is_active\`, \`email_verified\`:

| column | align | padding before | occupies |
|---|---|---|---|
| id | 8 | 0 | 0–8 |
| created_at | 8 | 0 | 8–16 |
| last_login | 8 | 0 | 16–24 |
| failed_logins | 4 | 0 | 24–28 |
| age | 2 | 0 | 28–30 |
| is_active | 1 | 0 | 30–31 |
| email_verified | 1 | 0 | 31–32 |

Data is exactly 32, no end padding. **Row = 24 + 32 = 56 bytes.** Eight bytes saved per row — 12.5% — by *reordering a CREATE TABLE*. Zero padding wasted either way only if you are lucky; the general rule is just: widest alignment first, narrowest last.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '23 B', label: 'header before column one', hint: 'xmin/xmax, cid, ctid, infomasks, offset byte — MVCC and bookkeeping rent, padded to 24.' },
        { value: '64 → 56 B', label: 'same row, two column orders', hint: 'Declared order wastes 8 bytes on alignment padding; packed wide-to-narrow wastes none.' },
        { value: '116 vs 132', label: 'rows per 8 KB page', hint: '8184 usable bytes ÷ (row + 6 B slot). The packed page fits 132×62 = 8184 exactly.' },
        { value: '65.8 → 57.8 GiB', label: 'per billion rows', hint: 'Column order alone: ~1.05M fewer pages, ~8 GiB less disk and cache.' },
      ],
    },
    {
      type: 'prose',
      md: `## A billion rows is a page count

Do the last step, because it is the one that matters in production. Using lab-01 page arithmetic (8184 usable bytes, 6 bytes of slot per row — real Postgres pages are within a few percent of this):

- Declared order: \`⌊8184 / (64+6)⌋ = 116\` rows per page → a billion rows needs **8,620,690 pages ≈ 65.8 GiB**.
- Packed order: \`⌊8184 / (56+6)⌋ = 132\` rows per page — and 132 × 62 = 8184, the page fills to the last byte → a billion rows needs **7,575,758 pages ≈ 57.8 GiB**.

One schema decision, ~1.05 million pages, ~8 GiB. And the multiplier never stops applying, because **everything downstream is denominated in pages, not rows** (T0's contract, now with teeth): a sequential scan reads pages, so 16% fewer pages is a 16% cheaper scan; the buffer pool caches pages, so the packed table's hot set is 8 GiB more likely to be in memory; backups, replication, and vacuum all move pages.

Two corollaries worth taping to your monitor. **Narrow tables are fast tables** — a 40-column table where you "only select 3" still reads every wide page off disk; projection happens after the I/O, not before. And **row width is a cache decision**: at 116 rows per page, your working set fits in RAM exactly when it fits in RAM, and column order can be the difference.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'What lives in the ~23 bytes of heap tuple header before the first column?',
          options: [
            'A length prefix, a checksum, and the table OID',
            'The creating and deleting transaction ids (xmin/xmax), the tuple’s own (page, slot) ctid, flag bits, and an offset byte',
            'Pointers into every index that references this row',
            'The null bitmap and nothing else',
          ],
          correct: [1],
          explanation:
            'The header is the engine’s metadata: xmin/xmax are the MVCC birth and death certificates (T4’s raw material), ctid is the self-address from T1.L1, infomask carries flags like “has nulls.” Indexes are never referenced from the tuple — the pointer direction is index → tuple only.',
        },
        {
          q: 'A row has a NULL in one of its seven columns. How is that stored?',
          options: [
            'A special NULL sentinel value written into the column’s 8-byte slot',
            'One byte per nullable column appended to the header, always',
            'One bit per column in a bitmap that exists only because the row has a NULL — the absent column stores no bytes at all',
            'The column stores zero bytes, and the engine infers which one from t_hoff',
          ],
          correct: [2],
          explanation:
            'The bitmap is one bit per column, rounded to a byte, and infomask says whether it exists at all — rows without nulls skip it entirely. NULL costs the bit and nothing else; no placeholder bytes are written for the column.',
        },
        {
          q: 'Reordering the users table from declared order to wide-to-narrow cut the row from 64 B to 56 B. At one billion rows, that is worth roughly…',
          options: [
            'Nothing — column order is cosmetic; the engine repacks rows on write',
            '8 bytes total — padding does not compound',
            '~8 GiB and ~1.05M fewer pages — 132 vs 116 rows per page changes the scan, cache, and storage bill for the life of the table',
            'Exactly half the table size',
          ],
          correct: [2],
          explanation:
            '8184/(64+6) = 116 rows/page vs 8184/(56+6) = 132. A billion rows is 8.62M vs 7.58M pages. Everything the engine does — scanning, caching, vacuuming, backing up — is priced in pages, so the 16% follows the table forever.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: measure, don’t guess',
      md: `Verify all of this on your own database in two minutes: \`SELECT pg_column_size(t) FROM users t LIMIT 1\` reports the stored size of an actual row, and comparing it against your column-sum arithmetic is the whole lesson in one query. The source of truth is \`src/include/access/htup_details.h\` (\`HeapTupleHeaderData\`) — read the struct, it is 60 lines with comments. The free *PostgreSQL Internals* book (Egor Rogov, Postgres Professional) walks page layout and TOAST with real byte diagrams, and the PG docs chapter "Database Physical Storage → Database Page Layout" documents the 24-byte page header and 4-byte line pointers that make real heap pages slightly tighter than lab-01 arithmetic (8152-ish usable, not 8184). Schema-design takeaway you can apply Monday: declare fixed-width columns widest-alignment-first (\`BIGINT\`/timestamps, then \`INT\`, then \`SMALLINT\`, \`BOOLEAN\` last). It costs you nothing and pays per row, forever.`,
    },
  ],
}

export default lesson
