//! pool.rs — forge lab 07 · THE ONLY FILE YOU EDIT
//!
//! Mission: the buffer pool — the component every executor, index, and log
//! asks for pages (T0.L3). A fixed set of frames, a page table, pin counts,
//! dirty bits, and the replacer that decides who leaves. This is CMU
//! 15-445's opening project on our terms: the replacer is LRU-K, graded on
//! the exact backward k-distance semantics of O'Neil's 1993 paper (T0.L5).
//!
//! The machinery:
//!
//! ```text
//!   disk        NUM_PAGES pages; page i's bytes are page_image(i) — a pure
//!               function of i, so the harness can verify any frame's bytes
//!               against its own copy of the disk. GIVEN below: not yours.
//!   frames      `frames` page-sized slots, fixed at new(). A frame holds
//!               one page's bytes, a pin count, and a dirty bit.
//!   page table  page id -> frame, for RESIDENT pages only. It must never
//!               lie: evicted pages leave it, loaded pages enter it.
//!   pin count   outstanding borrows of a frame. pin > 0 = unevictable,
//!               full stop — whatever the replacer's arithmetic says.
//!   dirty bit   set when a borrower reports a write (unpin(page, true)).
//!               A dirty victim must be written back; a clean one is just
//!               dropped. Dirty clears ONLY on writeback (flush or evict).
//! ```
//!
//! THE REPLACER — LRU-K with K = 2, pinned here to the unit. The harness
//! grades exactly this:
//!
//!   * A logical clock ticks ONCE per fetch() call — hit, miss, or refused.
//!     Every fetch() call records a touch of that page at the new timestamp
//!     (yes, even a fetch that ends in PoolExhausted: the reference happened,
//!     the page just never got in).
//!   * The history keeps each page's last TWO touch timestamps, and it
//!     OUTLIVES residency: an evicted page's timestamps stay in the history
//!     list (O'Neil's history-vs-buffer-list discipline). This lab never
//!     prunes it — 512 pages × 2 stamps is cheap; the paper's correlated
//!     reference period is the production refinement you may skip.
//!   * Backward k-distance of a page = now − its 2ND-MOST-RECENT touch.
//!     Victim = the UNPINNED page with the LARGEST distance:
//!       - a page touched fewer than 2 times has distance +∞ and evicts
//!         ahead of EVERY fully-historied page; among the +∞ pages the one
//!         whose LAST touch is oldest dies first (FIFO in the limit case);
//!       - among fully-historied pages, the one whose 2nd-most-recent touch
//!         is oldest dies first.
//!   * Example (K=2, pool full, all unpinned): A touched at 1,2 — B at 3 —
//!     C at 4,5. The victim is B (one touch → +∞), even though A's LAST
//!     touch is the oldest in the pool. Plain LRU kills A; LRU-K kills the
//!     page that never proved it would come back. That one-touch bias is
//!     the entire scan_resistance story.
//!
//! The contract per op (the harness grades THIS, to the unit):
//!
//!   * `new(frames)` — `frames` empty frames, empty page table, clock 0,
//!     all four counters 0.
//!   * `fetch(page)` — record the touch (see above), then:
//!       HIT  (page resident): pin += 1, hits += 1, return the frame index.
//!       MISS: if an empty frame exists, take it; else pick the LRU-K
//!       victim among pin == 0 frames — a dirty victim is written back
//!       (writes += 1) — drop it from the page table, evictions += 1.
//!       Then load page_image(page) into the frame (reads += 1), pin = 1,
//!       dirty = false, page table gains the page, return the frame index.
//!       Initial fills count as reads but NOT as evictions.
//!       If every frame holds a pinned page there is no victim: return
//!       Err(PoolExhausted). The pool changes nothing but the recorded
//!       touch — no eviction, no read, no hit. NEVER panic.
//!   * `unpin(page, dirty)` — one borrow ends: pin -= 1, and if `dirty` is
//!     true the frame's dirty bit is SET (a false argument never CLEARS an
//!     already-dirty frame — only writeback does). Returns true. If the
//!     page is not resident or its pin is already 0: false, no change — a
//!     double release is a caller bug you must refuse, not absorb.
//!   * `flush(page)` — writeback without eviction: resident + dirty →
//!     writes += 1, dirty clears, returns true. Resident + clean → nothing
//!     happens, still true (the write is only owed when dirty). A page that
//!     is not resident → false, no change.
//!   * `frame_page(frame)` — Some(page id) if the frame holds a page, None
//!     for an empty frame or an out-of-range index. The checker's window
//!     into your page table.
//!   * `frame_content(frame)` — Some(&frame's bytes) for an occupied frame,
//!     None otherwise. The harness diffs these bytes against its own disk.
//!   * `hits()` / `reads()` / `writes()` / `evictions()` — the counters you
//!     maintained. Definitions, exactly:
//!       hits      = fetches that found their page resident
//!       reads     = disk reads = pages loaded (initial fills + post-evict)
//!       writes    = writebacks = dirty evictions + dirty flushes
//!       evictions = victim replacements (initial fills are NOT evictions)
//!     so: hits + reads + refused = total fetch calls, always.
//!
//! Page ids are 0..NUM_PAGES by contract — trust them, the way a real pool
//! trusts its own page table. What you may NOT do is panic: every misuse
//! above has a defined false/None/Err answer.
//!
//! The invariant the storm check keeps proving (against a reference pool,
//! after every one of 2000 seeded events):
//!
//! ```text
//!   identical traces → identical resident sets, identical counters,
//!   and no page with an outstanding pin is ever evicted
//! ```
//!
//! Implementation notes: use BTreeMap for the page table and the history —
//! NEVER HashMap (std's RandomState has no entropy source on
//! wasm32-unknown-unknown; it panics at runtime). Timestamps are u64. K is
//! 2 — fixed, not a parameter; two slots of history per page is the whole
//! data structure.

