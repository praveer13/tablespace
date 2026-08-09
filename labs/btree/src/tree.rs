//! tree.rs — forge lab 02 · THE ONLY FILE YOU EDIT
//!
//! Mission: a B+tree over i64 keys → i64 values — the default index of every
//! database you will ever open. Lab 01 gave you the slotted page; lab 03 will
//! make structures durable. This lab is the logical core in between: keep
//! every key sorted, every leaf at the same depth, and every separator
//! honest — while the harness fires the meanest key orders it can seed.
//!
//! (The course narrative hangs this tree on pages; the grading surface is the
//! tree's LOGICAL invariants, so nodes here are plain structs in an arena.
//! The node ids you hand out are the page ids of lab 03 in waiting.)
//!
//! Capacity — pinned, so the checks can prove balance instead of hoping:
//!
//! ```text
//!   leaf:      up to LEAF_MAX = 32 records          (min LEAF_MIN = 16)
//!   internal:  up to INTERNAL_MAX = 32 separators   (min INTERNAL_MIN = 16)
//!              i.e. 33 children max, 17 min
//!   the root is exempt from the minimums
//! ```
//!
//! The separator law:
//!
//! ```text
//!   in an internal node, keys[i] === the smallest key reachable through
//!   children[i+1]. Search for k descends to children[partition_point(|&s|
//!   s <= k)]. A separator is a signpost, not a record: every record lives
//!   in a leaf, and the leaves are linked left → right for scans.
//! ```
//!
//! The ops (the harness grades THESE):
//!
//!   * `new()`      — one empty leaf, root = its id, len 0. height() == 1.
//!   * `insert(k,v)`— UPSERT: an existing key gets its value overwritten and
//!                    len does NOT move. Otherwise descend, insert in sorted
//!                    position, and split on overflow:
//!                      leaf with 33 records   → left keeps 17, right takes
//!                        16, and a COPY of the right leaf's first key goes
//!                        up (the record STAYS in the right leaf);
//!                      internal with 33 seps → left keeps 16 seps / 17
//!                        children, right takes 16 seps / 17 children, and
//!                        the MIDDLE separator moves UP — it stays in NO
//!                        child.
//!                    A split root grows a new root with one separator: the
//!                    ONLY way height increases.
//!   * `get(k)`     — the latest value written for k; None if absent.
//!   * `scan(lo,hi)`— inclusive range, ascending: start at the leaf that
//!                    would hold lo, walk `next` until a key exceeds hi.
//!                    lo > hi returns an empty vec — never a panic. A full
//!                    scan is scan(i64::MIN, i64::MAX).
//!   * `delete(k)`  — true if k existed; false (and no change) otherwise.
//!                    When a node drops below its minimum, rebalance through
//!                    the parent:
//!                      1. BORROW from the left sibling if it holds more
//!                         than the minimum; otherwise from the right if it
//!                         does. A borrow rotates one record (leaf) or one
//!                         separator + child (internal) through the parent's
//!                         separator — rewrite that separator so it stays
//!                         truthful.
//!                      2. Neither can give → MERGE: into the left sibling
//!                         if there is one, otherwise absorb the right one.
//!                         A leaf merge splices the `next` chain and drops
//!                         the parent's copy-separator; an internal merge
//!                         pulls the parent's separator DOWN between the two
//!                         key arrays. The emptied node leaves the arena
//!                         (its slot becomes None).
//!                    Merging shrinks the parent, so underflow can cascade
//!                    upward. A root left with ONE child hands that child
//!                    the crown — the ONLY way height decreases. An empty
//!                    root leaf is a legal empty tree (len 0, height 1).
//!                    Whenever a subtree's smallest key changes, refresh the
//!                    separator to its left in the parent — the law admits
//!                    no stale signposts.
//!   * `len()`      — live records: a counter you MAINTAIN, never a scan.
//!   * `height()`   — levels: 1 while the root is a leaf, +1 per root split.
//!   * `validate()` — YOUR invariant checker, and it is graded: the checks
//!                    call it after the worst storms they can seed. Walk the
//!                    arena from `root` and prove:
//!                      - occupancy within [MIN, MAX] (root exempt from MIN),
//!                      - keys strictly ascending inside every node,
//!                      - internal nodes: children == separators + 1,
//!                      - every separator truthful (the law above),
//!                      - every leaf at the SAME depth, == height(),
//!                      - the `next` chain visits every record, ascending,
//!                      - leaf records total == len.
//!                    Err("…") names the invariant and the node that broke it.
//!
//! The layout below is the contract — the harness walks your tree through
//! these pub fields, and so does your validate(). Nodes live in an ARENA,
//! addressed by NodeId, never by pointer. A merge frees a node: set its slot
//! to None (reuse it later if you like; the harness only follows ids your
//! own tree points at).

pub type NodeId = u32;

/// A leaf holds up to this many (key, value) records.
pub const LEAF_MAX: usize = 32;
/// An internal node holds up to this many separators (one more child).
pub const INTERNAL_MAX: usize = 32;
/// A non-root leaf holds at least this many records (half of max).
pub const LEAF_MIN: usize = LEAF_MAX / 2;
/// A non-root internal node holds at least this many separators.
pub const INTERNAL_MIN: usize = INTERNAL_MAX / 2;

/// All records live in leaves. `next` is the right sibling — the scan spine.
pub struct Leaf {
    pub keys: Vec<i64>,
    pub vals: Vec<i64>,
    pub next: Option<NodeId>,
}

/// Separators route, they hold no data: keys[i] is the smallest key of the
/// subtree under children[i+1]. children.len() == keys.len() + 1, always.
pub struct Internal {
    pub keys: Vec<i64>,
    pub children: Vec<NodeId>,
}

#[allow(dead_code)] // the template never constructs nodes — your new() will
pub enum Node {
    Leaf(Leaf),
    Internal(Internal),
}

pub struct BTree {
    pub nodes: Vec<Option<Node>>, // the arena; None is a freed node's tombstone
    pub root: NodeId,
    pub len: usize,
}

impl BTree {
    pub fn new() -> Self {
        todo!("one empty leaf in the arena, root = its id, len = 0")
    }

    pub fn insert(&mut self, key: i64, value: i64) {
        let _ = (key, value);
        todo!("upsert at the leaf; split leaves 17/16 promoting a COPY of the right leaf's first key, internals 16/median-up/16; a split root grows the tree one level")
    }

    pub fn get(&self, key: i64) -> Option<i64> {
        let _ = key;
        todo!("descend with partition_point(|&s| s <= key), binary-search the leaf")
    }

    pub fn scan(&self, lo: i64, hi: i64) -> Vec<(i64, i64)> {
        let _ = (lo, hi);
        todo!("empty when lo > hi; else start at lo's leaf and walk next until a key exceeds hi")
    }

    pub fn delete(&mut self, key: i64) -> bool {
        let _ = key;
        todo!("borrow left then right, else merge (into the left if there is one, else absorb the right); refresh changed separators; shrink a one-child root")
    }

    pub fn len(&self) -> usize {
        todo!("the counter you maintain on every insert/delete — never a scan")
    }

    pub fn height(&self) -> usize {
        todo!("1 while the root is a leaf, +1 per root split; every leaf sits at this depth")
    }

    pub fn validate(&self) -> Result<(), String> {
        todo!("walk the arena: occupancy in [MIN, MAX] (root exempt), strict sortedness, children == separators + 1, truthful separators, one leaf depth == height(), ascending next-chain, record count == len")
    }
}
