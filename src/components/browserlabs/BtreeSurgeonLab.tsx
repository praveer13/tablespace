import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { LabShell, type LabTask } from '.'

/**
 * B+Tree Surgeon (T2) — drive lab 02's insert path by hand. Before every
 * split lands you call it: leaf overflows split 3 | 2 and promote a COPY of
 * the right leaf's first key; internal overflows split 2 | median | 2 and the
 * median MOVES up, staying in no child. Production order is 32+
 * (LEAF_MAX = INTERNAL_MAX = 32 in lab 02); here both are 4 so you can watch
 * every split. Fixed script, fixed laws; no clocks, no randomness.
 */

const LEAF_MAX = 4
const INTERNAL_MAX = 4
const LEAF_MIN = LEAF_MAX / 2
const INTERNAL_MIN = INTERNAL_MAX / 2
/** ascending, to force the rightmost-leaf story — every auto-increment PK ever */
const SCRIPT = Array.from({ length: 17 }, (_, i) => (i + 1) * 10)

interface LeafT {
  kind: 'leaf'
  keys: number[]
  next: LeafT | null
}
interface IntT {
  kind: 'internal'
  keys: number[]
  children: TNode[]
}
type TNode = LeafT | IntT

const newTree = (): TNode => ({ kind: 'leaf', keys: [], next: null })

/** Deep clone that preserves next-chain aliasing (each node cloned once). */
const cloneTree = (root: TNode): TNode => {
  const memo = new Map<TNode, TNode>()
  const cl = (n: TNode): TNode => {
    const hit = memo.get(n)
    if (hit) return hit
    if (n.kind === 'leaf') {
      const c: LeafT = { kind: 'leaf', keys: [...n.keys], next: null }
      memo.set(n, c)
      c.next = n.next ? (cl(n.next) as LeafT) : null
      return c
    }
    const c: IntT = { kind: 'internal', keys: [...n.keys], children: [] }
    memo.set(n, c)
    c.children = n.children.map(cl)
    return c
  }
  return cl(root)
}

const heightOf = (root: TNode): number => {
  let h = 1
  let cur = root
  while (cur.kind === 'internal') {
    h++
    cur = cur.children[0]
  }
  return h
}

const subtreeMin = (n: TNode): number => {
  let cur = n
  while (cur.kind === 'internal') cur = cur.children[0]
  return cur.keys[0]
}

/** A split waiting on the student's call. `path` = child indices root → overflowing node. */
interface Gate {
  kind: 'leaf' | 'internal'
  path: number[]
  keys: number[] // the overflowing node's keys (5 of them)
  q1ok: boolean
  wrong: { choice: string; correction: string } | null
}

interface VCheck {
  name: string
  ok: boolean
  detail: string
}

const Q1 = {
  leaf: [
    {
      id: 'copy',
      ok: true,
      label: 'split 3 | 2 — a COPY of the right leaf’s first key climbs; every record stays in a leaf',
      correction: '',
    },
    {
      id: 'move',
      ok: false,
      label: 'split 2 | 2 — the middle record MOVES up into the parent',
      correction: 'that’s a B-tree, not a B+tree — records never leave the leaf level. What climbs is a copy, and 5 records split 3 | 2 (lab 02’s 17 | 16, shrunk).',
    },
    {
      id: 'rotate',
      ok: false,
      label: 'no split — rotate one record to a sibling through the parent',
      correction: 'inserts never rotate — overflow always splits. Balance is kept by construction, not repaired after the fact.',
    },
  ],
  internal: [
    {
      id: 'median',
      ok: true,
      label: 'split 2 | 2 — the MIDDLE separator MOVES up and stays in NO child',
      correction: '',
    },
    {
      id: 'copy',
      ok: false,
      label: 'split 2 | 2 — a COPY of the middle climbs and also stays in the right child, like a leaf',
      correction: 'internal separators own no record — the median is pure boundary, so it moves. A leftover copy would route to a subtree that no longer holds its key.',
    },
    {
      id: 'rotate',
      ok: false,
      label: 'no split — rotate a child to a sibling through the parent',
      correction: 'inserts never rotate — overflow always splits. Balance is kept by construction, not repaired after the fact.',
    },
  ],
} as const

