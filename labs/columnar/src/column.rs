//! column.rs — forge lab 09 · THE ONLY FILE YOU EDIT
//!
//! Mission: the analytical engine in miniature. Every lab before this one
//! stored ROWS (NSM). This one stores COLUMNS (DSM): each column on its own,
//! split into blocks of BLOCK values, every block compressed and carrying a
//! few bytes of metadata — a zone map — that lets a scan skip the block
//! unread. On top of that, one vectorized operator: filter + sum over
//! 2048-value batches behind a selection mask. T7.L1's layout, T7.L2's
//! execution, lab 05's SQL semantics. Same algebra, different physics.
//!
//! ══════════════════════════ THE BLOCK FORMAT ═════════════════════════
//!
//! One block holds up to BLOCK (2048) values of ONE column. Three
//! encodings; the store picks per block:
//!
//! ```text
//!   Raw  { values }          verbatim — the fallback every codec is
//!                              measured against
//!   Dict { dict, codes }     dict holds each DISTINCT value once (Null
//!                              included — here NULL is a value, not a
//!                              flag); codes[i] is the dict index of the
//!                              i-th value. u16 codes: a block never tops
//!                              2048 of them.
//!   Rle  { runs }            (value, count) pairs, MAXIMAL: no two
//!                              adjacent runs hold equal values, so a
//!                              constant block is exactly ONE run.
//! ```
//!
//! decode() is the byte-exact inverse of all three. The value count is
//! implicit in every form: values.len(), codes.len(), Σ run counts.
//!
//! The pinned byte sizes — the harness's tape measure. compression_band
//! grades the store with EXACTLY this formula, so choose_encoding should
//! optimize exactly it:
//!
//! ```text
//!   value:   Null → 1 byte · Int → 9 · Text(s) → 3 + len   (tag + payload)
//!   Raw:     4 + Σ value
//!   Dict:    4 + 2 + Σ value over the dict + 2 × codes.len()
//!   Rle:     4 + 2 + Σ (value + 4) over the runs
//! ```
//!
//! choose_encoding returns the SMALLEST of the three. Ties are equal
//! bytes — break them however you like. (Real engines also weigh decode
//! cost; the harness only weighs bytes.)
//!
//! ═══════════════════════════ THE ZONE MAP ════════════════════════════
//!
//! zone_of(block) computes the block's metadata: rows, nulls, and min/max
//! over the NON-NULL values only (both None on an all-NULL or empty
//! block). Zone::may_match(pred) is the canonical skip rule — the harness
//! mirrors it exactly when it counts the blocks your scan reads:
//!
//! ```text
//!   Eq(v)             min ≤ v ≤ max     (v = NULL never matches anything)
//!   Lt(v)             min < v           Le(v)   min ≤ v
//!   Gt(v)             max > v           Ge(v)   max ≥ v
//!   Between(lo, hi)   NOT (max < lo OR min > hi)
//!   all-NULL block (min = None)         never matches
//! ```
//!
//! A zone can only ever prove NO — "this block cannot contain a match".
//! When it can't prove no, you read the block. That asymmetry is the whole
//! design: zones are exact about absence and silent about presence.
//!
//! ═══════════════════════ THE VECTORIZED OPERATOR ═════════════════════
//!
//! scan_filter_sum(col_filter, pred, col_sum) -> (rows_matched, sum,
//! blocks_read). The protocol — one block at a time, a decoded COLUMN
//! never exists:
//!
//! ```text
//!   for each block b of col_filter:
//!     1. ZONE CHECK: zones[b].may_match(pred) — false → skip the block
//!        UNREAD. Nothing is decoded; nothing counts. Zone checks read
//!        metadata; they are free.
//!     2. decode the filter block (blocks_read += 1) and evaluate pred
//!        over the batch → a selection mask: one bool per value.
//!     3. empty mask → next block. The sum block is NOT read — late
//!        materialization: positions, not payloads, cross the boundary.
//!     4. non-empty mask → rows_matched += its true count; decode block b
//!        of col_sum (blocks_read += 1) and add its Int values at the
//!        surviving positions to the sum.
//!        When col_filter == col_sum the block already in hand IS the sum
//!        block: decode once, count once.
//! ```
//!
//! blocks_read counts DECOMPRESSED blocks — it is the harness's proof your
//! zones are load-bearing, not decoration.
//!
//! SQL semantics (lab 05's canon, turned sideways): a comparison touching
//! NULL is UNKNOWN, and UNKNOWN is not true — predicates NEVER match NULL.
//! rows_matched counts every surviving position; the sum adds only the
//! non-NULL Int values at those positions (COUNT(*) vs SUM). The harness
//! compares like-typed values only; for anything else, false is the honest
//! answer.
//!
//! The corpus the harness builds (src/lib.rs): 50,000 rows — `ts`
//! monotone with repeats (RLE heaven), `status` 6 iid-ish strings with 3%
//! NULLs (dictionary heaven), `region` CONSTANT within each block (the
//! zone map's best case), `amount` zipf-ish with NULLs, two all-NULL
//! outage blocks and two NULL-heavy ones. Everything is integers; native
//! and wasm agree to the bit.
//!
//! One wasm rule, same as lab 05: BTreeMap, never HashMap — std's HashMap
//! draws OS randomness that does not exist on wasm, and panics there.

