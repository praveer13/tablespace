/**
 * leaderboard-run — the buffer-pool leaderboard CI runner.
 *
 *   bun scripts/leaderboard-run.ts <submission.wasm> <submission.json>
 *
 * Runs a submitted buffer-pool module through the same ABI client shape as
 * scripts/verify-wasm-lab.ts (see src/lib/wasm-lab.ts), asserts the v2
 * report, and prints ONE JSON line for the publish workflow:
 *
 *   { user, hit_bps, hits, reads, writes, evictions, sha256, valid: true }
 *
 * Sandbox: lab modules import NOTHING (no WASI, no host functions). We
 * assert that statically — WebAssembly.Module.imports must be empty — and
 * then instantiate with an empty import object, so any import request fails
 * instantiation. The module can touch only its own linear memory.
 *
 * Exit 0 + the JSON line on success; exit non-zero with a clear stderr
 * message on any failure (bad file, wrong lab, red check, missing/lying
 * metrics, bad submission.json).
 */
import { createHash } from 'node:crypto'

const [wasmPath, submissionPath] = [process.argv[2], process.argv[3]]
if (!wasmPath || !submissionPath) {
  console.error('usage: bun scripts/leaderboard-run.ts <submission.wasm> <submission.json>')
  process.exit(2)
}

const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

/* --------------------------- submission.json --------------------------- */

interface Submission {
  user: string
  notes?: string
  pr?: number | null
}

let submission: Submission
try {
  const raw: unknown = JSON.parse(await Bun.file(submissionPath).text())
  if (typeof raw !== 'object' || raw === null || typeof (raw as { user?: unknown }).user !== 'string') {
    fail('submission.json must be an object with a string "user" field.')
  }
  submission = raw as Submission
} catch (e) {
  if (e instanceof Error && e.message.startsWith('FAIL')) throw e
  fail(`submission.json unreadable (${e instanceof Error ? e.message : String(e)}).`)
}
// GitHub login rules: 1–39 chars, alnum or hyphen. One entry per user.
if (!/^[a-zA-Z0-9-]{1,39}$/.test(submission!.user)) {
  fail(`user ${JSON.stringify(submission!.user)} must match ^[a-zA-Z0-9-]{1,39}$ (a GitHub login).`)
}
const user = submission!.user

/* ----------------------- sandboxed instantiation ----------------------- */

const wasmBytes = new Uint8Array(await Bun.file(wasmPath).arrayBuffer())
const sha256 = createHash('sha256').update(wasmBytes).digest('hex')

let module_: WebAssembly.Module
try {
  module_ = new WebAssembly.Module(wasmBytes)
} catch (e) {
  fail(`not a loadable wasm module (${e instanceof Error ? e.message : String(e)}).`)
}
const imports = WebAssembly.Module.imports(module_!)
if (imports.length > 0) {
  const list = imports.map((i) => `${i.module}.${i.name} (${i.kind})`).join(', ')
  fail(`the module requests imports: ${list} — the leaderboard sandbox provides none (no WASI, no host functions).`)
}
let instance: WebAssembly.Instance
try {
  instance = new WebAssembly.Instance(module_!, {})
} catch (e) {
  fail(`instantiation with an empty import object failed (${e instanceof Error ? e.message : String(e)}).`)
}

/* --------------------- ABI client (shape of wasm-lab) ------------------ */

const ex = instance!.exports as Record<string, unknown>
const memory = ex.memory as WebAssembly.Memory | undefined
const ksRun = ex.ks_run as ((inPtr: number, inLen: number) => bigint) | undefined
if (!(memory instanceof WebAssembly.Memory) || typeof ksRun !== 'function') {
  fail('wasm loaded, but it is not a tablespace lab (missing memory/ks_run exports).')
}

let packed: bigint
try {
  packed = (ksRun as (a: number, b: number) => bigint)(0, 0)
} catch (e) {
  fail(`the module trapped while running — a panic/todo!() under the harness (${e instanceof Error ? e.message : String(e)}).`)
}
const ptr = Number(packed! >> 32n)
const len = Number(packed! & 0xffff_ffffn)
/* Read memory.buffer AFTER the call — ks_run may have grown memory. */
if (len === 0 || ptr + len > memory!.buffer.byteLength) {
  fail('lab returned an out-of-bounds report pointer — ABI violation.')
}
let report: Record<string, unknown>
try {
  report = JSON.parse(new TextDecoder().decode(new Uint8Array(memory!.buffer, ptr, len)))
} catch {
  fail('lab returned invalid JSON — ABI violation.')
}

/* ------------------------------ assertions ----------------------------- */

interface PublicTraceMetrics {
  frames: number
  refs: number
  hits: number
  hit_bps: number
  reads: number
  writes: number
  evictions: number
}

if (report!.lab !== 'buffer-pool') {
  fail(`lab is ${JSON.stringify(report!.lab)} — the leaderboard only scores "buffer-pool" modules.`)
}
if (typeof report!.version !== 'number' || report!.version < 2) {
  fail(`report version ${JSON.stringify(report!.version)} < 2 — rebuild with the current template (v2 emits leaderboard metrics).`)
}
const checks = report!.checks
if (!Array.isArray(checks) || checks.length !== 5) {
  fail(`expected exactly the 5 harness checks, got ${Array.isArray(checks) ? checks.length : 'none'}.`)
}
const red = (checks as { id?: unknown; pass?: unknown; msg?: unknown }[]).filter((c) => c.pass !== true)
if (red.length > 0) {
  fail(`correctness before speed: ${red.length}/5 checks red — ${red.map((c) => String(c.id)).join(', ')}.`)
}
const metrics = (report!.metrics as { public_trace?: PublicTraceMetrics } | undefined)?.public_trace
if (!metrics || typeof metrics !== 'object') {
  fail('report carries no metrics.public_trace — rebuild with the current v2 template.')
}
const m = metrics!
for (const k of ['frames', 'refs', 'hits', 'hit_bps', 'reads', 'writes', 'evictions'] as const) {
  if (typeof m[k] !== 'number' || !Number.isInteger(m[k]) || m[k] < 0) {
    fail(`metrics.public_trace.${k} is ${JSON.stringify(m[k])} — a non-negative integer is required.`)
  }
}
if (m.frames !== 32) {
  fail(`metrics scored at ${m.frames} frames — the leaderboard frame count is 32.`)
}
// Internal consistency: the harness counts these to the unit, so a module
// that cannot keep its own books straight is not a valid entry.
if (m.hits + m.reads !== m.refs) {
  fail(`metrics inconsistent: hits ${m.hits} + reads ${m.reads} != refs ${m.refs} (every ref is a hit or a read).`)
}
if (m.reads - m.evictions !== 32) {
  fail(`metrics inconsistent: reads ${m.reads} − evictions ${m.evictions} != 32 initial fills.`)
}
if (m.writes !== 0) {
  fail(`metrics inconsistent: the public trace is a pure read stream — writes must be 0, got ${m.writes}.`)
}
if (m.hit_bps !== Math.floor((m.hits * 10000) / m.refs)) {
  fail(`metrics inconsistent: hit_bps ${m.hit_bps} != hits*10000/refs (${Math.floor((m.hits * 10000) / m.refs)}).`)
}

/* ------------------------------- output -------------------------------- */

console.log(
  JSON.stringify({
    user,
    hit_bps: m.hit_bps,
    hits: m.hits,
    reads: m.reads,
    writes: m.writes,
    evictions: m.evictions,
    sha256,
    valid: true,
  }),
)