/** The graded walker, shrunk to lab capacity — same invariants as lab 02's validate(). */
function validateTree(root: TNode, len: number): VCheck[] {
  let occOK = true
  let occBad = ''
  let sortOK = true
  let sortBad = ''
  let childCountOK = true
  let childCountBad = ''
  let sepOK = true
  let sepBad = ''
  const leafDepths: number[] = []
  let recordCount = 0
  let nodeCount = 0

  const walk = (n: TNode, depth: number, isRoot: boolean) => {
    nodeCount++
    for (let i = 1; i < n.keys.length; i++) {
      if (n.keys[i - 1] >= n.keys[i]) {
        sortOK = false
        sortBad = `${n.keys[i - 1]} ≥ ${n.keys[i]} inside one node`
      }
    }
    if (n.kind === 'leaf') {
      leafDepths.push(depth)
      recordCount += n.keys.length
      if (!isRoot && (n.keys.length < LEAF_MIN || n.keys.length > LEAF_MAX)) {
        occOK = false
        occBad = `a leaf holds ${n.keys.length} records (floor ${LEAF_MIN}, max ${LEAF_MAX})`
      }
      return
    }
    if (!isRoot && (n.keys.length < INTERNAL_MIN || n.keys.length > INTERNAL_MAX)) {
      occOK = false
      occBad = `an internal node holds ${n.keys.length} separators (floor ${INTERNAL_MIN}, max ${INTERNAL_MAX})`
    }
    if (n.children.length !== n.keys.length + 1) {
      childCountOK = false
      childCountBad = `${n.children.length} children vs ${n.keys.length} separators`
    }
    n.children.forEach((c, i) => {
      if (i > 0 && subtreeMin(c) !== n.keys[i - 1]) {
        sepOK = false
        sepBad = `separator ${n.keys[i - 1]} ≠ min of child ${i} (${subtreeMin(c)})`
      }
      walk(c, depth + 1, false)
    })
  }
  walk(root, 1, true)

  const height = heightOf(root)
  const depthOK = leafDepths.every((d) => d === leafDepths[0]) && leafDepths[0] === height

  let chainOK = true
  let chainBad = ''
  let chainCount = 0
  let prev = -Infinity
  let left = root
  while (left.kind === 'internal') left = left.children[0]
  let cur: LeafT | null = left as LeafT
  const seen = new Set<LeafT>()
  while (cur) {
    if (seen.has(cur)) {
      chainOK = false
      chainBad = 'cycle in the next chain'
      break
    }
    seen.add(cur)
    for (const k of cur.keys) {
      chainCount++
      if (k < prev) {
        chainOK = false
        chainBad = `chain reads ${k} after ${prev}`
      }
      prev = k
    }
    cur = cur.next
  }
  if (chainOK && chainCount !== recordCount) {
    chainOK = false
    chainBad = `chain visited ${chainCount} records, leaves hold ${recordCount}`
  }

  return [
    {
      name: 'occupancy within [MIN, MAX] — root exempt from the floor',
      ok: occOK,
      detail: occOK ? `${nodeCount} nodes walked, every non-root node within [${LEAF_MIN}, ${LEAF_MAX}]` : occBad,
    },
    {
      name: 'keys strictly ascending inside every node',
      ok: sortOK,
      detail: sortOK ? 'every node sorted' : sortBad,
    },
    {
      name: 'children == separators + 1',
      ok: childCountOK,
      detail: childCountOK ? 'holds at every internal node' : childCountBad,
    },
    {
      name: 'separator law: keys[i] = min(children[i+1])',
      ok: sepOK,
      detail: sepOK ? 'every signpost truthful' : sepBad,
    },
    {
      name: 'every leaf at the same depth == height()',
      ok: depthOK,
      detail: depthOK ? `all ${leafDepths.length} leaves at depth ${height}` : `leaf depths ${[...new Set(leafDepths)].join(', ')} vs height ${height}`,
    },
    {
      name: 'next chain ascending, visits every record, total == len',
      ok: chainOK && recordCount === len,
      detail: chainOK ? (recordCount === len ? `${chainCount} records, ascending, len ${len}` : `leaves hold ${recordCount} but len is ${len}`) : chainBad,
    },
  ]
}

