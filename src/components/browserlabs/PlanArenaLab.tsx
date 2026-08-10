import { useMemo, useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * The Plan Arena (T5) — price the three join strategies against the lesson's
 * customers⋈orders card, pick the winner, then lose honestly on a stale
 * sketch. Every number is T5.L2's: NLJ 5,000 + 100,000 × 50,000 ≈ 5×10⁹
 * fetches, indexed NLJ 300,000 × random_page_cost, hash 55,000 in memory /
 * 3× spilled Grace. Cost constants are T0.L2's table. No clocks, no
 * randomness — the arithmetic is the lesson.
 */

/* ---- the arena card (T5.L2's running example, verbatim) ---- */
const CUSTOMERS = { rows: 100_000, pages: 5_000 }
const ORDERS = { rows: 1_000_000, pages: 50_000 } // ~20 rows per 8KB page
const TREE_LEVELS = 3 // T2: a million-row B+tree is ~3 levels

/* ---- T0.L2's cost constants ---- */
const SEQ = 1.0
const RANDOM = 4.0

/* ---- round 1 expected answers ---- */
const NLJ_FETCHES = CUSTOMERS.pages + CUSTOMERS.rows * ORDERS.pages // 5,000,005,000
const INL_FETCHES = CUSTOMERS.rows * TREE_LEVELS // 300,000, all random
const HASH_FITS = CUSTOMERS.pages + ORDERS.pages // 55,000 — the in-memory price
const HASH_FETCHES = 3 * HASH_FITS // 165,000 — Grace: read, write, re-read both sides

const INL_PRICE = INL_FETCHES * RANDOM // 1,200,000
const HASH_PRICE = HASH_FETCHES * SEQ
const WINNER = 'hash' as const // 165,000 < 1,200,000 < 5×10⁹

/* ---- round 2: the stale sketch (T5.L3's "stale stats" case) ---- */
const STALE_EST_ROWS = 50 // sketch's MCV frequency for segment='wholesale'
const ACTUAL_ROWS = 50_000 // after last night's bulk load — the sketch predates it
const STALE_INL_FETCHES = STALE_EST_ROWS * TREE_LEVELS // 150 — the paper bargain
const REAL_INL_FETCHES = ACTUAL_ROWS * TREE_LEVELS // 150,000 random — the bill
const STALE_INL_PRICE = STALE_INL_FETCHES * RANDOM // 600
const REAL_INL_PRICE = REAL_INL_FETCHES * RANDOM // 600,000
// the alternative the stale card talked the planner out of: build 50,000 rows
// ≈ 2,500 pages = 20MB > 4MB work_mem → Grace again
const R2_HASH_PRICE = HASH_FETCHES * SEQ // 165,000

const fmt = (n: number) => n.toLocaleString('en-US')
const within5 = (s: string, expected: number) => {
  const v = parseFloat(s)
  return s.trim() !== '' && !Number.isNaN(v) && Math.abs(v - expected) / expected < 0.05
}

/** per-field coaching: name the ORDER of the error, then the mechanism */
function missFeedback(input: string, expected: number, formula: string): string | null {
  const v = parseFloat(input)
  if (input.trim() === '' || Number.isNaN(v)) return null
  const r = v / expected
  if (r >= 0.08 && r <= 0.125) return `~10× low — ${formula}`
  if (r >= 8 && r <= 12.5) return `~10× high — ${formula}`
  if (r < 0.001) return `orders of magnitude low — ${formula}`
  if (r > 1000) return `orders of magnitude high — ${formula}`
  return `off — ${formula}`
}

type PlanId = 'nlj' | 'inl' | 'hash'
type FixId = 'analyze' | 'extended' | 'nothing'

export default function PlanArenaLab({ trackColor }: { trackColor: string }) {
  /* round 1 */
  const [nljIn, setNljIn] = useState('')
  const [inlIn, setInlIn] = useState('')
  const [hashIn, setHashIn] = useState('')
  const [pick, setPick] = useState<PlanId | null>(null)
  /* round 2 */
  const [stalePick, setStalePick] = useState<PlanId | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [realCostIn, setRealCostIn] = useState('')
  const [fix, setFix] = useState<FixId | null>(null)

  const nljOk = within5(nljIn, NLJ_FETCHES)
  const inlOk = within5(inlIn, INL_FETCHES)
  const hashOk = within5(hashIn, HASH_FETCHES)
  const hashTrap = within5(hashIn, HASH_FITS) // priced it in-memory
  const realCostOk = within5(realCostIn, REAL_INL_FETCHES)

  const tasks: LabTask[] = useMemo(
    () => [
      {
        id: 'cost-nlj',
        label: `Price the naive nested loop — total page fetches (±5%)`,
        done: nljOk,
        hint: 'pages(outer) + rows(outer) × pages(inner). customers is the outer.',
      },
      {
        id: 'cost-hash',
        label: 'Price the hash join as the memory line forces it (±5%)',
        done: hashOk,
        hint: 'the build side is 5,000 pages = 40MB; work_mem is 4MB. What does Grace cost?',
      },
      {
        id: 'pick-winner',
        label: 'Pick the plan the planner picks on the true card',
        done: pick === WINNER,
        hint: 'one currency: sequential fetches ×1.0, random ×4.0',
      },
      {
        id: 'misestimate-autopsy',
        label: 'Round 2: call the stale plan’s real cost, then name the fix',
        done: realCostOk && fix === 'analyze',
        hint: 'the sketch said 50 rows; the loop runs the ACTUAL count',
      },
    ],
    [nljOk, hashOk, pick, realCostOk, fix],
  )

  const pickFeedback =
    pick === null
      ? null
      : pick === WINNER
        ? {
            ok: true,
            msg: `the planner’s pick — ${fmt(HASH_PRICE)} units against the indexed loop’s ${fmt(INL_PRICE)} and the naive loop’s ${fmt(NLJ_FETCHES)}. Spilled and still not close.`,
          }
        : {
            ok: false,
            msg: `the arena prices hash at ${fmt(HASH_PRICE)} units, the indexed loop at ${fmt(INL_PRICE)}, the naive loop at ${fmt(NLJ_FETCHES)}. Recheck your numbers — the cheapest plan wins.`,
          }

  const stalePickFeedback =
    stalePick === null
      ? null
      : stalePick === 'inl'
        ? { ok: true, msg: `on the card’s numbers, yes: 50 probes × 3 pages × 4.0 = ${fmt(STALE_INL_PRICE)} units against the hash’s ${fmt(HASH_FITS)}. The planner takes the index. Now lift the card.` }
        : { ok: false, msg: `follow the card — on THESE numbers the index descent costs ${fmt(STALE_INL_PRICE)} units against the hash’s ${fmt(HASH_FITS)}. Being wrong is the point of the round.` }

  const fixFeedback =
    fix === null
      ? null
      : fix === 'analyze'
        ? { ok: true, msg: 'Yes. The sketch predates the bulk load — ANALYZE resamples, the estimate jumps to ~50,000, and the planner prices the hash join instead. T5.L3’s tuning order: is the sketch fresh? First question, every time.' }
        : fix === 'extended'
          ? { ok: false, msg: 'That’s the fix for CORRELATED columns — the independence-multiplication bug. This estimate isn’t multiplied-wrong, it’s STALE: the data changed under a fresh-enough sketch. Different mechanism, different fix.' }
          : { ok: false, msg: 'A 1,000× mis-estimate doesn’t heal itself — the sketch refreshes on ANALYZE’s schedule, not on your writes. Until then every plan on this predicate is priced for yesterday’s table.' }

  return (
    <LabShell labId="plan-arena" trackColor={trackColor} tasks={tasks}>
      {/* constants strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-text-3">
        <span className="text-text-2">T0.L2’s price sheet:</span>
        <span>seq_page_cost <span className="text-text-1">1.0</span></span>
        <span>random_page_cost <span className="text-text-1">4.0</span></span>
        <span>cpu_tuple_cost <span className="text-text-1">0.01</span></span>
        <span className="ml-auto">the arena prices fetches, as the lesson’s formulas do — the tuple term flips no ranking here</span>
      </div>

      {/* ---------------- round 1 ---------------- */}
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">round 1 — cost the joins</p>
      <div className="mt-2 rounded-md border border-line bg-ink p-3 font-mono text-[11.5px] leading-relaxed text-text-2">
        <span className="text-text-1">the card (true stats):</span> customers <span className="text-text-1">100,000 rows / 5,000 pages</span> ⋈ orders <span className="text-text-1">1,000,000 rows / 50,000 pages</span> on <span className="text-accent">orders.customer_id = customers.id</span>
        <br />
        work_mem <span className="text-amber">4MB</span> · index on <span className="text-text-1">orders.customer_id</span> (a {TREE_LEVELS}-level tree, T2 arithmetic) · join on equality, so all three strategies are on the table
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {(
          [
            {
              id: 'nlj' as PlanId,
              name: 'nested loop',
              formula: 'pages(outer) + rows(outer) × pages(inner) = 5,000 + 100,000 × 50,000',
              input: nljIn,
              set: setNljIn,
              ok: nljOk,
              trap: null as string | null,
              miss: missFeedback(nljIn, NLJ_FETCHES, 'every one of the 100,000 outer rows re-scans all 50,000 inner pages'),
              price: parseFloat(nljIn) * SEQ,
              okNote: 'the inner loop runs a full 50,000-page scan per outer row — buffer hits and all, this is the 5×10⁹ plan',
            },
            {
              id: 'inl' as PlanId,
              name: 'indexed nested loop',
              formula: 'rows(outer) × tree levels = 100,000 × 3 random fetches',
              input: inlIn,
              set: setInlIn,
              ok: inlOk,
              trap: null as string | null,
              miss: missFeedback(inlIn, INL_FETCHES, 'one ~3-level tree descent per outer row — 3 random pages per probe'),
              price: parseFloat(inlIn) * RANDOM,
              okNote: `300,000 RANDOM fetches — priced ×${RANDOM.toFixed(1)}: ${fmt(INL_PRICE)} units. The OLTP plan.`,
            },
            {
              id: 'hash' as PlanId,
              name: 'hash join',
              formula: 'fits: 5,000 + 50,000 — but does the 40MB build side fit 4MB work_mem?',
              input: hashIn,
              set: setHashIn,
              ok: hashOk,
              trap: hashTrap
                ? '55,000 is the IN-MEMORY price. The build side is 5,000 pages = 40MB against 4MB work_mem — Grace partitions both sides to disk: read, write, re-read.'
                : null,
              miss: missFeedback(hashIn, HASH_FETCHES, 'spilled Grace: each side is read, written, and re-read — 3 × (5,000 + 50,000)'),
              price: parseFloat(hashIn) * SEQ,
              okNote: '3 × 55,000 — read both, spill both, re-join bucket by bucket. Linear degradation, not a cliff.',
            },
          ]
        ).map((s) => (
          <div
            key={s.id}
            className={`rounded-md border p-3 ${s.ok ? 'border-accent/50 bg-accent/5' : 'border-line bg-ink'}`}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">{s.name}</p>
            <p className="mt-1.5 font-mono text-[10.5px] leading-snug text-text-3">{s.formula}</p>
            <input
              value={s.input}
              onChange={(e) => s.set(e.target.value)}
              placeholder="page fetches"
              className="mt-2 w-full rounded border border-line bg-surface-1 px-3 py-1.5 font-mono text-[12px] text-text-1 outline-none placeholder:text-text-3 focus:border-accent/60"
            />
            <p className="mt-1.5 min-h-4 font-mono text-[10.5px] leading-snug">
              {s.ok ? (
                <span className="text-accent">✓ {fmt(parseFloat(s.input))} fetches — {s.okNote}</span>
              ) : s.trap ? (
                <span className="text-amber">{s.trap}</span>
              ) : s.miss ? (
                <span className="text-danger">{s.miss}</span>
              ) : (
                <span className="text-text-3">your number — the arithmetic IS the lesson</span>
              )}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-3">
              planner price: {s.input.trim() !== '' && !Number.isNaN(parseFloat(s.input)) ? fmt(s.price) : '—'} units
            </p>
          </div>
        ))}
      </div>

      {/* the pick */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="font-mono text-[11px] text-text-3">you are the planner. cheapest plan wins:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { id: 'nlj' as PlanId, label: 'nested loop' },
              { id: 'inl' as PlanId, label: 'indexed nested loop' },
              { id: 'hash' as PlanId, label: 'hash join' },
            ]
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setPick(o.id)}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                pick === o.id
                  ? o.id === WINNER
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-danger/60 bg-danger/10 text-danger'
                  : 'border-line text-text-3 hover:text-text-1'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {pickFeedback && (
          <p className={`mt-2 font-mono text-[11px] leading-snug ${pickFeedback.ok ? 'text-accent' : 'text-danger'}`}>
            {pickFeedback.msg}
          </p>
        )}
      </div>

      {/* ---------------- round 2 ---------------- */}
      <div className="mt-6 border-t border-line pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">round 2 — the mis-estimate</p>
        <div className="mt-2 rounded-md border border-amber/40 bg-amber/5 p-3 font-mono text-[11.5px] leading-relaxed text-text-2">
          <span className="text-amber">the planner’s card (stale sketch):</span> the query filters customers on{' '}
          <span className="text-text-1">segment = 'wholesale'</span>. ANALYZE’s sketch — collected before last night’s
          bulk load onboarded the wholesale segment — has the value at frequency 0.0005:{' '}
          <span className="text-amber">est. rows = 50</span>. The card is all the planner gets.
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { name: 'indexed nested loop, on paper', units: STALE_INL_PRICE, note: '50 est. probes × 3 pages × 4.0' },
            { name: 'hash join, on paper', units: HASH_FITS, note: 'scan both sides once: 5,000 + 50,000 (50-row build fits easily)' },
          ].map((p) => (
            <div key={p.name} className={`rounded-md border p-3 ${p.units === STALE_INL_PRICE ? 'border-accent/50 bg-accent/5' : 'border-line bg-ink'}`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
                {p.name} {p.units === STALE_INL_PRICE && <span className="text-accent">· wins on paper</span>}
              </p>
              <p className="mt-1 font-display text-h3 text-text-1">{fmt(p.units)} units</p>
              <p className="mt-1 font-mono text-[10px] text-text-3">{p.note}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 font-mono text-[11px] text-text-3">pick per the stale card:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { id: 'inl' as PlanId, label: 'indexed nested loop' },
              { id: 'hash' as PlanId, label: 'hash join' },
            ]
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setStalePick(o.id)}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                stalePick === o.id
                  ? o.id === 'inl'
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-danger/60 bg-danger/10 text-danger'
                  : 'border-line text-text-3 hover:text-text-1'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {stalePickFeedback && (
          <p className={`mt-2 font-mono text-[11px] leading-snug ${stalePickFeedback.ok ? 'text-accent' : 'text-danger'}`}>
            {stalePickFeedback.msg}
          </p>
        )}

        <button
          onClick={() => setRevealed(true)}
          disabled={stalePick !== 'inl'}
          className={`mt-3 rounded border px-3 py-1.5 font-mono text-[11px] transition-colors ${
            stalePick === 'inl'
              ? 'border-amber/60 bg-amber/10 text-amber hover:bg-amber/20'
              : 'cursor-not-allowed border-line text-text-3 opacity-50'
          }`}
        >
          run it — lift the card (EXPLAIN ANALYZE)
        </button>

        {revealed && (
          <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-3">
            <p className="font-mono text-[11.5px] leading-relaxed text-text-2">
              <span className="text-danger">actual rows = 50,000.</span> The wholesale segment landed after the last
              ANALYZE; the sketch was pricing yesterday’s table. Your picked plan doesn’t re-plan — it runs 50,000
              probes down that 3-level tree.
            </p>

            <p className="mt-3 font-mono text-[11px] text-text-3">
              call what the stale plan really costs — total page fetches:
            </p>
            <input
              value={realCostIn}
              onChange={(e) => setRealCostIn(e.target.value)}
              placeholder="fetches"
              className="mt-1.5 w-full max-w-xs rounded border border-line bg-surface-1 px-3 py-1.5 font-mono text-[12px] text-text-1 outline-none placeholder:text-text-3 focus:border-accent/60"
            />
            <p className="mt-1.5 min-h-4 font-mono text-[10.5px] leading-snug">
              {realCostOk ? (
                <span className="text-accent">
                  ✓ {fmt(REAL_INL_FETCHES)} random fetches = {fmt(REAL_INL_PRICE)} units — against {fmt(STALE_INL_PRICE)} on paper: a 1,000×
                  confession. And the hash the card talked you out of? Its build side is now 50,000 rows ≈ 20MB — Grace
                  again: {fmt(R2_HASH_PRICE)} units. The truth would have picked hash.
                </span>
              ) : within5(realCostIn, STALE_INL_FETCHES) ? (
                <span className="text-amber">that’s the PAPER cost — 150 priced 50 probes. The loop runs the actual 50,000.</span>
              ) : (
                missFeedback(realCostIn, REAL_INL_FETCHES, 'the plan is fixed: 50,000 actual probes × 3 pages per descent') ?? (
                  <span className="text-text-3">the plan doesn’t change — the cardinality underneath it did</span>
                )
              )}
            </p>

            <p className="mt-3 font-mono text-[11px] text-text-3">the fix:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { id: 'analyze' as FixId, label: 'run ANALYZE' },
                  { id: 'extended' as FixId, label: 'CREATE STATISTICS (extended stats)' },
                  { id: 'nothing' as FixId, label: 'nothing — plans heal themselves' },
                ]
              ).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFix(o.id)}
                  className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    fix === o.id
                      ? o.id === 'analyze'
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-danger/60 bg-danger/10 text-danger'
                      : 'border-line text-text-3 hover:text-text-1'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {fixFeedback && (
              <p className={`mt-2 font-mono text-[11px] leading-snug ${fixFeedback.ok ? 'text-accent' : 'text-danger'}`}>
                {fixFeedback.msg}
              </p>
            )}
          </div>
        )}
      </div>
    </LabShell>
  )
}