/// Values per compressed block. DuckDB's standard vector is 2048; so is
/// yours. DO NOT CHANGE — the harness chunks by this too.
pub const BLOCK: usize = 2048;

/// One value of a column. The derived order (Null < Int < Text, then by
/// payload) is NOT SQL comparison — it exists so dictionaries and zones can
/// sort like-typed values. SQL semantics live in `Pred::matches`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Value {
    Int(i64),
    Text(String),
    Null,
}

/// A WHERE-clause predicate over ONE column. `Between(lo, hi)` is inclusive
/// on both ends — the zone-map showcase, since a range is what min/max
/// proves or disproves cheapest.
#[derive(Clone, Debug)]
pub enum Pred {
    Eq(Value),
    Lt(Value),
    Le(Value),
    Gt(Value),
    Ge(Value),
    Between(Value, Value),
}

impl Pred {
    /// SQL three-valued logic on one value: true means KEEP the row. Any
    /// comparison touching NULL (or a type mismatch, which the harness
    /// never sends) is UNKNOWN — and UNKNOWN is not true.
    #[allow(dead_code)] // your scan calls this; the harness grades through its own reference eval
    pub fn matches(&self, v: &Value) -> bool {
        let _ = v;
        todo!("match on the predicate; compare only like-typed pairs (Int with Int, Text with Text) — NULL and mismatches are UNKNOWN → false; Between is inclusive on both ends")
    }
}

/// One compressed block of up to BLOCK values — the format is pinned in the
/// module header.
#[allow(dead_code)] // your encoders construct these; the harness only measures them
#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Raw { values: Vec<Value> },
    Dict { dict: Vec<Value>, codes: Vec<u16> },
    Rle { runs: Vec<(Value, u32)> },
}

/// The few bytes of metadata that let a scan skip a block unread.
#[derive(Clone, Debug, PartialEq)]
pub struct Zone {
    /// Values in the block (≤ BLOCK; the last block is short).
    pub rows: u32,
    /// How many of them are NULL.
    pub nulls: u32,
    /// min/max over the NON-NULL values; both None on an all-NULL (or
    /// empty) block.
    pub min: Option<Value>,
    pub max: Option<Value>,
}

impl Zone {
    /// The canonical skip rule (module header has the table). A false here
    /// is a proof of absence — the block is skipped unread.
    #[allow(dead_code)] // your scan calls this per block; the harness mirrors it exactly
    pub fn may_match(&self, p: &Pred) -> bool {
        let _ = p;
        todo!("no min/max → false; Eq: min <= v <= max (NULL never); Lt/Le test min, Gt/Ge test max, Between: NOT (max < lo OR min > hi)")
    }
}