/* ---- layout ---- */
const CHIP_W = 30
const CHIP_GAP = 4
const NODE_PAD = 6
const NODE_H = 34
const SIB_GAP = 12
const LEVEL_H = 86

interface Laid {
  node: TNode
  cx: number
  y: number
  w: number
  kids: Laid[]
}

const ownW = (n: TNode) => Math.max(1, n.keys.length) * CHIP_W + Math.max(0, n.keys.length - 1) * CHIP_GAP + NODE_PAD * 2

function measure(n: TNode): number {
  if (n.kind === 'leaf') return ownW(n)
  const kw = n.children.map(measure)
  return Math.max(ownW(n), kw.reduce((a, b) => a + b, 0) + SIB_GAP * (kw.length - 1))
}

function layout(n: TNode, x0: number, y: number, w: number): Laid {
  if (n.kind === 'leaf') return { node: n, cx: x0 + w / 2, y, w: ownW(n), kids: [] }
  const kw = n.children.map(measure)
  const span = kw.reduce((a, b) => a + b, 0) + SIB_GAP * (kw.length - 1)
  let x = x0 + (w - span) / 2
  const kids = n.children.map((c, i) => {
    const laid = layout(c, x, y + LEVEL_H, kw[i])
    x += kw[i] + SIB_GAP
    return laid
  })
  return { node: n, cx: x0 + w / 2, y, w: ownW(n), kids }
}

