import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Database,
  Gauge,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  StepForward,
  Waves,
} from 'lucide-react'
import { useProgress } from '@/lib/progress'
import { cn } from '@/lib/utils'

/**
 * The Engine — tablespace's persistent world. v0: a buffer-pool simulator
 * under a deterministic page-reference trace. One pool of N frames, a
 * seeded trace stream (oltp skew / sequential scan / nightly-batch mix),
 * two eviction policies (LRU, Postgres-style clock-sweep), and honest
 * counters. The sim state is pure data — the rng is a stored xorshift
 * integer — so reset replays the exact same trace, and race mode runs
 * both policies over identical references.
 */

const PAGE_SPACE = 10_000
const HOT_SIZE = 500 // ~5% of the page space is hot
const HOT_P = 80 // % of oltp references that land in the hot set
const FLOOD_EVERY = 400 // mixed: oltp refs between floods
const FLOOD_LEN = 120 // mixed: sequential refs per flood
const HIST = 64 // per-ref outcomes kept for the sparkline
const SPARK_WIN = 16 // trailing window behind each sparkline point
const TICK_MS = 140
const DEFAULT_SEED = 0xb0ff0001
const EMPTY = -1

type TraceMode = 'oltp' | 'scan' | 'mixed'
type Policy = 'lru' | 'clock'

interface Frame {
  page: number // EMPTY = free frame
  dirty: boolean
  age: number // lru metadata: ref seq of last touch
  uc: number // clock metadata: usage count 0..5 (Postgres-style)
  flashSeq: number
  flashKind: 'hit' | 'miss'
}

interface Pool {
  frames: Frame[]
  hand: number // clock sweep position
  refs: number
  hits: number
  reads: number
  writes: number
  evictions: number
  hist: number[] // last HIST outcomes, 1 = hit
}

interface LogLine {
  t: number
  policy: Policy
  text: string
  amber?: boolean // dirty writeback
}

interface Sim {
  seed: number
  mode: TraceMode
  rng: number
  seq: number
  scanCursor: number
  untilFlood: number
  floodLeft: number
  pools: Record<Policy, Pool>
  log: LogLine[]
  lastBatch: number // refs applied in the most recent step (for flash tinting)
}

/* ---------------- sim core (pure: draft is cloned, prev is never touched) ---------------- */

function nextRand(s: { rng: number }): number {
  let x = s.rng >>> 0 || 1
  x ^= x >> 12
  x ^= x << 25
  x ^= x >> 27
  x >>>= 0
  s.rng = x
  return (x * 0x2545f491) >>> 0
}

/** zipf s≈1 draw over hot ranks 0..HOT_SIZE-1: r = floor(e^(u·ln H)) - 1 */
function zipfRank(s: { rng: number }): number {
  const u = nextRand(s) / 0x100000000
  return Math.min(HOT_SIZE - 1, Math.floor(Math.exp(u * Math.log(HOT_SIZE))) - 1)
}

function oltpPage(s: Sim): number {
  if (nextRand(s) % 100 < HOT_P) return zipfRank(s)
  return nextRand(s) % PAGE_SPACE
}

function nextPage(s: Sim): number {
  if (s.mode === 'scan') {
    const p = s.scanCursor
    s.scanCursor = (s.scanCursor + 1) % PAGE_SPACE
    return p
  }
  if (s.mode === 'mixed') {
    if (s.floodLeft > 0) {
      s.floodLeft -= 1
      const p = s.scanCursor
      s.scanCursor = (s.scanCursor + 1) % PAGE_SPACE
      return p
    }
    s.untilFlood -= 1
    if (s.untilFlood <= 0) {
      s.untilFlood = FLOOD_EVERY
      s.floodLeft = FLOOD_LEN
    }
    return oltpPage(s)
  }
  return oltpPage(s)
}

function makePool(frames: number): Pool {
  return {
    frames: Array.from({ length: frames }, () => ({
      page: EMPTY,
      dirty: false,
      age: 0,
      uc: 0,
      flashSeq: -1,
      flashKind: 'miss' as const,
    })),
    hand: 0,
    refs: 0,
    hits: 0,
    reads: 0,
    writes: 0,
    evictions: 0,
    hist: [],
  }
}

function makeSim(seed: number, mode: TraceMode, frames: number): Sim {
  const s: Sim = {
    seed,
    mode,
    rng: seed >>> 0 || 1,
    seq: 0,
    scanCursor: 0,
    untilFlood: FLOOD_EVERY,
    floodLeft: 0,
    pools: { lru: makePool(frames), clock: makePool(frames) },
    log: [],
    lastBatch: 0,
  }
  s.scanCursor = nextRand(s) % PAGE_SPACE // scans start at a seeded offset
  return s
}

