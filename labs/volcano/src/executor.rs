//! executor.rs — forge lab 05 · THE ONLY FILE YOU EDIT
//!
//! Mission: a query executor for the store you have been building all
//! course. The pages (lab 01) and the tree (lab 02) are already here —
//! the harness inlines them as the `storage` module in src/lib.rs, and
//! you do NOT rebuild them. You build what runs ON TOP: the volcano pull
//! model, the most reused idea in databases. Every operator is an
//! iterator with open/next/close; a query plan is a tree of operators;
//! executing means calling next() at the root and letting the pulls
//! cascade all the way down to the scans. No operator knows or cares
//! what feeds it — that is the entire trick.
//!
//! The contract — every operator honors it:
//!
//! ```text
//!   open()   positions the operator at the start of its stream. Calling
//!            open() again RESTARTS the pass — a nested-loop join
//!            re-opens its right child once per left row, so this is not
//!            optional.
//!   next()   returns Some(row) until the stream is exhausted, then
//!            None. After None, next() must keep returning None — the
//!            stream is exhausted, not restarted.
//!   close()  ends the pass and releases the children. After close(),
//!            open() must start a clean new pass.
//! ```
//!
//! The operators (the harness grades THESE):
//!
//!   * `SeqScan::new(table)`         — every row of the table, in
//!                                     physical order, untouched.
//!   * `IndexScan::new(table, index, key)` — equality lookup through the
//!                                     table's named secondary index
//!                                     (your lab-02 tree, inlined in
//!                                     src/lib.rs): the rows whose
//!                                     indexed column = key, in the
//!                                     order the index lists their
//!                                     rowids.
//!   * `Filter::new(child, pred)`    — the child's rows for which
//!                                     pred.eval(row) is true, order
//!                                     kept.
//!   * `Project::new(child, columns)`— each row reduced to the listed
//!                                     column indices (indices into the
//!                                     CHILD's emitted rows), in the
//!                                     order given.
//!   * `NestedLoopJoin::new(left, right, join_keys)` — inner equijoin:
//!                                     for each left row, every right
//!                                     row whose key equals it. Output
//!                                     row: the left row followed by the
//!                                     right row. A left row with k
//!                                     matches contributes k rows; one
//!                                     with none contributes zero.
//!                                     NULL keys never match.
//!   * `HashAggregate::new(child, group_cols, aggregates)` — one row per
//!                                     group: the group columns' values
//!                                     (in group_cols order), then the
//!                                     aggregate results as Value::Int
//!                                     (in the order given). With no
//!                                     group columns the whole input is
//!                                     ONE group — even when the input
//!                                     is empty. Group order is yours
//!                                     (SQL promises none without
//!                                     ORDER BY; the harness sorts
//!                                     before comparing). "Hash" by
//!                                     tradition — a BTreeMap groups
//!                                     just as well, and std's HashMap
//!                                     PANICS on wasm: it draws OS
//!                                     randomness that does not exist
//!                                     there. Use BTreeMap.
//!
//! SQL's NULL rules — graded, and they differ on purpose:
//!
//! ```text
//!   WHERE:    any comparison touching NULL is UNKNOWN, and UNKNOWN is
//!             not true — `status = 'paid'` does NOT match a NULL
//!             status.
//!   GROUP BY: NULLs form ONE group, like any other value. The NULL-
//!             status orders are a group of their own.
//! ```
//!
//! The layout of each operator is yours — the template pins the API, not
//! the internals.

use crate::storage::Table;

/// One cell of a row. The harness's `storage` module builds rows from
/// these variants — keep them exactly as given.
///
/// The derived ordering exists so the harness can sort rows before
/// comparing; it is NOT SQL comparison. SQL compares only like types and
/// treats NULL as UNKNOWN — in `Pred::eval` and in the join, match on
/// the pair `(left, right)` yourself; never `a < b` on a `Value`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Value {
    Int(i64),
    Text(String),
    Null,
}

/// A row is positional: `row[i]` is the i-th column of whatever schema
/// the producing operator emits. Schemas in this lab:
///
/// ```text
///   users(id, name, age, city)           — cols 0..=3
///   orders(id, user_id, amount, status)  — cols 0..=3
///   a join emits the left row's columns followed by the right row's
/// ```
pub type Row = Vec<Value>;

/// The pull-model contract, documented in the module header.
pub trait Operator {
    fn open(&mut self);
    fn next(&mut self) -> Option<Row>;
    fn close(&mut self);
}

/// A WHERE-clause predicate over one row.
#[derive(Clone, Debug)]
pub enum Pred {
    Eq { col: usize, val: Value },
    Lt { col: usize, val: Value },
    Le { col: usize, val: Value },
    Gt { col: usize, val: Value },
    Ge { col: usize, val: Value },
    And(Box<Pred>, Box<Pred>),
}

