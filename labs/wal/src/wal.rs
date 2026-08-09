//! wal.rs — forge lab 03 · THE ONLY FILE YOU EDIT
//!
//! Mission: a write-ahead log guarding a tiny key/value state machine — the
//! durability core of every database you will ever open. Labs 01–02 built
//! the bytes and the structure; this one survives its own death. The rule
//! is one sentence:
//!
//! ```text
//!   no state change may happen before the log record describing it is
//!   durable
//! ```
//!
//! The machine (PROVIDED below — do not edit; code against it):
//!
//!   * `Disk`  — the durable log file. `disk.append(&record)` is the fsync:
//!     once it returns, those bytes survive `crash()`. Between your crash()
//!     and recover() the harness's crash claw reaches straight into
//!     `disk.bytes`: it truncates the file to a seeded byte boundary
//!     (mid-record, if it likes) and flips payload bytes. That is the
//!     disaster you are graded against. The disk is also the logic
//!     analyzer: every append lands on the event tape as `Flushed(lsn)`.
//!   * `Store` — the volatile state: a map behind an instrumented wrapper.
//!     `store.set` / `store.remove` APPLY a record (the tape sees
//!     `Applied(lsn)`); `store.clear()` is death itself (`Crashed`). One
//!     store shares one analyzer with one disk — wire them in `new()`:
//!
//!     ```text
//!         let disk = Disk::new();
//!         let store = disk.store();
//!     ```
//!
//! The record format — pinned, little-endian, ONE `disk.append` call per
//! record (the harness walks these bytes, so the layout is the contract):
//!
//! ```text
//!   [0,8)    lsn   u64 — from 1, strictly +1 per record
//!   [8,9)    op    u8  — OP_PUT | OP_DEL | OP_COMMIT
//!   [9,11)   klen  u16
//!   [11,13)  vlen  u16 — 0 for OP_DEL and OP_COMMIT
//!   [13, ..)         key bytes   (klen; empty for OP_COMMIT)
//!   ..             value bytes (vlen)
//!   tail 4B  crc32 LE — over every preceding byte of this record
//! ```
//!
//! The ops (the harness grades THESE):
//!
//!   * `new()`         — an empty log (an empty disk) and an empty state;
//!                       `lsn`, the next record number, starts at 1.
//!   * `put(k, v)`     — the disciplined path, in order:
//!                         1. stamp the record with the next lsn,
//!                         2. `disk.append` — the record is now DURABLE,
//!                         3. `store.set(lsn, k, v)` — and only now visible.
//!                       When put returns, `get(k)` answers `Some(v)`.
//!   * `delete(k)`     — same discipline with an OP_DEL tombstone (vlen 0,
//!                       no value bytes), then `store.remove`. The tombstone
//!                       is appended even if k was never present.
//!   * `get(k)`        — `store.get(k)`; reads are just reads.
//!   * `commit_tick()` — append an OP_COMMIT record (klen 0, vlen 0) and
//!                       return ITS lsn. The commit record is the boundary:
//!                       everything before it is committed, everything
//!                       after the last one is not.
//!   * `crash()`       — the machine dies: `store.clear()` drops the
//!                       volatile state and you FORGET the lsn high-water
//!                       mark (lsn = 0). The disk is the sole survivor —
//!                       never touch `disk.bytes` here. The Wal is dead
//!                       until `recover()`.
//!   * `recover()`     — replay the log, deterministically:
//!                         1. walk the records in order; a record is VALID
//!                            only if it is complete (header + payload +
//!                            checksum inside the file) AND its crc32
//!                            matches. STOP at the first invalid record —
//!                            a torn or corrupt tail forfeits everything
//!                            after it: the log is a sequence, not a set.
//!                         2. apply in LSN order, but only COMMITTED work:
//!                            buffer puts/deletes in a pending list, drain
//!                            it into the store on each OP_COMMIT, and drop
//!                            whatever is still pending at the stop point —
//!                            uncommitted work never resurrects.
//!                         3. truncate `disk.bytes` after the last VALID
//!                            record, so future records never land behind
//!                            a hole.
//!                         4. `lsn` = last valid lsn + 1 (1 if none): the
//!                            high-water mark is rebuilt from the log, not
//!                            remembered.
//!                       Must be IDEMPOTENT: recover(); recover() changes
//!                       nothing — crashing mid-recovery is a Tuesday.
//!
//! Keys and values fit in u16 lengths; the harness keeps them small.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

/* ============ PROVIDED: the simulated machine — do not edit ============ */

/// Record types: a put, a tombstone, a commit boundary.
pub const OP_PUT: u8 = 1;
pub const OP_DEL: u8 = 2;
pub const OP_COMMIT: u8 = 3;

/// Fixed record framing: 13 header bytes + 4 checksum bytes per record.
pub const REC_HEADER: usize = 13;
pub const REC_CRC: usize = 4;

