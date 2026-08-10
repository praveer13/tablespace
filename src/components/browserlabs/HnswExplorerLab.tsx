import { useMemo, useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * HNSW Explorer (T6) — walk the layered graph yourself. A seeded 40-node
 * field in 3 clusters, two visible layers (express lanes over dense streets),
 * a fixed query. Phase 1: click the greedy descent hop by hop. Phase 2: run
 * the layer-0 beam at ef_search 4 and 40 and watch recall@10 against the
 * brute-force truth. Latency is a distance-computation count, exactly lab
 * 06's Meter — never wall-clock. Canon: level = ⌊−ln(u)·1/ln(m)⌋, layer-0
 * cap 2m, diversified neighbor selection, ef_search ≥ k. All deterministic:
 * one seed, no Math.random, everything below is computed from the field.
 */

/* ---------------- the seeded field (frozen: seed 12 tells the story) ---------------- */

interface Pt {
  x: number
  y: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

const SEED = 12
const QUERY: Pt = { x: 0.86, y: 0.16 }
const M = 8 // toy level coin — pgvector ships m=16; a 40-node field scales it down
const K = 10 // recall@10
const EF_SMALL = 4
const EF_WIDE = 40 // pgvector's default ef_search

function buildField(seed: number): Pt[] {
  const rnd = mulberry32(seed)
  const pts: Pt[] = []
  const clusters = [
    { cx: 0.2, cy: 0.18, n: 13, s: 0.055 },
    { cx: 0.5, cy: 0.38, n: 14, s: 0.055 },
    { cx: 0.8, cy: 0.2, n: 13, s: 0.05 },
  ]
  for (const c of clusters)
    for (let i = 0; i < c.n; i++) {
      const gx = (rnd() + rnd() + rnd() - 1.5) / 1.5
      const gy = (rnd() + rnd() + rnd() - 1.5) / 1.5
      pts.push({
        x: Math.min(0.97, Math.max(0.03, c.cx + gx * c.s * 2.2)),
        y: Math.min(0.57, Math.max(0.03, c.cy + gy * c.s * 2.2)),
      })
    }
  return pts
}

/** canon: level = ⌊−ln(u)·1/ln(m)⌋ — clamped so the toy graph shows two layers */
function assignLevels(seed: number, pts: Pt[]): number[] {
  const rnd = mulberry32(seed ^ 0x9e37)
  return pts.map(() => Math.min(1, Math.floor(-Math.log(1 - rnd()) / Math.log(M))))
}

/** lab-06's diversified selection: closest-first, keep x iff closer to the owner
 *  than to every already-kept neighbor; backfill closest to hold the degree up. */
function selectNeighbors(owner: Pt, cands: { id: number; p: Pt }[], deg: number): number[] {
  const kept: { id: number; p: Pt }[] = []
  const skipped: { id: number; p: Pt }[] = []
  for (const c of cands) {
    if (kept.length >= deg) break
    if (kept.every((k) => dist(c.p, owner) < dist(c.p, k.p))) kept.push(c)
    else skipped.push(c)
  }
  for (const s of skipped) {
    if (kept.length >= deg) break
    kept.push(s)
  }
  return kept.map((k) => k.id)
}

function buildGraph(pts: Pt[], levels: number[]) {
  const n = pts.length
  const adj0 = Array.from({ length: n }, () => new Set<number>())
  for (let i = 0; i < n; i++) {
    const cands = pts
      .map((p, j) => ({ id: j, d: dist(pts[i], p), p }))
      .filter((c) => c.id !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
    for (const j of selectNeighbors(pts[i], cands, 6)) {
      adj0[i].add(j)
      adj0[j].add(i)
    }
  }
  // one piece (lab-06 graph_invariants): bridge components, closest pair first
  for (;;) {
    const comp = new Array<number>(n).fill(-1)
    let nc = 0
    for (let s = 0; s < n; s++) {
      if (comp[s] !== -1) continue
      const stack = [s]
      comp[s] = nc
      while (stack.length) {
        const u = stack.pop()!
        for (const v of adj0[u])
          if (comp[v] === -1) {
            comp[v] = nc
            stack.push(v)
          }
      }
      nc++
    }
    if (nc === 1) break
    let best: { i: number; j: number; d: number } | null = null
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (comp[i] !== comp[j]) {
          const d = dist(pts[i], pts[j])
          if (!best || d < best.d || (d === best.d && (i < best.i || (i === best.i && j < best.j)))) best = { i, j, d }
        }
    adj0[best!.i].add(best!.j)
    adj0[best!.j].add(best!.i)
  }
  // prune over the layer-0 cap 2m (diversified, per list)
  for (let i = 0; i < n; i++)
    if (adj0[i].size > 2 * M) {
      const cands = [...adj0[i]].map((j) => ({ id: j, d: dist(pts[i], pts[j]), p: pts[j] })).sort((a, b) => a.d - b.d)
      adj0[i] = new Set(selectNeighbors(pts[i], cands, 2 * M))
    }
  const l1 = pts.map((_, i) => i).filter((i) => levels[i] >= 1)
  const adj1 = new Map<number, Set<number>>(l1.map((i) => [i, new Set()]))
  for (const i of l1) {
    const cands = l1
      .filter((j) => j !== i)
      .map((j) => ({ id: j, d: dist(pts[i], pts[j]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    for (const c of cands) {
      adj1.get(i)!.add(c.id)
      adj1.get(c.id)!.add(i)
    }
  }
  return {
    adj0: adj0.map((s) => [...s]),
    adj1: new Map<number, number[]>([...adj1].map(([k, v]) => [k, [...v]])),
    l1,
  }
}

const POINTS = buildField(SEED)
const LEVELS = assignLevels(SEED, POINTS)
const { adj0: ADJ0, adj1: ADJ1, l1: L1 } = buildGraph(POINTS, LEVELS)
const ENTRY = LEVELS.indexOf(Math.max(...LEVELS))

/** brute-force truth — the judge (T5's pipeline grading T6's index) */
const TRUTH = POINTS.map((p, i) => ({ id: i, d: dist(p, QUERY) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, K)
  .map((t) => t.id)
const BRUTE_FORCE = POINTS.length // the exact scan's meter reading

interface BeamRun {
  ef: number
  result: number[] // what the search returns: top-k of the kept candidates
  kept: number[] // W — the ef candidates alive at the end
  visited: number[] // every node whose distance was computed
  meter: number
  recall: number
}

/** lab-06's search, layer 0: beam of ef from the walk's stop. Meter = dist evals. */
function beamSearch(start: number, ef: number): BeamRun {
  let meter = 1
  const ds = new Map<number, number>([[start, dist(POINTS[start], QUERY)]])
  const C = [start]
  let W = [start]
  const visited = new Set([start])
  let pops = 0
  while (C.length > 0 && pops < 10 * POINTS.length) {
    C.sort((a, b) => ds.get(a)! - ds.get(b)!)
    const c = C[0]
    const worst = Math.max(...W.map((w) => ds.get(w)!))
    if (ds.get(c)! > worst) break
    C.shift()
    pops++
    for (const nb of ADJ0[c]) {
      if (visited.has(nb)) continue
      visited.add(nb)
      const d = dist(POINTS[nb], QUERY)
      meter++
      ds.set(nb, d)
      const worstNow = W.length < ef ? Infinity : Math.max(...W.map((w) => ds.get(w)!))
      if (W.length < ef || d < worstNow) {
        C.push(nb)
        W.push(nb)
        if (W.length > ef) {
          const far = W.reduce((a, b) => (ds.get(a)! >= ds.get(b)! ? a : b))
          W = W.filter((w) => w !== far)
        }
      }
    }
  }
  const result = [...W].sort((a, b) => ds.get(a)! - ds.get(b)!).slice(0, K)
  const kept = [...W].sort((a, b) => ds.get(a)! - ds.get(b)!)
  const recall = result.filter((r) => TRUTH.includes(r)).length / K
  return { ef, result, kept, visited: [...visited], meter, recall }
}

/* the walk is forced-unique (nearest-hop), so the stop node — and therefore both
 * beam runs — are fixed; precompute the graded recall values */
const GREEDY_STOP = (() => {
  const walk = (adjOf: (i: number) => number[], from: number) => {
    let cur = from
    for (;;) {
      const d = dist(POINTS[cur], QUERY)
      const best = adjOf(cur)
        .map((j) => ({ id: j, d: dist(POINTS[j], QUERY) }))
        .reduce((a, b) => (b.d < a.d ? b : a), { id: cur, d })
      if (best.id === cur || best.d >= d) return cur
      cur = best.id
    }
  }
  const top = walk((i) => ADJ1.get(i) ?? [], ENTRY)
  return walk((i) => ADJ0[i], top)
})()
const RUN_SMALL = beamSearch(GREEDY_STOP, EF_SMALL)
const RUN_WIDE = beamSearch(GREEDY_STOP, EF_WIDE)

/** recall-call options, derived from the computed ef=4 recall */
const RECALL_OPTIONS = (() => {
  const opts = new Set<number>([RUN_SMALL.recall, 1, Math.max(0, RUN_SMALL.recall - 0.3), Math.min(1, RUN_SMALL.recall + 0.3)])
  for (const f of [0.2, 0.6, 0, 0.8, 0.5, 0.9]) if (opts.size < 4) opts.add(f)
  return [...opts].sort((a, b) => b - a)
})()

/* ---------------- svg geometry ---------------- */
const X = (p: Pt) => 4 + p.x * 92
const Y1 = (p: Pt) => 3.5 + (p.y / 0.6) * 14
const Y0 = (p: Pt) => 24.5 + (p.y / 0.6) * 24

const C_TEXT3 = '#5D6B80'
const C_TEXT2 = '#A3B0C2'
const C_LINE = '#1E2937'
const C_LINE_BRIGHT = '#2C3A4F'
const C_ACCENT = '#3EF2A4'
const C_AMBER = '#FFB224'
const C_INFO = '#5CA8FF'

const clusterOf = (i: number) => (i < 13 ? 'left' : i < 27 ? 'middle' : 'right')

type Flash = { kind: 'ok' | 'warn' | 'bad'; msg: string } | null

export default function HnswExplorerLab({ trackColor }: { trackColor: string }) {
  const [mode, setMode] = useState<'greedy' | 'beam'>('greedy')
  /* greedy walk state */
  const [cur, setCur] = useState(ENTRY)
  const [layer, setLayer] = useState<1 | 0>(1)
  const [path, setPath] = useState<{ id: number; layer: 1 | 0 }[]>([{ id: ENTRY, layer: 1 }])
  const [walkMeter, setWalkMeter] = useState((ADJ1.get(ENTRY) ?? []).length + 1)
  const [walkDone, setWalkDone] = useState(false)
  const [walkEverDone, setWalkEverDone] = useState(false)
  const [stopNode, setStopNode] = useState<number | null>(null)
  const [flash, setFlash] = useState<Flash>(null)
  /* beam state */
  const [runs, setRuns] = useState<Partial<Record<number, BeamRun>>>({})
  const [recallCall, setRecallCall] = useState<number | null>(null)
  const [knobs, setKnobs] = useState<string | null>(null)

  const neighborsOf = (i: number, l: 1 | 0) => (l === 1 ? (ADJ1.get(i) ?? []) : ADJ0[i])
  const curDist = dist(POINTS[cur], QUERY)
  const nbrs = neighborsOf(cur, layer)
    .map((j) => ({ id: j, d: dist(POINTS[j], QUERY) }))
    .sort((a, b) => a.d - b.d)
  const nearest = nbrs[0] ?? null
  const localMin = nearest === null || nearest.d >= curDist

  const beamMeter = Object.values(runs).reduce((a, r) => a + (r?.meter ?? 0), 0)
  const totalMeter = walkMeter + beamMeter

  const clickNeighbor = (n: { id: number; d: number }) => {
    if (walkDone || localMin || mode !== 'greedy') return
    if (nearest && n.id === nearest.id) {
      setCur(n.id)
      setPath([...path, { id: n.id, layer }])
      setWalkMeter(walkMeter + neighborsOf(n.id, layer).length)
      setFlash({ kind: 'ok', msg: `${curDist.toFixed(2)} → ${n.d.toFixed(2)} — greedy takes the nearest. Every hop must cut the distance.` })
    } else if (n.d < curDist) {
      setFlash({ kind: 'warn', msg: `node ${n.id} is nearer (${n.d.toFixed(2)} < ${curDist.toFixed(2)}), but the walk takes the STEEPEST step — click the neighbor nearest the query.` })
    } else {
      setFlash({ kind: 'bad', msg: `the greedy rule: only move CLOSER to the query — that hop goes ${curDist.toFixed(2)} → ${n.d.toFixed(2)}. Greedy never walks away from the target.` })
    }
  }

  const dropLayer = () => {
    setLayer(0)
    setPath([...path, { id: cur, layer: 0 }])
    setWalkMeter(walkMeter + ADJ0[cur].length + 1)
    setFlash({ kind: 'ok', msg: `same node, denser graph — node ${cur} exists on every layer below its top. The walk resumes with finer steps.` })
  }

  const stopWalk = () => {
    setWalkDone(true)
    setWalkEverDone(true)
    setStopNode(cur)
    setFlash({
      kind: 'ok',
      msg: TRUTH[0] === cur
        ? `walk stops at node ${cur}, dist ${curDist.toFixed(3)} — the TRUE nearest. Top-1 is greedy's game; top-10 is where the beam's width decides. Switch to the ef beam.`
        : `walk stops at node ${cur}, dist ${curDist.toFixed(3)} — a local minimum of the graph. Switch to the ef beam.`,
    })
  }

  const resetWalk = () => {
    setCur(ENTRY)
    setLayer(1)
    setPath([{ id: ENTRY, layer: 1 }])
    setWalkMeter((ADJ1.get(ENTRY) ?? []).length + 1)
    setWalkDone(false)
    setFlash(null)
  }

  const runBeam = (ef: number) => setRuns({ ...runs, [ef]: beamSearch(stopNode ?? GREEDY_STOP, ef) })

  const tasks: LabTask[] = useMemo(
    () => [
      {
        id: 'greedy-descent',
        label: 'Walk the greedy descent: entry → express hops → drop → layer-0 stop',
        done: walkEverDone,
        hint: 'click the neighbor NEAREST the query; at a local minimum, drop a layer',
      },
      {
        id: 'beam-small',
        label: `Run ef_search=${EF_SMALL} and call its recall@${K}`,
        done: runs[EF_SMALL] !== undefined && recallCall === RUN_SMALL.recall,
        hint: 'watch which nodes light up — and how few candidates the beam may keep',
      },
      {
        id: 'beam-wide',
        label: `Run ef_search=${EF_WIDE} and compare both recalls`,
        done: runs[EF_SMALL] !== undefined && runs[EF_WIDE] !== undefined,
        hint: 'pgvector’s default — what does the wider beam buy, and at what meter?',
      },
      {
        id: 'knobs-as-physics',
        label: 'Call the trade: raising ef_search buys ___ at the cost of ___',
        done: knobs === 'recall-latency',
        hint: 'lab 06 meters latency as a distance-computation count',
      },
    ],
    [walkEverDone, runs, recallCall, knobs],
  )

  const activeRun = mode === 'beam' ? (runs[EF_WIDE] ?? runs[EF_SMALL] ?? null) : null

  const nodeFill = (i: number, l: 1 | 0): { fill: string; opacity: number; r: number } => {
    if (mode === 'beam' && activeRun) {
      if (activeRun.result.includes(i)) return { fill: C_ACCENT, opacity: 1, r: 1.5 }
      if (activeRun.kept.includes(i)) return { fill: C_ACCENT, opacity: 0.45, r: 1.4 }
      if (activeRun.visited.includes(i)) return { fill: C_INFO, opacity: 0.75, r: 1.3 }
      return { fill: C_TEXT3, opacity: 0.35, r: 1.2 }
    }
    if (i === cur && l === layer) return { fill: C_ACCENT, opacity: 1, r: 1.7 }
    if (path.some((p) => p.id === i)) return { fill: C_ACCENT, opacity: 0.5, r: 1.3 }
    if (nbrs.some((n) => n.id === i) && l === layer && !walkDone) return { fill: C_INFO, opacity: 1, r: 1.5 }
    return { fill: C_TEXT3, opacity: 0.6, r: 1.2 }
  }

  return (
    <LabShell labId="hnsw-explorer" trackColor={trackColor} tasks={tasks}>
      {/* mode toggle + the meter */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-3">
        <button
          onClick={() => setMode('greedy')}
          className={mode === 'greedy' ? 'rounded border border-accent/60 bg-accent/10 px-2.5 py-1 text-accent' : 'rounded border border-line px-2.5 py-1 hover:text-text-1'}
        >
          1 · greedy descent
        </button>
        <button
          onClick={() => walkEverDone && setMode('beam')}
          className={
            mode === 'beam'
              ? 'rounded border border-accent/60 bg-accent/10 px-2.5 py-1 text-accent'
              : walkEverDone
                ? 'rounded border border-line px-2.5 py-1 hover:text-text-1'
                : 'cursor-not-allowed rounded border border-line px-2.5 py-1 opacity-50'
          }
        >
          2 · ef beam
        </button>
        <span className="ml-auto">
          distance computations: <span className="text-text-1">{totalMeter}</span> · brute force costs {BRUTE_FORCE}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-text-3">
        the meter is lab 06’s cost model: latency = distance-computation count, never wall-clock.
        Toy field: 40 nodes, level coin 1-in-{M} (canon ⌊−ln(u)·1/ln(m)⌋; pgvector ships m=16), layer-0 cap 2m, lab-06’s diversified edge selection.
      </p>

      {/* status line */}
      <p className="mt-3 font-mono text-[11.5px] text-text-2">
        {mode === 'greedy' ? (
          walkDone ? (
            <>walk complete — {path.filter((p) => p.layer === 1).length - 1} express hops, {path.filter((p) => p.layer === 0).length - 1} street hops, meter {walkMeter}.</>
          ) : localMin ? (
            <>at node <span className="text-accent">{cur}</span> · layer {layer} · dist <span className="text-text-1">{curDist.toFixed(2)}</span> — <span className="text-amber">local minimum</span>: no neighbor is closer.</>
          ) : (
            <>at node <span className="text-accent">{cur}</span> · layer {layer} · dist <span className="text-text-1">{curDist.toFixed(2)}</span> — click the neighbor nearest the query (blue).</>
          )
        ) : (
          <>the beam enters at node <span className="text-accent">{stopNode ?? GREEDY_STOP}</span> — where your walk stopped. Pick an ef_search and run it.</>
        )}
      </p>

      {/* the layered graph */}
      <svg viewBox="0 0 100 53" className="mt-2 w-full rounded-md border border-line bg-ink">
        {/* cross-layer identity links: a node exists on every layer below its top */}
        {L1.map((i) => (
          <line key={`xl-${i}`} x1={X(POINTS[i])} y1={Y1(POINTS[i])} x2={X(POINTS[i])} y2={Y0(POINTS[i])} stroke={C_TEXT3} strokeWidth={0.2} strokeDasharray="1 1" opacity={0.35} />
        ))}
        {/* layer panels */}
        <rect x={2} y={3} width={96} height={15} fill="none" stroke={C_LINE} strokeWidth={0.3} />
        <rect x={2} y={24} width={96} height={26} fill="none" stroke={C_LINE} strokeWidth={0.3} />
        <text x={3.5} y={6.2} fontSize={2.6} fill={C_TEXT3} className="font-mono">layer 1 — express lanes · {L1.length} nodes</text>
        <text x={3.5} y={27.2} fontSize={2.6} fill={C_TEXT3} className="font-mono">layer 0 — dense streets · {POINTS.length} nodes</text>

        {/* layer-1 edges */}
        {L1.flatMap((i) =>
          (ADJ1.get(i) ?? [])
            .filter((j) => j > i)
            .map((j) => (
              <line key={`e1-${i}-${j}`} x1={X(POINTS[i])} y1={Y1(POINTS[i])} x2={X(POINTS[j])} y2={Y1(POINTS[j])} stroke={C_LINE_BRIGHT} strokeWidth={0.3} opacity={0.85} />
            )),
        )}
        {/* layer-0 edges */}
        {POINTS.flatMap((_, i) =>
          ADJ0[i]
            .filter((j) => j > i)
            .map((j) => (
              <line key={`e0-${i}-${j}`} x1={X(POINTS[i])} y1={Y0(POINTS[i])} x2={X(POINTS[j])} y2={Y0(POINTS[j])} stroke={C_LINE} strokeWidth={0.25} opacity={0.7} />
            )),
        )}

        {/* true 10-NN rings (beam mode): amber ring = owed to the caller */}
        {mode === 'beam' &&
          activeRun &&
          TRUTH.map((i) => (
            <circle key={`t-${i}`} cx={X(POINTS[i])} cy={Y0(POINTS[i])} r={2.3} fill="none" stroke={C_AMBER} strokeWidth={0.35} opacity={0.9} />
          ))}

        {/* layer-1 nodes */}
        {L1.map((i) => {
          const s = nodeFill(i, 1)
          const clickable = mode === 'greedy' && layer === 1 && !walkDone && nbrs.some((n) => n.id === i)
          return (
            <g key={`n1-${i}`}>
              <circle cx={X(POINTS[i])} cy={Y1(POINTS[i])} r={s.r} fill={s.fill} opacity={s.opacity} />
              {clickable && (
                <circle cx={X(POINTS[i])} cy={Y1(POINTS[i])} r={3.2} fill="transparent" className="cursor-pointer" onClick={() => clickNeighbor(nbrs.find((n) => n.id === i)!)} />
              )}
              {clickable && (
                <text x={X(POINTS[i])} y={Y1(POINTS[i]) + 3.4} fontSize={2.4} fill={C_TEXT2} textAnchor="middle" className="font-mono">
                  {dist(POINTS[i], QUERY).toFixed(2)}
                </text>
              )}
            </g>
          )
        })}
        {/* layer-0 nodes */}
        {POINTS.map((_, i) => {
          const s = nodeFill(i, 0)
          const clickable = mode === 'greedy' && layer === 0 && !walkDone && nbrs.some((n) => n.id === i)
          return (
            <g key={`n0-${i}`}>
              <circle cx={X(POINTS[i])} cy={Y0(POINTS[i])} r={s.r} fill={s.fill} opacity={s.opacity} />
              {LEVELS[i] >= 1 && <circle cx={X(POINTS[i])} cy={Y0(POINTS[i])} r={s.r + 0.7} fill="none" stroke={C_INFO} strokeWidth={0.25} opacity={0.5} />}
              {clickable && (
                <circle cx={X(POINTS[i])} cy={Y0(POINTS[i])} r={3.2} fill="transparent" className="cursor-pointer" onClick={() => clickNeighbor(nbrs.find((n) => n.id === i)!)} />
              )}
              {clickable && (
                <text x={X(POINTS[i])} y={Y0(POINTS[i]) + 3.4} fontSize={2.4} fill={C_TEXT2} textAnchor="middle" className="font-mono">
                  {dist(POINTS[i], QUERY).toFixed(2)}
                </text>
              )}
            </g>
          )
        })}

        {/* entry + query markers */}
        <text x={X(POINTS[ENTRY])} y={Y1(POINTS[ENTRY]) - 2.6} fontSize={2.4} fill={C_AMBER} textAnchor="middle" className="font-mono">entry</text>
        {[Y1, Y0].map((Y, k) => (
          <g key={`q-${k}`}>
            <path d={`M ${X(QUERY)} ${Y(QUERY) - 1.8} L ${X(QUERY) + 1.8} ${Y(QUERY)} L ${X(QUERY)} ${Y(QUERY) + 1.8} L ${X(QUERY) - 1.8} ${Y(QUERY)} Z`} fill={C_AMBER} />
            <text x={X(QUERY)} y={Y(QUERY) + 4.6} fontSize={2.4} fill={C_AMBER} textAnchor="middle" className="font-mono">query</text>
          </g>
        ))}
      </svg>

      {/* flash bar */}
      <p
        className={`mt-2 min-h-5 font-mono text-[11px] leading-snug ${
          flash === null ? 'text-text-3' : flash.kind === 'ok' ? 'text-accent' : flash.kind === 'warn' ? 'text-amber' : 'text-danger'
        }`}
      >
        {flash?.msg ?? (mode === 'greedy' ? 'greedy routing: from any node, move to whichever neighbor is closest to the target.' : 'amber rings are the true 10-NN; green fills are what the beam returned. Ring without fill = a miss.')}
      </p>

      {/* greedy controls */}
      {mode === 'greedy' && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {localMin && !walkDone && layer === 1 && (
            <button onClick={dropLayer} className="rounded border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent/20">
              ↓ drop to layer 0 — same node, denser streets
            </button>
          )}
          {localMin && !walkDone && layer === 0 && (
            <button onClick={stopWalk} className="rounded border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent/20">
              stop — the beam enters here (node {cur})
            </button>
          )}
          <button onClick={resetWalk} className="rounded border border-line px-3 py-1.5 font-mono text-[11px] text-text-3 hover:text-text-1">
            walk again
          </button>
          <span className="font-mono text-[10.5px] text-text-3">
            path: {path.map((p, i) => `${i > 0 && p.layer !== path[i - 1].layer ? ' ⇓ ' : i > 0 ? ' → ' : ''}${p.id}`).join('')}
          </span>
        </div>
      )}

      {/* beam controls + results */}
      {mode === 'beam' && (
        <div className="mt-1">
          <div className="flex flex-wrap items-center gap-2">
            {[EF_SMALL, EF_WIDE].map((ef) => (
              <button
                key={ef}
                onClick={() => runBeam(ef)}
                className={`rounded border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  runs[ef] ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-text-2 hover:text-text-1'
                }`}
              >
                run ef_search={ef}
              </button>
            ))}
            <span className="font-mono text-[10.5px] text-text-3">ef={EF_WIDE} is pgvector’s default — now you see what it buys</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[EF_SMALL, EF_WIDE].map((ef) => {
              const r = runs[ef]
              return (
                <div key={ef} className={`rounded-md border p-3 ${r ? 'border-accent/50 bg-accent/5' : 'border-line bg-ink'}`}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">ef_search={ef}</p>
                  {r ? (
                    <>
                      <p className="mt-1 font-display text-h3 text-text-1">
                        recall {r.recall.toFixed(1)} <span className="font-mono text-[11px] text-text-3">({Math.round(r.recall * K)}/{K} true neighbors returned)</span>
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${r.recall * 100}%` }} />
                      </div>
                      <p className="mt-2 font-mono text-[10px] leading-snug text-text-3">
                        {r.meter} distance computations · visited {r.visited.length}/{POINTS.length} nodes
                        {ef === EF_SMALL
                          ? ` — all inside the ${clusterOf(r.visited[r.visited.length - 1])}-hand cluster. ef=${EF_SMALL} keeps only ${EF_SMALL} candidates alive, and ef &lt; k=${K} caps recall at ${(EF_SMALL / K).toFixed(1)} however good they are (canon: ef_search ≥ k — pgvector rejects less).`
                          : ` — the wide beam floods the whole graph; at 40 nodes its meter equals the brute-force bill. The index win is a scale story: at 5M nodes this sweep is a few hundred computations, not millions.`}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 font-mono text-[10.5px] text-text-3">not run yet</p>
                  )}
                </div>
              )
            })}
          </div>

          {runs[EF_SMALL] && runs[EF_WIDE] && (
            <p className="mt-3 font-mono text-[11px] leading-snug text-text-2">
              the dial, live: ef {EF_SMALL}→{EF_WIDE} moves recall {RUN_SMALL.recall.toFixed(1)} → {RUN_WIDE.recall.toFixed(1)} for {RUN_SMALL.meter} → {RUN_WIDE.meter} distance
              computations. Recall is bought with latency — that curve is T6.L3.
            </p>
          )}

          {runs[EF_SMALL] && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="font-mono text-[11px] text-text-3">you watched the ef={EF_SMALL} run — call its recall@{K}:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RECALL_OPTIONS.map((o) => (
                  <button
                    key={o}
                    onClick={() => setRecallCall(o)}
                    className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      recallCall === o
                        ? o === RUN_SMALL.recall
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-danger/60 bg-danger/10 text-danger'
                        : 'border-line text-text-3 hover:text-text-1'
                    }`}
                  >
                    {o.toFixed(1)}
                  </button>
                ))}
              </div>
              {recallCall !== null && recallCall !== RUN_SMALL.recall && (
                <p className="mt-2 font-mono text-[11px] text-danger">
                  count the green fills inside amber rings: the beam kept {RUN_SMALL.kept.length} candidates and returned {RUN_SMALL.result.length} — every one a true neighbor, but {RUN_SMALL.result.length} is not {K}.
                </p>
              )}
              {recallCall === RUN_SMALL.recall && (
                <p className="mt-2 font-mono text-[11px] text-accent">
                  ✓ {RUN_SMALL.recall.toFixed(1)} — the beam returned its {RUN_SMALL.result.length} kept candidates, all true, and hit the ef &lt; k ceiling. Trapped by width, not by direction.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-line pt-3">
            <p className="font-mono text-[11px] text-text-3">raising ef_search buys ___ at the cost of ___</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { id: 'recall-latency', label: 'recall — paid in distance computations (latency)' },
                { id: 'recall-build', label: 'recall — paid in build time' },
                { id: 'latency-recall', label: 'lower latency — paid in recall' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setKnobs(o.id)}
                  className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    knobs === o.id
                      ? o.id === 'recall-latency'
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-danger/60 bg-danger/10 text-danger'
                      : 'border-line text-text-3 hover:text-text-1'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {knobs === 'recall-latency' && (
              <p className="mt-2 font-mono text-[11px] text-accent">
                ✓ the meter you just watched IS the cost — ef_search is spent per query, so you can sweep it live. The knob is a price, not a superstition.
              </p>
            )}
            {knobs === 'recall-build' && (
              <p className="mt-2 font-mono text-[11px] text-danger">
                that’s ef_construction — the build beam, spent once at insert. ef_search is spent per query: your two runs changed no edges, only the meter.
              </p>
            )}
            {knobs === 'latency-recall' && (
              <p className="mt-2 font-mono text-[11px] text-danger">
                backwards — you ran the experiment: ef={EF_SMALL} was cheap and wrong, ef={EF_WIDE} exact and {Math.round(RUN_WIDE.meter / RUN_SMALL.meter)}× the meter. The dial trades latency FOR recall.
              </p>
            )}
          </div>
        </div>
      )}
    </LabShell>
  )
}
