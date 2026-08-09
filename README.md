# tablespace

**The database is not a black box. Build one — page by page.**

A database-internals course that takes a backend engineer from "I've tuned
queries I couldn't explain" to having built a database from a slotted page
to a query engine: storage, indexes, WAL, MVCC, executor, planner, and a
vector index — each piece a graded Rust lab running in the browser.

- **25 lessons** across 7 tracks (T0 The Disk Contract → T6 Vectors & HNSW)
- **6 Rust labs** compiled to wasm and graded in-browser by the same checks
  `cargo test` runs — including crash-injection (the grader kills your
  module mid-write) and a deterministic transaction scheduler
- **The Engine** — a persistent world: one database assembled cumulatively
  from your own lab artifacts under a deterministic trace player
- **Crash Week** — four incident-diagnosis drills with real-shape telemetry
- Zero servers, zero accounts: progress lives in localStorage, exportable
  as JSON. Course #3 in the series, after
  [kernelspace](https://kernelspace.naigap.com) and byzantine.

## Develop

```sh
bun install
bun run dev        # vite dev server
bun run build      # tsc -b && vite build
bun run lint       # eslint
```

Labs are a Cargo workspace under `labs/` (student templates; reference
solutions live in the gitignored `labs/_solutions/`). Pack the downloadable
zips with:

```sh
python3 scripts/pack-labs.py
```

Deploy: push to `master` → GitHub Actions → GitHub Pages
(`tablespace.play.naigap.com`).

See `PLAN.md` for the full build plan and resume state.