export default function BtreeSurgeonLab({ trackColor }: { trackColor: string }) {
  const [tree, setTree] = useState<TNode>(newTree)
  const [idx, setIdx] = useState(0)
  const [gate, setGate] = useState<Gate | null>(null)
  const [climbed, setClimbed] = useState<number | null>(null)
  const [flags, setFlags] = useState({ firstSplit: false, rootSplit: false })
  const [validation, setValidation] = useState<VCheck[] | null>(null)
  const [msg, setMsg] = useState(
    'one empty leaf, height 1 — insert 10 and drive the script rightmost, like every auto-increment primary key you have ever met.',
  )

  const scriptDone = idx >= SCRIPT.length && gate === null
  const allOk = validation !== null && validation.every((v) => v.ok)

  const doInsert = () => {
    if (gate || idx >= SCRIPT.length) return
    const key = SCRIPT[idx]
    const t = cloneTree(tree)
    // descend — partition_point(|s| s <= key): ties go right
    const path: number[] = []
    let node = t
    while (node.kind === 'internal') {
      let c = 0
      while (c < node.keys.length && node.keys[c] <= key) c++
      path.push(c)
      node = node.children[c]
    }
    const leaf = node as LeafT
    let i = 0
    while (i < leaf.keys.length && leaf.keys[i] < key) i++
    leaf.keys.splice(i, 0, key)
    setTree(t)
    setValidation(null)
    setClimbed(null)
    if (leaf.keys.length <= LEAF_MAX) {
      setIdx((n) => n + 1)
      setMsg(`insert ${key}: the leaf had room — sorted position, records +1, no ceremony`)
    } else {
      setGate({ kind: 'leaf', path, keys: [...leaf.keys], q1ok: false, wrong: null })
      setMsg(`insert ${key}: leaf [${leaf.keys.join(' ')}] overflows — 5 records over LEAF_MAX ${LEAF_MAX}. Your call, surgeon.`)
    }
  }

  const applySplit = (g: Gate) => {
    const t = cloneTree(tree)
    let parent: IntT | null = null
    let node: TNode = t
    for (const p of g.path) {
      parent = node as IntT
      node = (node as IntT).children[p]
    }
    let promote: number
    let right: TNode
    if (g.kind === 'leaf') {
      const leaf = node as LeafT
      const r: LeafT = { kind: 'leaf', keys: leaf.keys.slice(3), next: leaf.next }
      leaf.keys = leaf.keys.slice(0, 3)
      leaf.next = r // splice the scan spine across the new leaf
      promote = r.keys[0] // a COPY climbs — the record stays in the right leaf
      right = r
    } else {
      const intl = node as IntT
      promote = intl.keys[2] // the median MOVES up — it stays in no child
      const r: IntT = { kind: 'internal', keys: intl.keys.slice(3), children: intl.children.slice(3) }
      intl.keys = intl.keys.slice(0, 2)
      intl.children = intl.children.slice(0, 3)
      right = r
    }

    let newT = t
    let newRoot = false
    if (parent === null) {
      newT = { kind: 'internal', keys: [promote], children: [node, right] }
      newRoot = true
    } else {
      const c = g.path[g.path.length - 1]
      parent.keys.splice(c, 0, promote)
      parent.children.splice(c + 1, 0, right)
    }
    setTree(newT)
    setValidation(null)
    setFlags((f) => (g.kind === 'leaf' ? { ...f, firstSplit: true } : { ...f, rootSplit: true }))

    const splitMsg =
      g.kind === 'leaf'
        ? `split landed: left kept [${g.keys.slice(0, 3).join(' ')}], right took [${g.keys.slice(3).join(' ')}] — a COPY of ${promote} climbed; the record stays in the right leaf.`
        : `internal split landed: left kept [${g.keys.slice(0, 2).join(' ')}], right took [${g.keys.slice(3).join(' ')}], and ${promote} MOVED up — it lives in no child now.`

    if (!newRoot && parent !== null && parent.keys.length > INTERNAL_MAX) {
      setGate({ kind: 'internal', path: g.path.slice(0, -1), keys: [...parent.keys], q1ok: false, wrong: null })
      setClimbed(null)
      setMsg(`${splitMsg} …but the parent now holds 5 separators — it must split too. Same question, different law: the median MOVES.`)
      return
    }
    setGate(null)
    setClimbed(promote)
    setIdx((n) => n + 1)
    setMsg(
      newRoot
        ? `${splitMsg} The splitting node WAS the root — a new root is manufactured with one separator: height ${heightOf(newT)}. The ONLY way height increases.`
        : splitMsg,
    )
  }

  const answerQ1 = (opt: { id: string; ok: boolean; correction: string }) => {
    if (!gate || gate.q1ok) return
    if (opt.ok) setGate({ ...gate, q1ok: true, wrong: null })
    else setGate({ ...gate, wrong: { choice: opt.id, correction: opt.correction } })
  }

  const answerQ2 = (k: number) => {
    if (!gate || !gate.q1ok) return
    const correct = gate.kind === 'leaf' ? gate.keys[3] : gate.keys[2]
    if (k !== correct) {
      setGate({
        ...gate,
        wrong: {
          choice: `k${k}`,
          correction:
            gate.kind === 'leaf'
              ? `left keeps [${gate.keys.slice(0, 3).join(' ')}], right takes [${gate.keys.slice(3).join(' ')}] — the separator must be the right leaf’s first key, so a copy of ${correct} climbs and keys[i] = min(children[i+1]) holds.`
              : `left keeps [${gate.keys.slice(0, 2).join(' ')}], right takes [${gate.keys.slice(3).join(' ')}] — ${correct} is the honest boundary between the halves, so it climbs and stays in no child.`,
        },
      })
      return
    }
    applySplit(gate)
  }

  const doRestart = () => {
    setTree(newTree())
    setIdx(0)
    setGate(null)
    setClimbed(null)
    setFlags({ firstSplit: false, rootSplit: false })
    setValidation(null)
    setMsg('fresh tree — one empty leaf, height 1. insert 10.')
  }

  const tasks: LabTask[] = useMemo(
    () => [
      {
        id: 'first-split',
        label: 'Call the first leaf split — separator = the right leaf’s first key, and only a COPY climbs',
        done: flags.firstSplit,
        hint: 'insert the script; at 5 records the leaf overflows and the floor is yours',
      },
      {
        id: 'root-split',
        label: 'Grow to height 3 — call the internal split (the median climbs, stays in NO child)',
        done: flags.rootSplit,
        hint: 'keep inserting rightmost; the root internal hits 5 separators right after the fifth leaf split',
      },
      {
        id: 'sorted-proof',
        label: 'Finish the script, then run validate() — zero violations',
        done: scriptDone && allOk,
        hint: 'occupancy, sortedness, separator law, one leaf depth, the next chain — the whole contract',
      },
    ],
    [flags, scriptDone, allOk],
  )

  const { nodes, edges, canvasW, canvasH } = useMemo(() => {
    const w = Math.max(560, measure(tree))
    const laid = layout(tree, 0, 0, w)
    const ns: Laid[] = []
    const es: { x1: number; y1: number; x2: number; y2: number }[] = []
    const collect = (l: Laid) => {
      ns.push(l)
      l.kids.forEach((k) => {
        es.push({ x1: l.cx, y1: l.y + NODE_H, x2: k.cx, y2: k.y })
        collect(k)
      })
    }
    collect(laid)
    return { nodes: ns, edges: es, canvasW: w, canvasH: (heightOf(tree) - 1) * LEVEL_H + NODE_H + 4 }
  }, [tree])

  const leafCount = nodes.filter((n) => n.node.kind === 'leaf').length
  const q1opts = gate ? Q1[gate.kind] : []

  return (
    <LabShell labId="btree-surgeon" trackColor={trackColor} tasks={tasks}>
      <p className="font-mono text-[10.5px] leading-relaxed text-text-3">
        production order is 32+ — lab 02 pins LEAF_MAX = INTERNAL_MAX = 32. this lab shrinks both to 4 so you can watch
        every split; the laws are unchanged: leaves 3 | 2 with a COPY climbing, internals 2 | median | 2 with the median
        in NO child, root split the only way up.
      </p>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-3">
        <button
          onClick={doInsert}
          disabled={gate !== null || idx >= SCRIPT.length}
          className={`rounded border px-2.5 py-1 ${
            gate !== null || idx >= SCRIPT.length
              ? 'cursor-not-allowed border-line text-text-3/50'
              : 'border-accent/60 bg-accent/10 text-accent'
          }`}
        >
          {idx >= SCRIPT.length ? 'script complete — 17 records in' : `insert ${SCRIPT[idx]}`}
        </button>
        <button onClick={() => setValidation(validateTree(tree, idx))} className="rounded border border-line px-2.5 py-1 hover:text-text-1">
          run validate()
        </button>
        <button onClick={doRestart} className="rounded border border-line px-2.5 py-1 hover:text-text-1">
          restart tree
        </button>
        <span className="ml-auto">
          height {heightOf(tree)} · records {idx} · leaves {leafCount}
        </span>
      </div>

      {/* what just happened */}
      <div className="mt-3 min-h-[34px] rounded border border-line bg-ink px-3 py-2 font-mono text-[11px] leading-relaxed text-text-2">
        {msg}
      </div>

      {/* the tree */}
      <div className="mt-4 overflow-x-auto rounded border border-line bg-ink p-2">
        <div className="relative mx-auto" style={{ width: canvasW, height: canvasH }}>
          <svg className="absolute inset-0" width={canvasW} height={canvasH}>
            {edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} className="stroke-line" strokeWidth={1.5} />
            ))}
          </svg>
          {nodes.map((l, i) => {
            const n = l.node
            const overflow = n.kind === 'leaf' ? n.keys.length > LEAF_MAX : n.keys.length > INTERNAL_MAX
            return (
              <div
                key={i}
                className={`absolute flex items-center justify-center rounded-md border ${
                  overflow ? 'border-danger' : n.kind === 'leaf' ? 'border-line bg-surface-1' : 'border-line-bright bg-surface-2'
                }`}
                style={{ left: l.cx - l.w / 2, top: l.y, width: l.w, height: NODE_H, gap: CHIP_GAP, padding: NODE_PAD }}
              >
                {n.keys.length === 0 ? (
                  <span className="font-mono text-[10px] text-text-3">empty leaf</span>
                ) : (
                  n.keys.map((k) => {
                    const isClimbed = n.kind === 'internal' && climbed === k
                    return (
                      <span
                        key={k}
                        className={`flex items-center justify-center rounded-sm border font-mono text-[11px] ${
                          isClimbed
                            ? 'border-accent bg-accent/15 text-accent'
                            : n.kind === 'leaf'
                              ? 'border-line bg-ink text-text-1'
                              : 'border-info/40 bg-info/10 text-info'
                        }`}
                        style={{ width: CHIP_W, height: NODE_H - 2 * NODE_PAD - 2 }}
                      >
                        {k}
                      </span>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-text-3">
        <span className="text-info">■</span> separators route, they hold no data ·{' '}
        <span className="text-text-1">■</span> records live in leaves ·{' '}
        <span style={{ color: trackColor }}>■</span> accent = the key that just climbed · red border = overflow awaiting
        your call
      </p>

      {/* the split call */}
      {gate && (
        <div className="mt-4 rounded-md border border-amber/50 bg-amber/5 p-3.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-amber">
            split call — {gate.kind} overflow: [{gate.keys.join(' ')}]
          </p>
          <p className="mt-2 font-mono text-[11px] text-text-2">1 · this {gate.kind} overflows — what happens?</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {q1opts.map((o) => {
              const picked = gate.q1ok && o.ok
              const wasWrong = gate.wrong?.choice === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => answerQ1(o)}
                  disabled={gate.q1ok}
                  className={`rounded border px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors ${
                    picked
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : wasWrong
                        ? 'border-danger/60 bg-danger/10 text-danger'
                        : 'border-line text-text-3 hover:text-text-1'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {gate.q1ok && (
            <>
              <p className="mt-3 font-mono text-[11px] text-text-2">2 · which key climbs?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gate.keys.map((k) => (
                  <button
                    key={k}
                    onClick={() => answerQ2(k)}
                    className={`rounded border px-2.5 py-1 font-mono text-[11px] ${
                      gate.wrong?.choice === `k${k}`
                        ? 'border-danger/60 bg-danger/10 text-danger'
                        : 'border-line text-text-2 hover:border-accent/60 hover:text-accent'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </>
          )}
          {gate.wrong && <p className="mt-2 font-mono text-[11px] leading-relaxed text-danger">✗ {gate.wrong.correction}</p>}
        </div>
      )}

      {/* validate() report */}
      {validation && (
        <div className="mt-4 rounded-md border border-line bg-ink p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
            validate() — {allOk ? <span className="text-accent">Ok(())</span> : <span className="text-danger">Err</span>}
          </p>
          <ul className="mt-2 space-y-1.5">
            {validation.map((v) => (
              <li key={v.name} className="flex items-start gap-2 font-mono text-[11px]">
                {v.ok ? <Check size={12} className="mt-0.5 shrink-0 text-accent" /> : <X size={12} className="mt-0.5 shrink-0 text-danger" />}
                <span className="text-text-2">
                  {v.name} <span className="text-text-3">— {v.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {allOk && !scriptDone && (
            <p className="mt-2 font-mono text-[10.5px] text-text-3">green so far — finish the script, then run it again for the proof.</p>
          )}
        </div>
      )}
    </LabShell>
  )
}