/// The disk is 512 pages. Page ids are 0..NUM_PAGES.
pub const NUM_PAGES: u32 = 512;

/// Every page (and frame) is 4 KiB.
pub const PAGE_BYTES: usize = 4096;

/// GIVEN — the storage device, not the lab. Page `i`'s content is a pure
/// function of `i` (content-addressable): the pool below loads it on a miss,
/// and the harness keeps its own copy to verify your frames' bytes. Do not
/// edit this; the fetch_pin check diffs it against the harness's disk.
pub fn page_image(page: u32) -> [u8; PAGE_BYTES] {
    let mut img = [0u8; PAGE_BYTES];
    // splitmix64 stream seeded by the page id — deterministic, no entropy
    let mut s = (page as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    for chunk in img.chunks_mut(8) {
        s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = s;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        chunk.copy_from_slice(&z.to_le_bytes());
    }
    img
}

/// The one runtime failure a pool is allowed to have. Panics are forbidden:
/// a full pool of pinned frames is backpressure, not a bug — the caller
/// holds too many pins and must release some and retry.
// (in the untouched template nothing constructs this yet — fetch is
// todo!() — but the harness already pattern-matches it)
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchError {
    /// Every frame holds a pinned page — no victim exists. The pool changed
    /// nothing but the recorded touch of the requested page.
    PoolExhausted,
}

pub struct BufferPool {
    // TODO(you): the frames (page bytes + pin + dirty each), the page table
    // (BTreeMap page -> frame), the per-page history (BTreeMap page -> last
    // two touch timestamps — it survives eviction), the logical clock, and
    // the four counters. Every stat is a number you MAINTAIN, not a scan.
    _priv: (),
}

impl BufferPool {
    pub fn new(frames: usize) -> Self {
        let _ = frames;
        todo!("`frames` empty frames, empty page table, empty history, clock 0, counters 0")
    }

    pub fn fetch(&mut self, page: u32) -> Result<usize, FetchError> {
        let _ = page;
        todo!("tick + record touch; hit → pin+1, hits+1; miss → free frame or LRU-K victim (dirty victim writes back), load, pin=1, reads+1; all pinned → Err(PoolExhausted)")
    }

    pub fn unpin(&mut self, page: u32, dirty: bool) -> bool {
        let _ = (page, dirty);
        todo!("resident and pinned → pin-1, set dirty if told (never clear); else false, no change")
    }

    pub fn flush(&mut self, page: u32) -> bool {
        let _ = page;
        todo!("resident+dirty → writes+1, clear dirty, true; resident+clean → true; stranger → false")
    }

    pub fn frame_page(&self, frame: usize) -> Option<u32> {
        let _ = frame;
        todo!("Some(page) for an occupied frame, None for empty/out-of-range")
    }

    pub fn frame_content(&self, frame: usize) -> Option<&[u8; PAGE_BYTES]> {
        let _ = frame;
        todo!("Some(&frame bytes) for an occupied frame, None otherwise")
    }

    pub fn hits(&self) -> u64 {
        todo!("fetches that found their page resident")
    }

    pub fn reads(&self) -> u64 {
        todo!("pages loaded from disk (initial fills + post-eviction loads)")
    }

    pub fn writes(&self) -> u64 {
        todo!("writebacks: dirty evictions + dirty flushes")
    }

    pub fn evictions(&self) -> u64 {
        todo!("victim replacements — initial fills are NOT evictions")
    }
}