/// Verbatim copy — the honest baseline.
pub fn encode_raw(values: &[Value]) -> Block {
    let _ = values;
    todo!("Block::Raw, values: values.to_vec()")
}

/// Every distinct value (Null included) lands in the dictionary once; each
/// value becomes its u16 code. BTreeMap<Value, u16> for the lookup — never
/// HashMap on wasm.
pub fn encode_dict(values: &[Value]) -> Block {
    let _ = values;
    todo!("walk once: look up each value in a BTreeMap<Value, u16>; new values push onto dict and take the next code; codes[i] = dict index of values[i]")
}

/// Maximal runs: walk once, extend the tail run while the value repeats.
pub fn encode_rle(values: &[Value]) -> Block {
    let _ = values;
    todo!("one pass: if runs.last() holds an equal value, bump its count, else push (value, 1) — adjacent runs never hold equal values, so a constant block is ONE run")
}

/// The smallest of the three encodings by the pinned byte sizes (module
/// header). Ties: your call.
pub fn choose_encoding(values: &[Value]) -> Block {
    let _ = values;
    todo!("size all three by the pinned formula (value: Null 1, Int 9, Text 3+len; Raw 4+Σv; Dict 6+Σdict+2·codes; Rle 6+Σ(v+4)) and return the smallest")
}

/// Byte-exact inverse of every encoder: decode(encode(x)) == x for every
/// block, NULLs included.
pub fn decode(block: &Block) -> Vec<Value> {
    let _ = block;
    todo!("Raw clones; Dict maps each code through dict; Rle expands each (value, count) — the count total is implicit in every form")
}

/// rows, nulls, and min/max over the NON-NULL values of one block.
pub fn zone_of(values: &[Value]) -> Zone {
    let _ = values;
    todo!("one pass: count rows and NULLs; min/max track the non-NULL extremes (all-NULL → both None)")
}

/// The column store: named columns, each a vector of compressed blocks with
/// one zone apiece. Block i of every column covers the same rows
/// [i*BLOCK, (i+1)*BLOCK) — that alignment is what lets a mask computed on
/// one column select from another. (A BTreeMap<String, _> of columns works
/// well; HashMap does not exist on wasm.)
pub struct ColumnStore {
    // TODO(you): your state here — per column: the compressed blocks and
    // their zones.
    _priv: (),
}

impl ColumnStore {
    pub fn new() -> Self {
        todo!()
    }

    /// Split into BLOCK-sized blocks, compute each block's zone, compress
    /// each block with choose_encoding. The harness always adds
    /// equal-length columns in the same row order.
    pub fn add_column(&mut self, name: &str, values: &[Value]) {
        let _ = (name, values);
        todo!("values.chunks(BLOCK): zone_of each chunk, choose_encoding each chunk; store under name")
    }

    /// One zone per block, in block order (empty for an unknown column) —
    /// the checker's window into your zone maps.
    pub fn zones(&self, col: &str) -> Vec<Zone> {
        let _ = col;
        todo!()
    }

    /// The stored blocks of a column (empty for an unknown column) — the
    /// compression checker's window into your store.
    pub fn blocks(&self, col: &str) -> &[Block] {
        let _ = col;
        todo!()
    }

    /// The vectorized filter + sum — the protocol is pinned in the module
    /// header: zone check → decode filter block → selection mask → decode
    /// the sum block only when the mask is non-empty. Returns
    /// (rows_matched, sum, blocks_read); &mut self because real engines
    /// keep scan statistics here — yours may simply not.
    pub fn scan_filter_sum(
        &mut self,
        col_filter: &str,
        pred: &Pred,
        col_sum: &str,
    ) -> (u64, i128, u32) {
        let _ = (col_filter, pred, col_sum);
        todo!("per block: may_match? → decode filter (+1) → mask → empty? skip sum : decode sum (+1) and add non-NULL Ints at masked positions; col_filter == col_sum decodes once; predicates never match NULL")
    }
}