function clonePool(p: Pool): Pool {
  return { ...p, frames: p.frames.map((f) => ({ ...f })), hist: p.hist.slice() }
}

interface RefOutcome {
  hit: boolean
  evicted: number // EMPTY if the load used a free frame
  evictedDirty: boolean
}

function applyRef(p: Pool, page: number, isWrite: boolean, policy: Policy, seq: number): RefOutcome {
  p.refs += 1
  const at = p.frames.findIndex((f) => f.page === page)
  if (at >= 0) {
    p.hits += 1
    const f = p.frames[at]
    f.age = seq
    f.uc = Math.min(5, f.uc + 1)
    if (isWrite) f.dirty = true
    f.flashSeq = seq
    f.flashKind = 'hit'
    p.hist.push(1)
    return { hit: true, evicted: EMPTY, evictedDirty: false }
  }

  p.reads += 1
  let victim = p.frames.findIndex((f) => f.page === EMPTY)
  let evicted = EMPTY
  let evictedDirty = false
  if (victim < 0) {
    if (policy === 'lru') {
      victim = 0
      for (let k = 1; k < p.frames.length; k++) if (p.frames[k].age < p.frames[victim].age) victim = k
    } else {
      // clock-sweep: hand decrements usage counts, evicts the first frame at 0
      for (;;) {
        if (p.frames[p.hand].uc === 0) {
          victim = p.hand
          break
        }
        p.frames[p.hand].uc -= 1
        p.hand = (p.hand + 1) % p.frames.length
      }
      p.hand = (victim + 1) % p.frames.length
    }
    const old = p.frames[victim]
    evicted = old.page
    evictedDirty = old.dirty
    p.evictions += 1
    if (old.dirty) p.writes += 1
  }

  p.frames[victim] = {
    page,
    dirty: isWrite,
    age: seq,
    uc: 1,
    flashSeq: seq,
    flashKind: 'miss',
  }
  p.hist.push(0)
  return { hit: false, evicted, evictedDirty }
}

const pad4 = (n: number) => String(n).padStart(4, '0')

function stepRefs(prev: Sim, writePct: number, n: number): Sim {
  const s: Sim = {
    ...prev,
    pools: { lru: clonePool(prev.pools.lru), clock: clonePool(prev.pools.clock) },
    log: prev.log.slice(),
  }
  for (let k = 0; k < n; k++) {
    s.seq += 1
    const page = nextPage(s)
    // one rand per ref regardless of the knob → the page stream never
    // reshapes when write% changes mid-run
    const isWrite = nextRand(s) % 100 < writePct
    for (const policy of ['lru', 'clock'] as const) {
      const r = applyRef(s.pools[policy], page, isWrite, policy, s.seq)
      if (!r.hit) {
        const what =
          r.evicted === EMPTY
            ? 'load (empty frame)'
            : `evict p${pad4(r.evicted)}${r.evictedDirty ? ' (dirty, +write)' : ''}`
        s.log.push({ t: s.seq, policy, text: `miss p${pad4(page)} → ${what}`, amber: r.evictedDirty })
      }
    }
  }
  s.lastBatch = n
  for (const policy of ['lru', 'clock'] as const) {
    const p = s.pools[policy]
    if (p.hist.length > HIST) p.hist = p.hist.slice(-HIST)
  }
  if (s.log.length > 80) s.log = s.log.slice(-80)
  return s
}

const hitRate = (p: Pool) => (p.refs === 0 ? 0 : (100 * p.hits) / p.refs)

/* ---------------- page ---------------- */

const ROADMAP = [
  {
    icon: Layers,
    title: 'the buffer pool, visible',
    body: 'Frames, dirty bits, usage counts — pages cached, evicted, and flushed live above. Hit rate is the pulse; the sequential flood is the stress test. Shipping now: three trace shapes, two eviction policies, one honest set of counters.',
  },
  {
    icon: Waves,
    title: 'a trace that never forgives',
    body: 'A deterministic page-reference stream — oltp skew, the report-from-hell scan, and the nightly-batch mix. Same seed, same trace, every run: reset replays it reference for reference.',
  },
  {
    icon: Gauge,
    title: 'your code, not ours',
    body: 'Each lab\'s wasm plugs in cumulatively: allocator, tree, WAL, MVCC, executor, HNSW. By T6 the engine answering the trace is the one you built.',
  },
]