impl Pred {
    /// SQL three-valued logic: true means KEEP the row. Any comparison
    /// touching NULL (or a type mismatch, which the harness never sends)
    /// is UNKNOWN — and UNKNOWN is not true.
    #[allow(dead_code)] // your Filter calls this; the harness grades through its own reference eval
    pub fn eval(&self, row: &Row) -> bool {
        let _ = row;
        todo!("match on self; for comparisons, match on (row[col], val) as a PAIR — (Int, Int) and (Text, Text) compare, everything else is UNKNOWN → false; And keeps a row iff both sides do")
    }
}

/// An aggregate over one group. `Count` is COUNT(*): every row counts,
/// NULLs included. `Sum(col)` sums the Int values of that column,
/// skipping NULLs. Both produce Value::Int.
#[derive(Clone, Debug)]
pub enum Agg {
    Count,
    Sum(usize),
}

/* ------------------------------- scans ------------------------------ */

pub struct SeqScan {
    // TODO(you): the table, and the cursor (one usize is enough).
    _priv: (),
}

impl SeqScan {
    pub fn new(table: Table) -> Self {
        let _ = table;
        todo!("hold the table; the cursor starts at the first row")
    }
}

impl Operator for SeqScan {
    fn open(&mut self) {
        todo!("(re)position at the first row — open() must RESTART a pass")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("clone the row at the cursor and advance; None at the end of the table, and None forever after")
    }
    fn close(&mut self) {
        todo!("nothing to release here — but a later open() must still restart cleanly")
    }
}

pub struct IndexScan {
    // TODO(you): the table, the index name, the key — and, after open(),
    // the rowids the index lists for that key, plus a cursor over them.
    _priv: (),
}

impl IndexScan {
    pub fn new(table: Table, index: &str, key: i64) -> Self {
        let _ = (table, index, key);
        todo!("hold the table, the index name, and the key")
    }
}

impl Operator for IndexScan {
    fn open(&mut self) {
        todo!("ask table.index(name) for the rowids listed under the key; position at the first (a missing key means an EMPTY stream)")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("fetch the row at the cursor's rowid via table.get(rid); advance; None when the rowids run out")
    }
    fn close(&mut self) {
        todo!("drop the rowid list; a later open() must look the key up again")
    }
}

/* --------------------------- the operators -------------------------- */

pub struct Filter {
    // TODO(you): the child and the predicate.
    _priv: (),
}

impl Filter {
    pub fn new(child: Box<dyn Operator>, pred: Pred) -> Self {
        let _ = (child, pred);
        todo!("hold the child and the predicate")
    }
}

impl Operator for Filter {
    fn open(&mut self) {
        todo!("open the child")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("pull the child until pred.eval(row) keeps a row — or the child says None")
    }
    fn close(&mut self) {
        todo!("close the child")
    }
}

pub struct Project {
    // TODO(you): the child and the column indices.
    _priv: (),
}

impl Project {
    pub fn new(child: Box<dyn Operator>, columns: Vec<usize>) -> Self {
        let _ = (child, columns);
        todo!("hold the child and the column indices")
    }
}

impl Operator for Project {
    fn open(&mut self) {
        todo!("open the child")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("pull one child row; keep exactly the listed columns, in the order given")
    }
    fn close(&mut self) {
        todo!("close the child")
    }
}

pub struct NestedLoopJoin {
    // TODO(you): both children, the join keys, and the left row whose
    // pass over the right child is in flight.
    _priv: (),
}

impl NestedLoopJoin {
    /// `join_keys` is (left column index, right column index) of the
    /// equijoin condition.
    pub fn new(left: Box<dyn Operator>, right: Box<dyn Operator>, join_keys: (usize, usize)) -> Self {
        let _ = (left, right, join_keys);
        todo!("hold both children and the join keys")
    }
}

impl Operator for NestedLoopJoin {
    fn open(&mut self) {
        todo!("open both children; pull the first left row")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("advance through the right child; a key match emits left row ++ right row (NULL keys never match). When the right child says None: close() it, open() it again, and pull the NEXT left row — forgetting that advance is an infinite loop, not a wrong answer")
    }
    fn close(&mut self) {
        todo!("close both children; forget the in-flight left row")
    }
}

pub struct HashAggregate {
    // TODO(you): the child, the group columns, the aggregates — and,
    // after open(), the materialized group rows and a cursor over them.
    _priv: (),
}

impl HashAggregate {
    pub fn new(child: Box<dyn Operator>, group_cols: Vec<usize>, aggregates: Vec<Agg>) -> Self {
        let _ = (child, group_cols, aggregates);
        todo!("hold the child, the group columns, and the aggregates")
    }
}

impl Operator for HashAggregate {
    fn open(&mut self) {
        todo!("pull the child DRY into a BTreeMap<Vec<Value>, accumulators> — grouping is a blocking operator, this is the materialization point — then position at the first group. No group columns means ONE group, even for empty input")
    }
    fn next(&mut self) -> Option<Row> {
        todo!("emit the next group: its key values, then the aggregate results as Value::Int; None when the groups run out")
    }
    fn close(&mut self) {
        todo!("drop the materialized groups")
    }
}
