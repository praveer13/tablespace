# SUBMISSIONS.md — the buffer-pool leaderboard

Zero servers, CI-verified. One metric: **buffer-pool hit rate on the public
trace** — 11,988 page references over 10k pages, TPC-C-shaped
(`public/traces/bp-public-trace.json`), at **32 frames**. Your replacer is
the whole game.

The board is `public/leaderboard.json`, served with the site. The bar is the
reference LRU-K: **2751 bps (27.51%)** — 3,298 hits. Beat it.

## How to compete

1. **Finish lab 07** (`buffer-pool`). All five checks green in `cargo test`
   — correctness before speed, always.
2. **Tune or replace the replacer** in `src/pool.rs`. LRU-K is the bar;
   ARC, TinyLFU, and 2Q are the obvious challengers. Everything else about
   the contract (pins, dirty writeback, counters to the unit) must keep
   passing — the checks don't move.
3. **Build the wasm:**

   ```sh
   cargo build --release --target wasm32-unknown-unknown
   ```

4. **Submit by PR.** In your fork of the tablespace repo:

   ```sh
   mkdir -p submissions
   cp target/wasm32-unknown-unknown/release/buffer_pool.wasm submissions/<user>.wasm
   ```

   plus a sidecar `submissions/<user>.json`:

   ```json
   { "user": "<user>", "notes": "ARC, scan-resistant dirty eviction" }
   ```

   `<user>` is your GitHub login (`^[a-zA-Z0-9-]{1,39}$`). One wasm + one
   json per user, files named after you. Open the PR against `master`.

5. **CI re-runs it.** The *Leaderboard Validate* workflow executes your wasm
   in a sandbox (the module imports nothing — no WASI; the runner asserts
   that and instantiates with an empty import object), re-runs the five
   checks plus the public trace at 32 frames, and fails the PR check if
   anything is red. On success its JSON result is picked up by the
   *Leaderboard Publish* workflow, which merges your entry into
   `public/leaderboard.json` on master. Humans don't copy numbers — CI does.

You can preview exactly what CI will say, before pushing:

```sh
bun scripts/leaderboard-run.ts submissions/<user>.wasm submissions/<user>.json
```

## Rules

- **One entry per user.** A new submission replaces your previous one.
- **The wasm must pass all 5 checks.** Correctness before speed: a red
  check fails the PR, no matter the hit rate.
- **Hit rate on the public trace at 32 frames is the only score.** No
  handicaps, no weighting. `hit_bps = hits * 10000 / 11988`.
- **CI proves reproducibility, not originality.** The checksum of your wasm
  is published next to your score; the trace and the harness are public, so
  anyone can re-run your module and get your number. What CI cannot prove
  is that you wrote the replacer — that part is the honor system, like the
  labs themselves. A pool that is suspiciously good on exactly this trace
  and nothing else will be noticed by the people reading your code.
- The board caps at 50 entries, sorted by hit_bps descending.

## Publish lag

The publish workflow commits `public/leaderboard.json` to master with
`[skip ci]`; the site reads the board from the deployed build. So a merged
submission appears on the site **after the next deploy** (the next push to
master, or a manual run of the deploy workflow) — not instantly.

## The two-workflow split (why your PR can't pwn the board)

- `leaderboard-validate.yml` runs **on your PR's code** with a read-only
  token. It executes your wasm (sandboxed, import-less) and emits a JSON
  artifact. That's all — no writes, no comments.
- `leaderboard-publish.yml` runs **on master's files**, triggered by the
  validate run's success. It downloads the JSON (data, not code), checks
  the PR touched `submissions/` only, merges the entry, and commits. It
  never checks out or executes PR code.

The only thing that crosses from your PR into master's writer is a JSON
file of numbers.
