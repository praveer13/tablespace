//! page.rs — forge lab 01 · THE ONLY FILE YOU EDIT
//!
//! Mission: an 8192-byte slotted page — the atom every later lab builds on.
//! Lab 02 hangs a B+tree on these pages; lab 03 writes them to disk. That is
//! why ALL state lives in the page's own bytes: no side tables, no heap
//! shadows. One `[u8; 8192]` buffer is your entire struct.
//!
//! The layout (integers little-endian):
//!
//! ```text
//!   [0,2)   slot_count    u16 — slots in the array, live + dead
//!   [2,4)   records_start u16 — record area is [records_start, 8192)
//!   [4,6)   dead_bytes    u16 — record bytes marked dead, awaiting defrag
//!   [6,8)   reserved      u16 — keep 0 (later labs: page type, LSN)
//!   [8, ..) slot array, growing DOWN toward the records; slot i at 8 + i*6:
//!             [offset u16][len u16][flags u16]    flags bit 0 = LIVE
//!   [records_start, 8192)  record bytes, growing UP from the end
//!
//!   contiguous free region = [8 + slot_count*SLOT_SIZE, records_start)
//! ```
//!
//! The contract (the harness grades THIS, to the byte):
//!
//!   * `new()`      — an empty page: slot_count 0, records_start 8192,
//!                    dead_bytes 0. free_space() = 8192 − 8 = 8184.
//!   * `insert(r)`  — records are ≥ 1 byte; empty → None. Claims r.len()
//!                    bytes from the contiguous region PLUS one slot: if a
//!                    dead slot (tombstone) exists, reuse the LOWEST one
//!                    (claims no slot bytes); otherwise append to the slot
//!                    array (claims SLOT_SIZE bytes). Record bytes are copied
//!                    to [records_start − len, records_start), then
//!                    records_start drops. Returns the slot id, or None —
//!                    never a panic — when the contiguous region is too
//!                    small. Dead space is NOT allocatable here; only
//!                    defrag() makes it contiguous.
//!   * `read(slot)` — the live record's exact bytes; None for dead/invalid.
//!   * `delete(slot)` — clears the LIVE flag, adds len to dead_bytes,
//!                    returns true. Already-dead or invalid slot: false, no
//!                    change. The record's bytes stay put until defrag().
//!   * `defrag()`   — slides live records up to the top of the page, rewrites
//!                    their slot offsets, zeroes dead_bytes. LIVE SLOT IDS
//!                    NEVER CHANGE and their reads return identical bytes.
//!                    Tombstones stay in the array (otherwise live ids would
//!                    shift). Special case: with zero live records nothing
//!                    points into the page — reset it to mint condition.
//!   * `free_space()` — contiguous + dead_bytes: every byte that is not a
//!                    live record or a slot. Accounting is data: maintain the
//!                    header fields on each op, do not scan.
//!   * `slot_range(slot)` — for a live slot, (start, end) byte offsets of
//!                    its record inside the page; None for dead/invalid.
//!                    The overlap checker's window — and your best debugging
//!                    friend.
//!
//! The invariant the storm check keeps proving:
//!
//! ```text
//!   8192 = 8 header + slot_count*6 slots + live records + dead_bytes + contiguous
//! ```
//!
//! and no two live records' byte ranges ever intersect.

/// The one fixed truth of the whole course: a page is 8 KiB.
pub const PAGE_SIZE: usize = 8192;
/// Header: slot_count + records_start + dead_bytes + reserved.
pub const HEADER_SIZE: usize = 8;
/// One slot-directory entry: offset + len + flags, three little-endian u16s.
pub const SLOT_SIZE: usize = 6;

pub struct Page {
    // TODO(you): your state here — one [u8; PAGE_SIZE] buffer, nothing else.
    // The harness checks size_of::<Page>() == PAGE_SIZE: if it doesn't fit
    // in the page, it doesn't exist.
    _priv: (),
}

impl Page {
    pub fn new() -> Self {
        todo!("a zeroed page with records_start = PAGE_SIZE")
    }

    pub fn insert(&mut self, record: &[u8]) -> Option<u16> {
        let _ = record;
        todo!("reuse the lowest tombstone or append a slot; copy the record to the top of the contiguous region; None when it does not fit")
    }

    pub fn read(&self, slot: u16) -> Option<&[u8]> {
        let _ = slot;
        todo!("live slot → &buf[offset..offset+len]; dead/invalid → None")
    }

    pub fn delete(&mut self, slot: u16) -> bool {
        let _ = slot;
        todo!("clear LIVE, dead_bytes += len; false for dead/invalid")
    }

    pub fn defrag(&mut self) {
        todo!("slide live records to the top, remap slot offsets, dead_bytes = 0; empty page → reset to mint")
    }

    pub fn free_space(&self) -> usize {
        todo!("contiguous + dead_bytes — from the header fields, not a scan")
    }

    pub fn slot_range(&self, slot: u16) -> Option<(usize, usize)> {
        let _ = slot;
        todo!("live slot → (offset, offset + len); dead/invalid → None")
    }
}