/// CRC-32 (IEEE), the simulator's checksum. Given, because the lesson is
/// the protocol, not the polynomial: over exactly the bytes you want
/// guarded — every record byte before the checksum field.
pub fn crc32(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in bytes {
        crc ^= b as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

/// One tick on the analyzer tape, in call order. The log_first check reads
/// this tape: any `Applied` that precedes its record's `Flushed` breaks the
/// WAL rule.
#[allow(dead_code)] // the template's todo!()s never fire an event — your ops will
#[derive(Clone, Copy, Debug)]
pub enum Event {
    /// `disk.append` made a record with this LSN durable.
    Flushed(u64),
    /// the state machine applied the record with this LSN.
    Applied(u64),
    /// the volatile state was dropped.
    Crashed,
}

/// The analyzer: one tape shared by one disk and one store.
type Tape = Rc<RefCell<Vec<Event>>>;

/// The durable log file — the ONLY bytes that survive a crash.
pub struct Disk {
    /// The file itself. pub precisely so the harness's crash claw can
    /// truncate and bit-flip it between crash() and recover().
    pub bytes: Vec<u8>,
    tape: Tape,
}

#[allow(dead_code)] // the template's todo!()s never touch the disk — your put/delete/commit_tick will
impl Disk {
    pub fn new() -> Disk {
        Disk { bytes: Vec::new(), tape: Rc::new(RefCell::new(Vec::new())) }
    }

    /// A volatile state machine wired to the same analyzer as this disk.
    pub fn store(&self) -> Store {
        Store { map: BTreeMap::new(), tape: Rc::clone(&self.tape) }
    }

    /// The fsync: append one full record to the file. When this returns,
    /// those bytes survive crash(). One record per call.
    pub fn append(&mut self, record: &[u8]) {
        let lsn = if record.len() >= 8 {
            u64::from_le_bytes(record[..8].try_into().unwrap())
        } else {
            0
        };
        self.bytes.extend_from_slice(record);
        self.tape.borrow_mut().push(Event::Flushed(lsn));
    }

    /// The tape so far — the harness's ordering evidence.
    pub fn events(&self) -> Vec<Event> {
        self.tape.borrow().clone()
    }
}

/// The volatile state, wrapped so every apply lands on the tape.
pub struct Store {
    map: BTreeMap<String, String>,
    tape: Tape,
}

#[allow(dead_code)] // the template's todo!()s never touch the store — your applies and replay will
impl Store {
    /// Apply a put. `lsn` is the record's own — it ties the tape's two
    /// events together.
    pub fn set(&mut self, lsn: u64, key: &str, value: &str) {
        self.map.insert(key.to_string(), value.to_string());
        self.tape.borrow_mut().push(Event::Applied(lsn));
    }

    /// Apply a tombstone. True if the key was there to remove.
    pub fn remove(&mut self, lsn: u64, key: &str) -> bool {
        let was = self.map.remove(key).is_some();
        self.tape.borrow_mut().push(Event::Applied(lsn));
        was
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.map.get(key).map(String::as_str)
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Death: the volatile state is gone. The tape remembers it happened.
    pub fn clear(&mut self) {
        self.map.clear();
        self.tape.borrow_mut().push(Event::Crashed);
    }
}

/* ================= TODO(you): the write-ahead logger ================= */

/// The logger. `disk` and `store` are pub because the harness inspects and
/// injures them — same deal as lab 02's arena. `lsn` is the NEXT record
/// number to hand out; it is volatile state, and recover() rebuilds it.
pub struct Wal {
    pub disk: Disk,
    pub store: Store,
    #[allow(dead_code)] // never read in the template — your ops stamp and rebuild it
    pub lsn: u64,
}

impl Wal {
    pub fn new() -> Self {
        todo!("Disk::new() + disk.store() share one analyzer; lsn starts at 1")
    }

    pub fn put(&mut self, key: &str, value: &str) {
        let _ = (key, value);
        todo!("stamp the lsn, encode [lsn|OP_PUT|klen|vlen|key|value|crc32], disk.append (durable!), THEN store.set — in that order")
    }

    pub fn delete(&mut self, key: &str) {
        let _ = key;
        todo!("an OP_DEL tombstone (vlen 0), same discipline: disk.append, then store.remove — appended even if the key was never present")
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        let _ = key;
        todo!("self.store.get(key) — reads are just reads")
    }

    pub fn commit_tick(&mut self) -> u64 {
        todo!("append an OP_COMMIT record (klen 0, vlen 0) and return ITS lsn — everything before it is now committed")
    }

    pub fn crash(&mut self) {
        todo!("the machine dies: store.clear() and forget the high-water mark (lsn = 0); the disk is the sole survivor — never touch disk.bytes here")
    }

    pub fn recover(&mut self) {
        todo!("replay: stop at the first torn/corrupt record (verify crc32), apply committed transactions only (pending buffer drained on each OP_COMMIT), truncate disk.bytes after the last valid record, lsn = last valid lsn + 1; running it twice changes nothing")
    }
}
