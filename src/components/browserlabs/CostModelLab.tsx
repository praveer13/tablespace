import { useMemo, useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * The Cost Model Arena (T0) — price a sequential scan vs a B+tree point
 * lookup path against honest device numbers, and find where the plan flips.
 * Constants match T0.L2's table (HDD ~10ms random / ~40µs sequential).
 * Everything is computed; no clocks, no randomness.
 */

const ROWS_PER_PAGE = 80 // T1 arithmetic: ~80 rows per 8KB page
const TREE_HEIGHT = 3 // levels descended per point lookup (T2 fanout math)
const DEVICES = {
  hdd: { label: 'HDD', randomMs: 10, seqMs: 0.04 }, // 250× — the axis
  nvme: { label: 'NVMe', randomMs: 0.06, seqMs: 0.003 }, // ~20× raw — the flattening
} as const
type DeviceId = keyof typeof DEVICES

const fmtMs = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 1 ? `${ms.toFixed(1)} ms` : `${(ms * 1000).toFixed(0)} µs`

export default function CostModelLab({ trackColor }: { trackColor: string }) {
  const [device, setDevice] = useState<DeviceId>('hdd')
  const [rowsLog, setRowsLog] = useState(6) // 10^6 rows
  const [selLog, setSelLog] = useState(0) // selectivity 10^-3 .. 1 (log slider -3..0 → show %)
  const [nvmeAnswer, setNvmeAnswer] = useState<string | null>(null)
  const [scanAnswer, setScanAnswer] = useState('')

  const rows = Math.round(10 ** rowsLog)
  const selectivity = 10 ** (selLog - 3) // -3 → 0.1%, 0 → 100%
  const pages = Math.max(1, Math.round(rows / ROWS_PER_PAGE))
  const fetched = Math.max(1, Math.round(rows * selectivity))

  const dev = DEVICES[device]
  const scanMs = pages * dev.seqMs
  const indexMs = fetched * TREE_HEIGHT * dev.randomMs
  const indexWins = indexMs < scanMs

  // crossover selectivity: K*H*rand = P*seq → sel* = P*seq/(R*H*rand) = seq/(80*H*rand)
  const crossover = dev.seqMs / (ROWS_PER_PAGE * TREE_HEIGHT * dev.randomMs)

  const tasks: LabTask[] = useMemo(() => {
    // task 1: student has driven the config to where the scan beats the index on HDD
    const foundFlip = device === 'hdd' && !indexWins && selectivity < 0.5
    // task 2: conceptual call on the NVMe crossover (smaller ratio → index wins MORE often → flip moves higher)
    const nvmeCall = nvmeAnswer === 'higher'
    // task 3: 1B-row HDD scan time within 5%
    const expectedMin = ((1e9 / ROWS_PER_PAGE) * DEVICES.hdd.seqMs) / 60_000
    const given = parseFloat(scanAnswer)
    const scanOk = scanAnswer.trim() !== '' && Math.abs(given - expectedMin) / expectedMin < 0.05
    return [
      {
        id: 'find-the-flip',
        label: 'On the HDD, drag selectivity until the full scan BEATS the index',
        done: foundFlip,
        hint: 'the index pays a random read per row per level — when does that stop paying off?',
      },
      {
        id: 'nvme-call',
        label: 'Call it: on NVMe, the crossover selectivity moves…',
        done: nvmeCall,
        hint: 'random:sequential was 250× on the HDD. It is ~20× here. A cheaper random read makes the index win MORE often — which way does the flip point move?',
      },
      {
        id: 'billion-scan',
        label: `Price it: a 1,000,000,000-row table on the HDD — full scan minutes (±5%)`,
        done: scanOk,
        hint: 'rows ÷ rows-per-page × the sequential page cost. The arithmetic IS the lesson.',
      },
    ]
  }, [device, indexWins, selectivity, nvmeAnswer, scanAnswer])

  return (
    <LabShell labId="cost-model" trackColor={trackColor} tasks={tasks}>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-3">
        {(Object.keys(DEVICES) as DeviceId[]).map((d) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={
              device === d
                ? 'rounded border border-accent/60 bg-accent/10 px-2.5 py-1 text-accent'
                : 'rounded border border-line px-2.5 py-1 hover:text-text-1'
            }
          >
            {DEVICES[d].label}
          </button>
        ))}
        <span className="ml-auto">
          random {fmtMs(dev.randomMs)} · sequential {fmtMs(dev.seqMs)} per 8KB page
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block font-mono text-[11px] text-text-3">
          rows: <span className="text-text-1">{rows.toLocaleString()}</span> → {pages.toLocaleString()} pages
          <input
            type="range" min={4} max={9} step={1} value={rowsLog}
            onChange={(e) => setRowsLog(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
          />
        </label>
        <label className="block font-mono text-[11px] text-text-3">
          selectivity: <span className="text-text-1">{(selectivity * 100).toFixed(selectivity < 0.01 ? 2 : 0)}%</span> → fetch {fetched.toLocaleString()} rows
          <input
            type="range" min={0} max={3} step={0.05} value={selLog}
            onChange={(e) => setSelLog(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
          />
        </label>
      </div>

      {/* the two plans, priced live */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          { name: 'seq scan', ms: scanMs, note: `${pages.toLocaleString()} pages × ${fmtMs(dev.seqMs)}` },
          { name: 'index path', ms: indexMs, note: `${fetched.toLocaleString()} rows × ${TREE_HEIGHT} levels × ${fmtMs(dev.randomMs)}` },
        ].map((p) => {
          const win = p.ms === Math.min(scanMs, indexMs)
          const pct = (100 * p.ms) / Math.max(scanMs, indexMs)
          return (
            <div key={p.name} className={`rounded-md border p-3 ${win ? 'border-accent/50 bg-accent/5' : 'border-line bg-ink'}`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
                {p.name} {win && <span className="text-accent">· planner picks this</span>}
              </p>
              <p className="mt-1 font-display text-h3 text-text-1">{fmtMs(p.ms)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={`h-full rounded-full ${win ? 'bg-accent' : 'bg-text-3/50'}`} style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
              <p className="mt-2 font-mono text-[10px] text-text-3">{p.note}</p>
            </div>
          )
        })}
      </div>
      <p className="mt-3 font-mono text-[10.5px] text-text-3">
        crossover on {dev.label}: selectivity ≈ {(crossover * 100).toFixed(2)}% — above it the scan wins, below it the index wins
      </p>

      {/* task inputs */}
      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] text-text-3">on NVMe the crossover moves…</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { id: 'higher', label: 'much higher' },
              { id: 'same', label: 'about the same' },
              { id: 'lower', label: 'much lower' },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => setNvmeAnswer(o.id)}
                className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  nvmeAnswer === o.id
                    ? o.id === 'higher'
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-danger/60 bg-danger/10 text-danger'
                    : 'border-line text-text-3 hover:text-text-1'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[11px] text-text-3">1B-row HDD scan, in minutes:</p>
          <input
            value={scanAnswer}
            onChange={(e) => setScanAnswer(e.target.value)}
            placeholder="your number"
            className="mt-2 w-full rounded border border-line bg-ink px-3 py-1.5 font-mono text-[12px] text-text-1 outline-none placeholder:text-text-3 focus:border-accent/60"
          />
        </div>
      </div>
    </LabShell>
  )
}
