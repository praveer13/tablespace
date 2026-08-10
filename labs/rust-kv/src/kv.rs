//! kv.rs — forge lab 00 · THE ONLY FILE YOU EDIT
//!
//! Mission: a key-value store small enough to hold in your head — and a
//! file that does not compile. That is not a broken lab; that IS the lab.
//! Five deliberate errors stand between you and `cargo test`, each one a
//! single Rust move you will use in every lab from here on. The compiler is
//! the tutor: run `cargo test`, read the first error the way you would read
//! a code review from someone pedantic and always right, apply the fix it
//! suggests, and understand WHY the rule exists before you rerun.
//!
//! When the crate finally builds, the suite runs — and the first check
//! (basics) should pass immediately, because your five fixes just finished
//! get/put/delete. Two `todo!()`s remain; those are the second half:
//!
//!   * `cas(key, expected, new)` — compare-and-set, the one-decision write:
//!     install `new` iff the key's current value equals `expected`, where
//!     `expected: None` claims "the key must be ABSENT" (create-if-missing).
//!     Return whether the write happened. A refused cas changes nothing.
//!   * `scan_prefix(prefix)` — every (key, value) pair whose key starts with
//!     `prefix`, in key order. The map is sorted (BTreeMap), so this is a
//!     range walk, not a filter-everything pass.
//!
//! The contract for the three ops your fixes complete:
//!
//!   * `get(key)`        — Some(value) if the key is live, None if absent.
//!   * `put(key, value)` — insert or overwrite; returns the PREVIOUS value
//!                         (None if the key is new).
//!   * `delete(key)`     — evict; true if the key was there, false if not.
//!
//! Labs 01–06 assume you can read Option, &mut, and ownership the way you
//! read assignment. This file is where that fluency gets built.

use std::collections::BTreeMap;

/// The whole store: one ordered map. No pages, no log, no versions yet —
/// labs 01–04 add exactly those, one at a time.
pub struct Kv {
    map: BTreeMap<String, String>,
}

/// What a read found: either the value, or proof the key was never there.
/// Absence is a VALUE in a storage engine, not an exception — hold that
/// thought; later labs add a third reading (a tombstone: "was here, was
/// deleted") to this same question.
enum Lookup {
    Hit(String),
    Miss,
}

impl Kv {
    /// An empty store.
    pub fn new() -> Self {
        Kv { map: BTreeMap::new() }
    }

    /// The raw read, before `get` wraps it for the outside world.
    fn lookup(&self, key: &str) -> Lookup {
        // TODO(you) #1 — fix me: a match is a proof that you considered
        // EVERY case. This one says what a present key means and stays
        // silent about an absent one — and Rust refuses to guess on your
        // behalf. The compiler lists exactly what is not covered; the
        // missing case is what `Miss` is FOR.
        match self.map.get(key) {
            Some(v) => Lookup::Hit(v.clone()),
        }
    }

    /// The value under `key`, or proof of absence.
    pub fn get(&self, key: &str) -> Option<String> {
        // TODO(you) #2 — fix me: `get` promises Option<String>, and the Hit
        // arm hands back a bare String. The compiler prints the exact type
        // it expected and the one it got. Understand WHY: "nothing was
        // there" and "something was there" are different facts, and the
        // return type forces you to say which one happened.
        match self.lookup(key) {
            Lookup::Hit(v) => v,
            Lookup::Miss => None,
        }
    }

    /// Insert or overwrite; returns the previous value, if any.
    pub fn put(&mut self, key: &str, value: &str) -> Option<String> {
        let k = key.to_string();
        let old = self.map.insert(k, value.to_string());
        // TODO(you) #3 — fix me: `k` MOVED into the map on the line above,
        // and this sanity check tries to borrow it anyway. The compiler
        // names both the move and the later use. Understand WHY: a value has
        // exactly one owner at a time, and the map owns that String now.
        // (The fix the compiler hints at gives the map its OWN copy.)
        debug_assert!(self.map.contains_key(&k), "a key we just wrote must be findable");
        old
    }

    // TODO(you) #4 — fix me: deleting mutates the map, but this receiver
    // swears it touches nothing. `&self` is a shared borrow — many readers,
    // no writers — so mutation through it is forbidden by construction. The
    // compiler catches the contradiction and names the one token to add.
    /// Evict `key`; true if it was there, false if it was not.
    pub fn delete(&self, key: &str) -> bool {
        // TODO(you) #5 — fix me: the `if` below reassigns `gone`, and Rust
        // makes you opt in to reassignment with one word. Understand WHY:
        // bindings are immutable by default, so a variable that varies is a
        // decision you declare — never an accident that happens to you.
        let gone = false;
        if let Some(_evicted) = self.map.remove(key) {
            gone = true;
        }
        gone
    }

    /// Compare-and-set: install `new` under `key` iff the key's current
    /// value equals `expected`; `expected: None` means "the key must be
    /// absent". Returns whether the write happened. This one primitive is
    /// what every later lab builds coordination on — lab 04's write-write
    /// conflict check is cas wearing a transaction costume.
    pub fn cas(&mut self, key: &str, expected: Option<&str>, new: &str) -> bool {
        let _ = (key, expected, new);
        todo!("read the current value, compare with expected (None = must be absent), write only on match")
    }

    /// All (key, value) pairs whose key starts with `prefix`, in key order.
    /// Your first scan — the seed of lab 02's range queries and lab 05's
    /// iterators. The BTreeMap keeps keys sorted, so walk the range from
    /// `prefix` onward and stop at the first key that no longer matches.
    pub fn scan_prefix(&self, prefix: &str) -> Vec<(String, String)> {
        let _ = prefix;
        todo!("walk the sorted map from prefix onward; stop at the first key that does not start with it")
    }
}
