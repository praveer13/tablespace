//! planner.rs — forge lab 08 · THE ONLY FILE YOU EDIT
//!
//! Mission: the optimizer's search, the way System R did it in 1979 and
//! Postgres still does today — Selinger's dynamic program over join-order
//! subsets, left-deep trees, interesting orders, and pruning by cost. The
//! harness hands you a `StatsCard` (the planner's sketch of the world: table
//! sizes, join selectivities, available indexes). You hand back a `Plan`:
//! the join order, the join method at every step, the scan at every leaf,
//! and the exact price of it all under the pinned cost model below.
//!
//! Two functions, two grades:
//!
//!   * `cost_of(plan, card) -> u64` — price a plan in MILLIUNITS. Before you
//!     may search, you must price honestly: the cost_model check compares
//!     your arithmetic against the harness's on hand-built scenarios, to the
//!     milliunit. No floats anywhere in costing — see DETERMINISM below.
//!   * `plan(card) -> Plan` — the dynamic program itself (T7.L3): cheapest
//!     plan per (subset, interesting order), level by level, then read the
//!     winner off the full set.
//!
//! ═══════════════════════ THE COST MODEL (pinned) ═════════════════════
//!
//! All costs are u64 MILLIUNITS: 1 sequential page fetch = 1000. The
//! constants are the T0/T5 canon, frozen:
//!
//!   SEQ_PAGE_MILLI    = 1000   (seq_page_cost 1.0 — the unit of account)
//!   RANDOM_PAGE_MILLI = 4000   (random_page_cost 4.0)
//!   CPU_TUPLE_MILLI   =   10   (cpu_tuple_cost 0.01)
//!   INDEX_PROBE_PAGES =    3   (T5.L2: one tree descent ≈ 3 random pages)
//!   ROW_BYTES         =  400   (≈20 rows per 8192-byte page — lab-01 math)
//!   ROWS_PER_PAGE     =   20   (an intermediate spilled to disk, per page)
//!   WORK_MEM_BYTES    = 4 MiB  (the Postgres default from T5.L2)
//!
//! Scans (the leaves of the plan; table T has T.rows rows in T.pages pages):
//!
//!   Seq          T.pages·SEQ + T.rows·CPU                 output unsorted
//!   Index(col)   T.pages·RANDOM + T.rows·CPU              output SORTED on
//!                (reads the same pages in random order;    (T, col) — the
//!                 the sort order is what you buy)           interesting order)
//!
//! Join steps (outer O = the accumulated left-deep intermediate with O.rows
//! rows; the new table T is always the inner/right side). Every step's
//! output cardinality is rows_of(new subset) — GIVEN below, already exact:
//!
//!   NestLoop     per outer row, one inner access:
//!                  inner Seq:          O.rows × (T.pages·SEQ + T.rows·CPU)
//!                  inner Index(col)    O.rows × (INDEX_PROBE_PAGES·RANDOM + CPU)
//!                    — col MUST be T's column on the join edge; this is the
//!                      indexed nested-loop of T5.L2, the OLTP plan.
//!                Output KEEPS the outer's sortedness (the loop preserves it).
//!   Hash         scan(inner) + (O.rows + T.rows)·CPU      build side = T.
//!                If T.rows·ROW_BYTES > WORK_MEM_BYTES the build spills and
//!                Grace partitioning kicks in (T5.L2: each side is read,
//!                written, re-read — sequentially):
//!                  += 2·(pages_of(O.rows) + T.pages)·SEQ + (O.rows + T.rows)·CPU
//!                Output unsorted.
//!   Merge        needs BOTH inputs sorted on the join column:
//!                  outer: already sorted on it → 0, else sort(O.rows)
//!                  inner: Index on T's join column → just the index scan,
//!                         else seq scan + sort(T.rows)
//!                plus (O.rows + T.rows)·CPU for the merge walk itself.
//!                Output is SORTED on both join columns — an asset upstream.
//!   sort(r)      r·ceil_log2(r)·CPU, and if r·ROW_BYTES > WORK_MEM_BYTES the
//!                sort is external: += 2·pages_of(r)·SEQ (write runs, read back)
//!
//! Every product runs in u128 and clamps through `sat_milli` (given): a
//! plan priced past u64::MAX milliunits is never the answer, and the clamp
//! keeps the arithmetic total — no overflow panics, native or wasm.
//!
//! Which edge joins T to the outer set: the LOWEST-NUMBERED edge in
//! `card.edges` that connects them (`connecting_edge`, given). On a cycle
//! more edges may connect — they are filters, and their selectivity is
//! already folded into rows_of; only the lowest-numbered one is the join
//! key for method legality (index probes) and merge sortedness.
//!
//! ═══════════════════════ THE SEARCH (System R DP) ════════════════════
//!
//! n! left-deep orders is a fool's errand; 2^n subsets is the DP. Optimal
//! substructure: the cheapest plan for a subset contains cheapest plans for
//! its subsets — and rows_of(S) depends ONLY on the subset S, never on the
//! order that built it, which is exactly what makes this sound.
//!
//!   Level 1:  for each table, every access path (Seq, plus Index(col) per
//!             index the card grants). Keep the cheapest plan per
//!             (subset, order-property).
//!   Level k:  extend every kept plan with every remaining table that has
//!             a connecting edge (NO cross products — System R considers
//!             them only when a predicate demands one), under every legal
//!             (JoinMethod, inner ScanMethod). Keep the cheapest per
//!             (subset, order-property).
//!   Answer:   the cheapest plan for the full set, any order-property.
//!
//! Order-properties (the interesting orders): the unsorted property, plus
//! every (table, column) pair any edge mentions. A plan is kept under a
//! sorted property only if its output actually arrives in that order
//! (index scan, a merge on a matching column, or a nested-loop that
//! inherits its outer's order). The interesting_orders check exists to
//! prove you kept a SECOND-cheapest pair plan when its sorted output makes
//! the top merge join free — cheapest-per-subset alone is a memoizer, not
//! an optimizer.
//!
//! Pruning: within one (subset, property) keep ONE cheapest plan; a
//! strictly lower cost evicts, a tie keeps the incumbent. Enumerate
//! deterministically — subsets by size then mask ascending, new tables by
//! id ascending, methods NestLoop → Hash → Merge, inner scans Seq → Index —
//! and the search is fully reproducible.
//!
//! `Plan` shape: `join_order[i]` is the i-th table into the left-deep tree;
//! `scans[i]` is how that table is read (for i ≥ 1: the inner access at
//! that join step); `methods[i-1]` is the join method that brings
//! `join_order[i]` in. `total_cost` is `cost_of(&plan, card)` converted:
//! `milliunits as f64 / 1000.0` — the harness re-prices your plan with its
//! own arithmetic and checks your number against it, to the bit.
//!
//! ═══════════════════════════ DETERMINISM ═════════════════════════════
//!
//! The same checks run natively and as wasm in the browser, and they
//! compare costs EXACTLY. So: all cost and cardinality math is integer
//! (u64/u128 milliunits) — floats appear only in the final
//! `milliunits as f64 / 1000.0` display conversion, which IEEE pins
//! bit-exactly. No HashMap (entropy on wasm — BTreeMap only), no
//! transcendentals, no clocks, no randomness: every card is pre-seeded.
//!
//! ═══════════════════════ GIVEN — do not change ═══════════════════════

