//! hnsw.rs — forge lab 06 · THE ONLY FILE YOU EDIT
//!
//! Mission: a mini-HNSW — the approximate-nearest-neighbor index behind the
//! vector boom — plus the tiny planner rule that decides when reaching for it
//! is actually worth it. Every earlier lab graded something exact (bytes,
//! order, durability, visibility). This one grades APPROXIMATION, and the
//! honest way to grade approximation is to measure: the harness seeds a
//! clustered corpus, computes exact top-10 ground truth by brute force, and
//! checks your recall within a calibrated band, your latency against the
//! exact scan, and your operating point against a naive build.
//!
//! ══════════════════════════ THE COST MODEL ══════════════════════════
//!
//! Latency is a DISTANCE-COMPUTATION COUNT, never wall-clock. Wall-clock
//! lies differently on every machine and means nothing inside wasm; a count
//! of distance evaluations is exact and reproducible everywhere. The harness
//! hands your search a `&mut Meter`; EVERY distance evaluation your search
//! performs must go through `meter.dist(a, b)`. A brute-force scan of N
//! vectors costs exactly N on the meter — that is the baseline your index
//! must beat. Build-time distances are free in this model (`insert` receives
//! no meter — open a scratch `Meter` and spend away); the bill comes due at
//! query time.
//!
//! ═══════════════════════════ THE GRAPH ══════════════════════════════
//!
//! A skip list reincarnated as a graph: sparse express lanes on top, dense
//! streets at layer 0. Every node spans layers 0..=level, where level is
//! sampled at insert with geometric decay — flip a 1-in-m coin on your
//! internal xorshift, level up while it lands heads (integer math only, so
//! the build is bit-deterministic given the same insert sequence). One node
//! is the ENTRY POINT: the most recent node to reach a new maximum level.
//!
//! Hard rules (the graph_invariants check enforces every one):
//!
//!   * degree caps — at most 2*m neighbors at layer 0, at most m at any
//!     higher layer;
//!   * MAX_LAYERS — clamp sampled levels so a node never spans more than
//!     MAX_LAYERS layers;
//!   * no self-edges, no duplicate edges, no dangling ids;
//!   * edges are SYMMETRIC: if v is a neighbor of u at layer l, then u is a
//!     neighbor of v at layer l. When adding an edge overfills a list past
//!     its cap, evict the FARTHEST entry (ties: the higher id) and remove
//!     the reverse edge too — symmetry is an invariant, not a hope;
//!   * every node is reachable from the entry point at layer 0 (insert must
//!     connect every node to at least one existing node at layer 0).
//!
//! ═══════════════════════════ THE RECIPES ════════════════════════════
//!
//! `Hnsw::new(m, ef_construction, seed)` — m sets the degree caps and the
//! level coin; ef_construction is the build-time beam width; seed your
//! xorshift from `seed` so the same insert sequence always builds the same
//! graph. The harness inserts ids 0,1,2,… in order — you may rely on it.
//!
//! `insert(id, vec)`:
//!   1. sample the node's level; the very first node becomes the entry point;
//!   2. greedy descent — from the entry point, walk layers top..=level+1
//!      with a beam of 1 (move to any strictly closer neighbor, repeat);
//!   3. at layers min(level, top)..=0, beam-search with ef_construction,
//!      then connect to the CLOSEST candidates, up to the layer's cap —
//!      linking both directions with the prune rule above;
//!   4. if the new level beats the current maximum, this node is the new
//!      entry point.
//!
//! `search(meter, query, k, ef_search)`:
//!   greedy descent from the entry point through the layers above 0
//!   (beam 1), then one beam search at layer 0 with ef = max(ef_search, k).
//!   Return exactly k results — (id, distance) — sorted by distance
//!   ascending, no duplicates. Every distance through the meter: the
//!   latency_win and curve checks read it.
//!
//! `choose_index(n_rows, dim, k, est_index_cost, est_scan_cost)` — the
//! planner rule, one honest line: pick the index iff est_index_cost is
//! STRICTLY less than est_scan_cost. A tie goes to the scan — the index
//! must pay for itself. (n_rows, dim, k are context for a fancier model;
//! the harness's verdict uses the two estimates.)
//!
//! ════════════════════════════ BOUNDS ════════════════════════════════
//!
//! A buggy graph must fail a check, never hang the harness: cap every
//! greedy descent and every beam search at 10 * len() pops.

/// Clamp for sampled levels: no node ever spans more than MAX_LAYERS layers.
pub const MAX_LAYERS: usize = 16;

/// The cost model, given. DO NOT CHANGE: every search-time distance
/// evaluation goes through `dist`, and the harness reads the counter back.
/// `dist` returns the SQUARED L2 distance (monotonic with L2, one sqrt
/// cheaper) and bills you one distance computation.
pub struct Meter {
    count: u64,
}

impl Meter {
    pub fn new() -> Meter {
        Meter { count: 0 }
    }

    /// Squared L2 distance between equal-length vectors — and the bill: +1.
    pub fn dist(&mut self, a: &[f32], b: &[f32]) -> f32 {
        self.count += 1;
        a.iter().zip(b).map(|(x, y)| (x - y) * (x - y)).sum()
    }

    /// Distance computations so far. The harness's window into your search.
    pub fn count(&self) -> u64 {
        self.count
    }
}

impl Default for Meter {
    fn default() -> Meter {
        Meter::new()
    }
}

pub struct Hnsw {
    // TODO(you): your state here. You will want, per node: the vector, its
    // level, and one neighbor list per layer — plus the entry point, m,
    // ef_construction, and your xorshift state.
    _priv: (),
}

impl Hnsw {
    pub fn new(m: usize, ef_construction: usize, seed: u64) -> Self {
        let _ = (m, ef_construction, seed);
        todo!("store m/ef_construction, seed the xorshift, entry point None")
    }

    pub fn insert(&mut self, id: u32, vec: Vec<f32>) {
        let _ = (id, vec);
        todo!("sample level; greedy descent; beam-search per layer; connect closest up to cap, symmetric with farthest-first pruning; crown a new entry point on a new maximum level")
    }

    pub fn search(&self, meter: &mut Meter, query: &[f32], k: usize, ef_search: usize) -> Vec<(u32, f32)> {
        let _ = (meter, query, k, ef_search);
        todo!("greedy descent above layer 0, one ef=max(ef_search,k) beam at layer 0; exactly k results sorted by distance — every distance through the meter")
    }

    /// Nodes inserted so far.
    pub fn len(&self) -> usize {
        todo!()
    }

    /// How many layers node `id` spans (1 = layer 0 only). 0 for unknown ids.
    pub fn layers_of(&self, id: u32) -> usize {
        let _ = id;
        todo!()
    }

    /// The current entry point: the node at the maximum level. None when empty.
    pub fn entry_point(&self) -> Option<u32> {
        todo!()
    }

    /// The neighbor ids of node `id` at `layer` (empty if the node does not
    /// reach that layer). The invariant checker's window into your graph.
    pub fn neighbors(&self, id: u32, layer: usize) -> Vec<u32> {
        let _ = (id, layer);
        todo!()
    }
}

/// The planner rule: use the index iff it is STRICTLY cheaper than the scan.
pub fn choose_index(n_rows: usize, dim: usize, k: usize, est_index_cost: f64, est_scan_cost: f64) -> bool {
    let _ = (n_rows, dim, k, est_index_cost, est_scan_cost);
    todo!("est_index_cost < est_scan_cost — strictly; a tie is a scan")
}