const POLICY_COLOR: Record<Policy, string> = { lru: '#5CA8FF', clock: '#3EF2A4' }

export default function Engine() {
  const [sim, setSim] = useState<Sim>(() => makeSim(DEFAULT_SEED, 'oltp', 16))
  const [mode, setMode] = useState<TraceMode>('oltp')
  const [policy, setPolicy] = useState<Policy>('lru')
  const [frames, setFrames] = useState(16)
  const [writePct, setWritePct] = useState(20)
  const [speed, setSpeed] = useState(4)
  const [race, setRace] = useState(false)
  const [playing, setPlaying] = useState(true)

  const recordSimVisit = useProgress((s) => s.recordSimVisit)
  const setSimConfig = useProgress((s) => s.setSimConfig)

  useEffect(() => {
    recordSimVisit('engine')
  }, [recordSimVisit])

  useEffect(() => {
    const id = window.setTimeout(
      () => setSimConfig('engine', { mode, policy, frames, writePct, race, seed: sim.seed }),
      400,
    )
    return () => window.clearTimeout(id)
  }, [mode, policy, frames, writePct, race, sim.seed, setSimConfig])

  const step = useCallback(
    (n: number) => {
      setSim((prev) => stepRefs(prev, writePct, n))
    },
    [writePct],
  )

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => step(speed), TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, step, speed])

  const restart = (seed: number, m: TraceMode, f: number) => setSim(makeSim(seed, m, f))

  const newTrace = () => {
    const seed = (Math.random() * 0x100000000) >>> 0 || 1
    restart(seed, mode, frames)
  }

  const lruRate = hitRate(sim.pools.lru)
  const clockRate = hitRate(sim.pools.clock)
  const delta = clockRate - lruRate

  const visibleLog = sim.log.filter((l) => race || l.policy === policy).slice(-30)

  return (
    <div className="mx-auto max-w-app px-6 pb-24 pt-16 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">the engine · sim</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-1 sm:text-4xl">
          One database, page by page.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-2">
          The persistent world of the course: a single engine that starts as an empty buffer pool and
          ends as your storage engine, your indexes, your executor — driven by a deterministic trace
          that replays exactly, every time. v0 is live below: one buffer pool under a seeded
          page-reference stream, LRU vs clock-sweep, every hit, read, and dirty writeback counted.
        </p>
      </motion.div>

      {/* controls */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8"
      >
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-md border border-line bg-surface-1 p-2 text-text-2 hover:text-text-1"
            aria-label={playing ? 'pause' : 'play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => step(1)}
            className="rounded-md border border-line bg-surface-1 p-2 text-text-2 hover:text-text-1"
            aria-label="step one reference"
            title="step one reference"
          >
            <StepForward className="h-4 w-4" />
          </button>
          <button
            onClick={() => restart(sim.seed, mode, frames)}
            className="rounded-md border border-line bg-surface-1 p-2 text-text-2 hover:text-text-1"
            aria-label="reset — replay the same trace"
            title="reset — replay the same trace"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={newTrace}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-1 px-3 py-2 text-text-2 transition-colors hover:text-text-1"
          >
            <Shuffle className="h-4 w-4" /> new trace
          </button>

          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />

          {(['oltp', 'scan', 'mixed'] as const).map((m) => (
            <Chip key={m} active={mode === m} onClick={() => { setMode(m); restart(sim.seed, m, frames) }}>
              {m}
            </Chip>
          ))}

          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />

          {(['lru', 'clock'] as const).map((p) => (
            <Chip key={p} active={!race && policy === p} disabled={race} onClick={() => setPolicy(p)}>
              {p === 'lru' ? 'lru' : 'clock'}
            </Chip>
          ))}
          <Chip active={race} onClick={() => setRace((r) => !r)}>
            race
          </Chip>

          <span className="ml-auto">
            seed <span className="text-text-2">0x{sim.seed.toString(16).toUpperCase().padStart(8, '0')}</span>
            {' · '}ref <span className="text-text-2">{sim.seq.toLocaleString('en-US')}</span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-text-3">
          <span className="flex items-center gap-2">
            frames {frames}
            <input
              type="range"
              min={4}
              max={128}
              step={4}
              value={frames}
              onChange={(e) => {
                const f = Number(e.target.value)
                setFrames(f)
                restart(sim.seed, mode, f)
              }}
              className="w-28 accent-accent"
            />
          </span>
          <span className="flex items-center gap-2">
            write {writePct}%
            <input
              type="range"
              min={0}
              max={50}
              value={writePct}
              onChange={(e) => setWritePct(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </span>
          <span className="flex items-center gap-2">
            speed {speed}/tick
            <input
              type="range"
              min={1}
              max={40}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </span>
          <span className="ml-auto">
            trace {mode} · hot set {HOT_SIZE.toLocaleString('en-US')}/{PAGE_SPACE.toLocaleString('en-US')} pages
          </span>
        </div>
      </motion.div>

      {/* the pool(s) + events */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]"
      >
        <div className="rounded-lg border border-line bg-surface-1 p-5">
          {race ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">
                  the race · same trace, two policies
                </p>
                <p className="font-mono text-[11px] text-text-3">
                  clock-sweep{' '}
                  <span className={cn(delta >= 0 ? 'text-accent' : 'text-danger')}>
                    {delta >= 0 ? '+' : '−'}
                    {Math.abs(delta).toFixed(1)} pts
                  </span>{' '}
                  vs lru
                </p>
              </div>
              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                <PoolPanel
                  title="lru"
                  sub="victim: least-recently-used · bar: recency"
                  color={POLICY_COLOR.lru}
                  pool={sim.pools.lru}
                  policy="lru"
                  seq={sim.seq}
                  lastBatch={sim.lastBatch}
                  compact
                />
                <PoolPanel
                  title="clock-sweep"
                  sub="victim: hand's first usage-0 · bar: usage count"
                  color={POLICY_COLOR.clock}
                  pool={sim.pools.clock}
                  policy="clock"
                  seq={sim.seq}
                  lastBatch={sim.lastBatch}
                  compact
                />
              </div>
            </>
          ) : (
            <PoolPanel
              title={`the pool · ${frames} frames · ${policy === 'lru' ? 'lru' : 'clock-sweep'}`}
              sub={
                policy === 'lru'
                  ? 'victim: least-recently-used · bar: recency'
                  : "victim: hand's first usage-0 · bar: usage count"
              }
              color={POLICY_COLOR[policy]}
              pool={sim.pools[policy]}
              policy={policy}
              seq={sim.seq}
              lastBatch={sim.lastBatch}
            />
          )}
          <p className="mt-4 border-t border-line pt-3 font-mono text-[10px] text-text-3">
            write {writePct}% of refs · dirty eviction = +1 write · miss = +1 read · same seed replays
            this exact trace
          </p>
        </div>

        {/* event log */}
        <div className="rounded-lg border border-line bg-ink p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">events</p>
            <p className="font-mono text-[10px] text-text-3/60">misses only</p>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10.5px] leading-relaxed text-text-3">
            {visibleLog.length === 0 && <p className="text-text-3/60">— watching —</p>}
            {visibleLog
              .slice()
              .reverse()
              .map((l, i) => (
                <p key={i} className={cn(l.amber && 'text-amber/80')}>
                  <span className="text-text-3/60">{String(l.t).padStart(5, '0')}</span>{' '}
                  {race && (
                    <span style={{ color: POLICY_COLOR[l.policy] }}>{l.policy === 'lru' ? 'lru' : 'clk'} </span>
                  )}
                  {l.text}
                </p>
              ))}
          </div>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 max-w-2xl text-body-sm text-text-3"
      >
        Try: run <span className="font-mono text-text-2">scan</span> — both policies pin at 0.0%, because
        you cannot cache a stream with no reuse (which is why real engines route bulk scans around the
        pool). Then switch to <span className="font-mono text-text-2">mixed</span> in race mode: every
        ~400 refs the flood saws the hit rate down for both, but clock-sweep's usage counts let the hot
        set bleed slower and hold a point or two higher through the storm. Crank frames to 64 and speed
        to 40 to reach steady state fast.
      </motion.p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ROADMAP.map((r, i) => (
          <motion.div
            key={r.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border border-line bg-surface-1 p-6"
          >
            <r.icon className="h-5 w-5 text-accent" />
            <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.1em] text-text-1">{r.title}</p>
            <p className="mt-2 text-body-sm text-text-2">{r.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-1 p-6"
      >
        <Database className="h-5 w-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-body-sm text-text-2">
          The engine starts as eight kilobytes of empty page. Lab 01 is where you fill it.
        </p>
        <Link
          to="/labs/slotted-pages"
          className="inline-flex items-center gap-2 rounded-md border border-accent/60 bg-accent/10 px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent/20"
        >
          start lab 01 <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    </div>
  )
}

/* ---------------- components ---------------- */

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors',
        active
          ? 'border-accent/60 bg-accent/10 text-accent'
          : 'border-line bg-surface-1 text-text-3 hover:text-text-1',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  )
}

function PoolPanel({
  title,
  sub,
  color,
  pool,
  policy,
  seq,
  lastBatch,
  compact,
}: {
  title: string
  sub: string
  color: string
  pool: Pool
  policy: Policy
  seq: number
  lastBatch: number
  compact?: boolean
}) {
  const rate = hitRate(pool)

  // sparkline: each point = hit % over the trailing SPARK_WIN refs
  const points = useMemo(() => {
    const h = pool.hist
    return h.map((_, k) => {
      const from = Math.max(0, k - (SPARK_WIN - 1))
      const w = h.slice(from, k + 1)
      return (100 * w.reduce((a, b) => a + b, 0)) / w.length
    })
  }, [pool.hist])

  // lru recency percentile per frame (bar width); clock uses uc/5 directly
  const recency = useMemo(() => {
    const order = pool.frames
      .map((f, i) => ({ age: f.age, i, empty: f.page === EMPTY }))
      .filter((o) => !o.empty)
      .sort((a, b) => a.age - b.age)
    const pct = new Array<number>(pool.frames.length).fill(0)
    order.forEach((o, rank) => {
      pct[o.i] = order.length > 1 ? rank / (order.length - 1) : 1
    })
    return pct
  }, [pool.frames])

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color }}>
            {title}
          </p>
          <p className="mt-1 font-mono text-[10px] text-text-3">{sub}</p>
        </div>
        <p className="text-right">
          <span className="font-mono text-2xl font-semibold" style={{ color }}>
            {rate.toFixed(1)}%
          </span>
          <span className="ml-2 font-mono text-[10px] text-text-3">hit rate</span>
        </p>
      </div>

      <Sparkline points={points} color={color} />

      <p className="mt-2 font-mono text-[10px] text-text-3">
        refs {pool.refs.toLocaleString('en-US')} · reads {pool.reads.toLocaleString('en-US')} · writes{' '}
        {pool.writes.toLocaleString('en-US')} · evictions {pool.evictions.toLocaleString('en-US')}
      </p>

      <div
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 42 : 54}px, 1fr))` }}
      >
        {pool.frames.map((f, i) => {
          const flashed = f.page !== EMPTY && f.flashSeq > seq - lastBatch
          const hitFlash = flashed && f.flashKind === 'hit'
          const bar = f.page === EMPTY ? 0 : policy === 'clock' ? f.uc / 5 : recency[i]
          return (
            <div
              key={i}
              className="relative rounded border px-1 pb-1 pt-1.5 text-center font-mono"
              style={{
                borderColor: flashed ? (hitFlash ? '#3EF2A4' : '#FF5C6C') : '#1E2937',
                backgroundColor: flashed
                  ? hitFlash
                    ? 'rgba(62,242,164,0.13)'
                    : 'rgba(255,92,108,0.13)'
                  : '#07090D',
                transition: 'border-color 220ms, background-color 220ms',
              }}
            >
              <p
                className={cn(
                  'truncate',
                  compact ? 'text-[9px]' : 'text-[10px]',
                  f.page === EMPTY ? 'text-text-3/50' : 'text-text-2',
                )}
              >
                {f.page === EMPTY ? '—' : `p${f.page}`}
              </p>
              {f.dirty && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber" />}
              <span className="mx-auto mt-1 block h-0.5 w-full rounded bg-line">
                <span
                  className="block h-0.5 rounded"
                  style={{ width: `${Math.round(bar * 100)}%`, backgroundColor: color, opacity: 0.75 }}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const d = useMemo(() => {
    if (points.length < 2) return ''
    return points
      .map((v, i) => `${(i / (points.length - 1)) * 100},${34 - (Math.min(100, v) / 100) * 30}`)
      .join(' ')
  }, [points])
  return (
    <div className="mt-2">
      <svg viewBox="0 0 100 36" className="h-9 w-full" preserveAspectRatio="none">
        {[4, 19, 34].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#1E2937" strokeWidth="0.5" />
        ))}
        {d && <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" />}
      </svg>
      <p className="mt-0.5 flex justify-between font-mono text-[9px] text-text-3/60">
        <span>hit % · trailing {SPARK_WIN}-ref window</span>
        <span>0 — 100</span>
      </p>
    </div>
  )
}