/// A table is its index into `StatsCard.tables`. In a subset mask, table t
/// is bit t (`1u32 << t`). Cards never exceed 6 tables in this lab.
pub type TableId = usize;

/// Cost constants, in milliunits (1 sequential page = 1000 milliunits).
pub const SEQ_PAGE_MILLI: u64 = 1000;
pub const RANDOM_PAGE_MILLI: u64 = 4000;
pub const CPU_TUPLE_MILLI: u64 = 10;
/// Pages fetched by one index probe: a ~3-level tree descent (T5.L2).
pub const INDEX_PROBE_PAGES: u64 = 3;
/// Bytes per row in the memory arithmetic (≈20 rows per 8 KiB page).
pub const ROW_BYTES: u64 = 400;
/// Rows per page when an intermediate result is spilled to disk.
pub const ROWS_PER_PAGE: u64 = 20;
/// work_mem: a hash build side or a sort larger than this spills.
pub const WORK_MEM_BYTES: u64 = 4 * 1024 * 1024;
/// Selectivities are parts per million: out_rows ≈ a_rows · b_rows · sel_ppm / SEL_DENOM.
pub const SEL_DENOM: u64 = 1_000_000;

/// The planner's sketch of one table (T5.L3 handed you these; here they are
/// exact — the harness is the sketch).
#[derive(Clone, Debug)]
pub struct TableStat {
    pub rows: u64,
    pub pages: u64,
}

/// One join predicate between two tables. `col_a`/`col_b` identify the join
/// COLUMN on each side: two edges that give the same table the same column
/// share sortedness — a merge on one produces order the other can reuse.
/// `index_a`/`index_b`: an index exists on that endpoint's join column.
#[derive(Clone, Debug)]
pub struct Edge {
    pub a: TableId,
    pub b: TableId,
    pub col_a: u8,
    pub col_b: u8,
    pub sel_ppm: u32,
    pub index_a: bool,
    pub index_b: bool,
}

/// The statistics card: everything the search is allowed to know.
#[derive(Clone, Debug)]
pub struct StatsCard {
    pub tables: Vec<TableStat>,
    pub edges: Vec<Edge>,
}

/// How one table is read. `Index(col)` requires the card to grant an index
/// on (table, col); under NestLoop it must be the join column (the probe
/// key) — under Merge it delivers the sorted precondition iff col is the
/// join column, otherwise it is just an expensive unsorted scan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScanMethod {
    Seq,
    Index(u8),
}

