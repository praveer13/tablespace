import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't7.l1',
  slug: 'columnar-the-other-layout',
  trackId: 't7',
  index: 1,
  title: 'Columnar: The Other Layout',
  minutes: 14,
  hook: 'Store columns together and the same query reads 2% of the bytes: DSM, compression, zone maps, and when the row store still wins.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Everything you have built stores **rows**. T1's slotted page keeps each tuple whole — header, null bitmap, columns in order — and T2 through T5 all stand on that decision: indexes point at rows, the WAL logs row changes, MVCC versions rows, the volcano pulls rows. The layout even has a name: **NSM, the N-ary storage model.** It is so default that most engineers never learn there is another one.

The other one: **DSM, the decomposition storage model** — store each *column* separately, every value of \`region\` adjacent to every other value of \`region\`. The idea is as old as the relational model's industrial life (Copeland & Khoshafian proposed it in 1985), row stores won the twentieth century on transactions, and then analytics — MonetDB in the '90s, C-Store in 2005, and everything since — brought it back with a vengeance. This lesson is why: the analytical query pattern makes the row layout a per-byte tax, and you can compute the tax exactly.`,
    },
    {
      type: 'prose',
      md: `## The scan-bytes bill

Set the table: \`events\`, 100M rows, 40 columns, ~500 bytes per row — **~50GB** on disk. Now the query that runs every morning:

\`SELECT region, SUM(revenue) FROM events WHERE ts >= '2026-01-01' GROUP BY region\`

It needs **3 columns of 40** — timestamp, region, revenue, ~12 bytes of each 500-byte row. Run it on a row store and T0's contract does the billing: the page is the unit of I/O, and a page holds whole rows, so fetching those 12 bytes costs all 500. **You read 50GB to use ~1.2GB.** At a sequential 7GB/s that is ~7 seconds of pure I/O — before CPU, before the aggregate — and ~98% of it is bytes you will immediately discard.

Run it columnar: the scan opens three column files and reads ~1.2GB — **2% of the bytes, 0.2 seconds, same answer.** This is T0.L2's cost model turned sideways. Pages are still the unit, sequential still beats random, the buffer pool still arbitrates — but a columnar page physically cannot be wasted, because everything on it is a column somebody asked for. The row store's tax is not overhead; it is *layout*.`,
    },
    {
      type: 'prose',
      md: `## Compression loves columns

Columnar's second dividend is that adjacent values share a **type and a domain**, and that is exactly what compression eats:

- **\`region\`** — 200 distinct values across 100M rows: dictionary-encode to one byte per value, then run-length-encode the long repeated streaks a clustered column produces: (value, count) pairs instead of values.
- **\`ts\`** — monotonically increasing timestamps: store a base and per-value deltas (frame-of-reference), and each delta fits in a byte or two.
- **\`revenue\`** — integers in a narrow band: same frame-of-reference trick.

A row page mixes types and domains every few bytes — string, then int, then timestamp, then string — and entropy defeats the codec. On columnar data, **10× compression is ordinary** (Parquet and ORC files routinely deliver it), which multiplies straight into the scan bill: 1.2GB becomes ~120MB. And the kicker: vectorized engines (T7.L2) execute *directly on the compressed form* — sum an RLE run as value × count, filter a dictionary column on codes — so compression buys I/O, memory bandwidth, *and* CPU. It is the only optimization in this course that pays three times.`,
    },
    {
      type: 'prose',
      md: `## Zone maps and late materialization

Two execution tricks complete the design, both free once the layout is columnar.

**Zone maps.** For every column block (say 100k values), keep a few bytes of metadata: min, max, null count. Predicate \`ts >= '2026-01-01'\` meets a block whose max is \`'2025-11-30'\` — skip it, *unread*. This is the poor man's index: no write-path maintenance beyond the append you were doing anyway, no T2 tree to keep balanced, and it works exactly as well as the column is physically clustered — on an append-only events table, time-ordered for free, it is devastating. Parquet calls them page statistics; DuckDB, zone maps; the idea is older than all of them.

**Late materialization.** A row store's scan decodes a tuple the moment a page arrives — T1's 23-byte header, xmin/xmax check, the works. A columnar scan runs each predicate on its own column and produces a **position list** — row numbers, not rows. Intersect the lists, and only then touch the projected columns at the surviving positions. For \`SUM(revenue)\` you never materialize a tuple at all: positions and values flow straight into the aggregate. The tuple, the unit of everything from T1 through T5, simply never exists.`,
    },
    {
      type: 'diagram',
      caption: 'fig 1 — one table, two layouts, one query',
      height: 62,
      nodes: [
        { id: 'q', x: 30, y: 2, w: 40, h: 9, label: 'the query', sub: 'needs 3 of 40 columns', color: '#A3E635' },
        { id: 'nsm1', x: 4, y: 20, w: 20, h: 9, label: 'NSM page 1', sub: 'whole rows', color: '#5CA8FF' },
        { id: 'nsm2', x: 4, y: 32, w: 20, h: 9, label: 'NSM page 2', sub: 'whole rows', color: '#5CA8FF' },
        { id: 'nsmN', x: 4, y: 44, w: 20, h: 9, label: '… all of them', sub: '~6M pages', color: '#94A3B8' },
        { id: 'ts', x: 40, y: 20, w: 25, h: 9, label: 'ts columns', sub: 'zone map: skip 90%', color: '#3EF2A4' },
        { id: 'cols', x: 40, y: 32, w: 25, h: 9, label: 'region · revenue', sub: 'compressed ~10×', color: '#3EF2A4' },
        { id: 'skip', x: 74, y: 20, w: 22, h: 9, label: 'unread blocks', sub: 'max < predicate', color: '#FB7185' },
        { id: 'agg', x: 74, y: 44, w: 22, h: 9, label: 'SUM', sub: 'no tuple ever born', color: '#A78BFA' },
      ],
      edges: [
        { from: 'q', to: 'nsm1', label: 'row store: read everything' },
        { from: 'q', to: 'ts', label: 'column store: open 3 files' },
        { from: 'nsm1', to: 'nsm2' },
        { from: 'nsm2', to: 'nsmN' },
        { from: 'ts', to: 'skip', label: 'zone maps' },
        { from: 'ts', to: 'cols', label: 'positions survive' },
        { from: 'cols', to: 'agg' },
      ],
      steps: [
        { caption: 'The query wants timestamp, region, revenue — 12 bytes of each 500-byte row. Two engines, same question.', active: ['q'] },
        { caption: 'The row store pays the layout tax: the page is the unit, pages hold whole rows, so the scan reads ~50GB to use 2% of it. No index helps a 40%-of-the-table predicate.', active: ['nsm1', 'nsm2', 'nsmN'], edges: ['q->nsm1', 'nsm1->nsm2', 'nsm2->nsmN'] },
        { caption: 'The column store opens three column files. Zone maps on ts eliminate whole blocks whose max predates the predicate — unread, zero I/O.', active: ['ts', 'skip'], edges: ['q->ts', 'ts->skip'] },
        { caption: 'Surviving positions intersect, region and revenue stream in compressed, and the aggregate consumes values by position. No page of whole rows is ever fetched; no tuple is ever assembled.', active: ['cols', 'agg'], edges: ['ts->cols', 'cols->agg'] },
      ],
    },
    {
      type: 'prose',
      md: `## The split, stated honestly

If columnar wins the scan this decisively, why does the row store still exist? Because the point query inverts the bill. \`SELECT * FROM users WHERE id = 42137\` wants **all 40 columns of one row**: the row store answers with one page fetch (T2's tree descent, ~3 random I/Os), and the column store pays ~40 seeks to reassemble a single tuple. Writes invert it too: one row insert is one page write in NSM and ~40 appends in DSM, and updates are worse — columnar engines bolt on delta stores and background merges (an LSM-shaped admission of defeat, T2.L3) to stay writable.

So the honest 2026 architecture is a **split**: a row store owns the point transactions, a columnar something owns the scans, and a pipeline — CDC, ETL, a replica — keeps them in sync, with the lag and the seams yours to operate. **HTAP** systems promise both in one box; what they deliver is two layouts under one SQL interface plus a catch-up mechanism, which is the split wearing a single process. That is not a scam — it is the correct engineering — but anyone selling you "no compromise" is selling. The layouts price different physics, and physics does not compromise.`,
    },
    {
      type: 'callout',
      variant: 'analogy',
      title: 'the newspaper rack',
      md: `A 3-column scan on a row store is buying every newspaper on the rack to read the sports section of each — you pay for the whole bundle because that is how it is bound. Column storage is subscribing to the sports section. Compression is that the sports section, printed in one typeface about one subject, photocopies down to a pamphlet. And zone maps are the date on the cover: last year's paper does not get opened at all.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '500B → 12B', label: 'per-row bytes the query wants', hint: '3 of 40 columns. The row store bills you for all 500; the column store bills for 12.' },
        { value: '2%', label: 'of the bytes read', hint: '~1.2GB of ~50GB on the running example — before compression. Layout, not overhead.' },
        { value: '~10×', label: 'compression that keeps paying', hint: 'Dictionary / RLE / frame-of-reference on same-type runs. Engines execute on the compressed form: I/O, bandwidth, and CPU.' },
        { value: '~40', label: 'files one row insert touches', hint: 'Why columnar loses the point transaction: one row is one NSM page and ~40 DSM appends.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'events: 100M rows, 40 columns, ~500B per row (~50GB). A dashboard query touches 3 columns (~12B/row). Roughly what fraction of the scanned bytes does each layout read?',
          options: [
            'Row store ~2%, column store ~2% — page caching equalizes them',
            'Row store 100% (~50GB, pages hold whole rows); column store ~2% (~1.2GB, only three column files) — before compression widens the gap further',
            'Row store ~50% — the buffer pool skips unrelated columns',
            'Column store 100% — it must reassemble every row to filter',
          ],
          correct: [1],
          explanation:
            'The page is the unit of I/O (T0), and an NSM page holds whole rows: reading 12 bytes costs 500. DSM inverts the layout, so a page of one column is never wasted. Filtering needs no reassembly — predicates run per column and produce position lists.',
        },
        {
          q: 'Why do dictionary encoding and RLE devastate column files but barely dent row pages?',
          options: [
            'Row pages are encrypted by the buffer pool',
            'Codecs exploit repetition: a column is one type and one domain, so values repeat in long runs and small dictionaries; a row page alternates types and domains every few bytes, and entropy defeats the codec',
            'Column files use larger pages',
            'RLE requires sorted input, and only column stores sort',
          ],
          correct: [1],
          explanation:
            'Compression is repetition-finding. Adjacent same-domain values (200 regions across 100M rows, monotonic timestamps) are nothing but repetition; interleaved heterogeneous tuple bytes are not. Sortedness helps RLE but is not required — clustering is enough.',
        },
        {
          q: 'Under which workload does the row store still beat the column store decisively?',
          options: [
            'Full-table aggregations over a few columns',
            'Time-range scans on an append-only table',
            'Point lookups and small writes: SELECT * by primary key is one page fetch in NSM and ~40 reassembly seeks in DSM; one insert is one page write vs ~40 appends',
            'Building a B+tree index',
          ],
          correct: [2],
          explanation:
            'The point transaction wants the whole row at once — exactly NSM\'s layout and exactly DSM\'s worst case. This is why the honest architecture is a split: row store for the points, columnar for the scans, a pipeline between them.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: the column store lineage',
      md: `The paper that made it a movement: **Stonebraker et al., "C-Store: A Column-oriented DBMS" (VLDB, 2005)** — the full design: projections, compression, late materialization, and a row-store writeable front, all arguing one number: bytes read. The pioneer it credits: **MonetDB** (Boncz & co, 1990s onward) — the column-at-a-time research engine whose execution paper opens T7.L2. The working engineer's read: **the DuckDB storage and execution docs** — zone maps, compression per column type, and the vector format, written plainly. The on-disk lingua franca: **Parquet's format docs** — row groups, column chunks, page statistics; zone maps by another name. And the contrast that keeps you honest: **your lab-01 page** — NSM to the byte. Postgres's answer to analytics is an extension or a replica, not a relayout; after this lesson you can say precisely why.`,
    },
  ],
}

export default lesson
