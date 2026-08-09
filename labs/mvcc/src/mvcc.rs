//! mvcc.rs — forge lab 04 · THE ONLY FILE YOU EDIT
//!
//! Mission: multi-version concurrency control for a key-value store —
//! versioned rows, snapshots, and the one visibility predicate that lets
//! readers never block writers. Labs 01–03 built the page, the tree, and
//! the log; this lab lets many transactions share the store at once, each
//! in its own honest world. Lab 05 gives those worlds a query language.
//!
//! The model:
//!
//! ```text
//!   WRITE never overwrites. It appends a new VERSION of the key, stamped
//!   with its creator's txn id. The old version stays for whoever can
//!   still see it.
//!
//!   begin() takes a SNAPSHOT: the current commit counter plus the set of
//!   in-flight txn ids. The snapshot never moves. commit() takes the next
//!   commit sequence number and leaves the in-flight set.
//! ```
//!
//! The visibility rule — ONE predicate, and every check in this lab grades
//! a way to get it wrong:
//!
//! ```text
//!   a version V is visible to reader T  ⇔
//!       V.creator == T                                     (your own writes)
//!     OR ( V.creator committed
//!          AND commit_seq(V.creator) ≤ T.snapshot.seq
//!          AND V.creator ∉ T.snapshot.inflight )
//! ```
//!
//! Consequences you must honor:
//!   * you ALWAYS read your own writes — your latest uncommitted version
//!     of a key is visible to you and to no one else;
//!   * a txn whose snapshot predates a commit keeps reading the OLD
//!     version forever — repeatable reads, for free;
//!   * an aborted txn's versions are gone from everyone's world — which
//!     costs nothing, because no snapshot ever saw them.
//!
//! First-writer-wins:
//!
//! ```text
//!   write(T, k, v): if the NEWEST version of k was created by ANOTHER
//!   txn that is still in flight → Err(WwConflict { key, holder }).
//!   The rejected write changes nothing; the loser may keep working and
//!   commit its OTHER keys — but its commit must not resurrect the lost
//!   write. Once the holder commits or aborts, the key is writable again.
//! ```
//!
//! The ops (the harness grades THESE):
//!
//!   * `new()`      — an empty store: no keys, no txns, commit clock 0.
//!   * `begin()`    — a fresh TxnId; its snapshot freezes the commit
//!                    counter and the set of in-flight txns, NOW. Ids
//!                    are never recycled.
//!   * `write(t,k,v)` — append a version stamped with t, or reject with
//!                    WwConflict naming the key and the holder (above).
//!                    Rewriting your OWN key just stacks another of your
//!                    versions; you read the latest back.
//!   * `read(t,k)`  — the newest version of k visible to t by the
//!                    predicate; None when no visible version exists.
//!   * `commit(t)`  — assign the next commit sequence to t and remove it
//!                    from the in-flight set. Its versions become visible
//!                    to every snapshot taken from now on.
//!   * `abort(t)`   — discard every version t created; t leaves the
//!                    in-flight set without a commit sequence.
//!
//! The layout is yours — the template pins the API, not the internals.
//! One honest layout: a `BTreeMap<String, Vec<Version>>` (one version
//! chain per key, appended newest-last, scanned in reverse) plus maps of
//! txn → snapshot and txn → commit sequence. Use BTreeMap/BTreeSet, not
//! HashMap: std's hash tables draw OS randomness that does not exist on
//! wasm32-unknown-unknown, and they panic there.
//!
//! The harness only ever passes LIVE txn ids — ones begin() handed out
//! that neither commit() nor abort() has retired. Anything else is a
//! caller bug; asserting on it is fine.

/// A transaction id, handed out by `begin()`.
pub type TxnId = u64;

/// The write-write conflict: another in-flight txn already holds an
/// uncommitted version of this key. First writer wins — you are not it.
#[allow(dead_code)] // the template never constructs one — your write() will
pub struct WwConflict {
    pub key: String,   // the contended key
    pub holder: TxnId, // the in-flight txn whose version blocks the write
}

pub struct Mvcc {
    // TODO(you): your state here — version chains per key, the live txns
    // and their snapshots, commit sequences, the id and clock counters.
    _priv: (),
}

impl Mvcc {
    pub fn new() -> Self {
        todo!("an empty store: commit clock 0, no txns, no keys")
    }

    pub fn begin(&mut self) -> TxnId {
        todo!("hand out a fresh id; freeze the commit counter and the in-flight set into its snapshot")
    }

    pub fn write(&mut self, txn: TxnId, key: &str, value: &str) -> Result<(), WwConflict> {
        let _ = (txn, key, value);
        todo!("Err(WwConflict) if the newest version's creator is ANOTHER live txn; otherwise append your own version")
    }

    pub fn read(&self, txn: TxnId, key: &str) -> Option<String> {
        let _ = (txn, key);
        todo!("the newest version that is yours — or committed at-or-before your snapshot seq and not in your in-flight set")
    }

    pub fn commit(&mut self, txn: TxnId) {
        let _ = txn;
        todo!("assign the next commit sequence; leave the in-flight set")
    }

    pub fn abort(&mut self, txn: TxnId) {
        let _ = txn;
        todo!("discard every version this txn created — as if it never ran")
    }
}