/// The three classical strategies of T5.L2.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JoinMethod {
    NestLoop,
    Hash,
    Merge,
}

/// A left-deep plan: ((order[0] ⋈ order[1]) ⋈ order[2]) ⋈ …
#[derive(Clone, Debug)]
pub struct Plan {
    pub join_order: Vec<TableId>,
    pub methods: Vec<JoinMethod>, // len = n - 1; methods[i-1] brings in join_order[i]
    pub scans: Vec<ScanMethod>,   // len = n; scans[i] reads join_order[i]
    pub total_cost: f64,          // milliunits as f64 / 1000.0 — display + honesty
}

/// Does the card grant an index on (table, col)?
pub fn has_index(card: &StatsCard, t: TableId, col: u8) -> bool {
    card.edges.iter().any(|e| {
        (e.a == t && e.col_a == col && e.index_a) || (e.b == t && e.col_b == col && e.index_b)
    })
}

/// The lowest-numbered edge connecting table `t` to the subset `mask`
/// (the join-edge rule — filters on a cycle collapse into rows_of, this
/// one edge carries the method legality and the merge sortedness).
pub fn connecting_edge(card: &StatsCard, t: TableId, mask: u32) -> Option<usize> {
    card.edges.iter().position(|e| {
        (e.a == t && mask & (1 << e.b) != 0) || (e.b == t && mask & (1 << e.a) != 0)
    })
}

/// The cardinality of a join subset, as a PURE function of the subset:
/// the product of the table rows, with every edge internal to the subset
/// applied in card order — each application floors
/// (`acc = acc · sel_ppm / 1_000_000`), and a nonempty subset estimates at
/// least 1 row. Order-independent on purpose: {A,B,C} has ONE row estimate
/// no matter which order you joined it in — that is what makes
/// cheapest-per-subset a sound pruning rule. (u128 internally; the harness
/// keeps tables ≤ 6 and rows ≤ 300_000, so nothing here can overflow.)
pub fn rows_of(card: &StatsCard, mask: u32) -> u64 {
    let mut acc: u128 = 0;
    for t in 0..card.tables.len() {
        if mask & (1 << t) != 0 {
            let r = card.tables[t].rows as u128;
            acc = if acc == 0 { r } else { acc * r };
        }
    }
    if acc == 0 {
        return 0;
    }
    for e in &card.edges {
        if mask & (1 << e.a) != 0 && mask & (1 << e.b) != 0 {
            let sel = e.sel_ppm as u128;
            let den = SEL_DENOM as u128;
            acc = acc / den * sel + (acc % den) * sel / den; // exact floor, no overflow
        }
    }
    let r = acc.min(u64::MAX as u128) as u64;
    r.max(1)
}

/// ceil(log2(x)) with integer bit tricks; ceil_log2(1) = 0. The sort fanout
/// term — deterministic everywhere, no floating point.
pub fn ceil_log2(x: u64) -> u64 {
    if x <= 1 {
        0
    } else {
        64 - (x - 1).leading_zeros() as u64
    }
}

/// Pages occupied by `rows` rows of an intermediate spilled to disk.
pub fn pages_of(rows: u64) -> u64 {
    rows / ROWS_PER_PAGE + u64::from(rows % ROWS_PER_PAGE != 0) // ceil, overflow-safe
}

/// Saturating fixed-point: compute products in u128 and clamp with this —
/// a plan priced past u64::MAX milliunits is never the answer, and clamping
/// keeps the arithmetic total (no overflow panics, native or wasm).
pub fn sat_milli(x: u128) -> u64 {
    x.min(u64::MAX as u128) as u64
}

/// Price `p` under the pinned cost model, in milliunits. The harness walks
/// your plan with its own copy of this arithmetic and demands a match to
/// the milliunit — implement the model in the header EXACTLY. Assume the
/// plan is well-formed (the harness validates before pricing).
pub fn cost_of(p: &Plan, card: &StatsCard) -> u64 {
    let _ = (p, card);
    todo!("walk the left-deep plan: scan cost of join_order[0], then per step the join-method add from the header (NestLoop probe/full inner, Hash with the Grace spill rule, Merge with any needed sorts), tracking the outer's sortedness; return milliunits")
}

/// The System R dynamic program: cheapest left-deep plan per
/// (subset, interesting order), level by level, no cross products — then
/// the winner for the full set, with `total_cost = cost_of as f64 / 1000.0`.
pub fn plan(card: &StatsCard) -> Plan {
    let _ = card;
    todo!("DP over subset masks: level 1 = access paths (seq + indexes); level k = extend each kept (subset, order-property) plan with every connected remaining table × every legal (method, inner scan); keep cheapest per (subset, property), ties keep the incumbent; answer = cheapest for the full mask")
}
