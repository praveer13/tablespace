import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Check, ChevronRight, Play } from 'lucide-react'
import { DRILLS, type DrillIncident, type DrillSeries } from '@/data/drills'
import { useProgress, XP } from '@/lib/progress'
import { cn } from '@/lib/utils'

/**
 * Crash Week — the capstone's incident-reading exam. Four scripted cards,
 * static telemetry, no wasm: read the curves, call cause + mitigation.
 * Incident-card pattern adapted from the platform's Fleet Week Act IV.
 */
export default function Drills() {
  const [idx, setIdx] = useState(0)
  const [cause, setCause] = useState<string | null>(null)
  const [mitigation, setMitigation] = useState<string | null>(null)
  const [called, setCalled] = useState(false)
  const [solved, setSolved] = useState<string[]>([])
  const completeAct = useProgress((s) => s.completeFleetWeekAct)

  const incident: DrillIncident = DRILLS[idx]
  const causeOk = incident.causes.find((c) => c.id === cause)?.correct ?? false
  const mitOk = incident.mitigations.find((m) => m.id === mitigation)?.correct ?? false
  const calledRight = called && causeOk && mitOk

  const open = (i: number) => {
    setIdx(i)
    setCause(null)
    setMitigation(null)
    setCalled(false)
  }

  const submit = () => {
    if (!cause || !mitigation) return
    setCalled(true)
    if (causeOk && mitOk) {
      const next = solved.includes(incident.id) ? solved : [...solved, incident.id]
      setSolved(next)
      if (next.length >= DRILLS.length) completeAct('drills', 1)
    }
  }

  return (
    <div className="mx-auto max-w-app px-6 pb-24 pt-16 lg:px-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">capstone · crash week</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-text-1">Read the dying engine.</h1>
      <p className="mt-4 max-w-2xl text-body-lg text-text-2">
        Four incidents, real-shape telemetry, no simulator to hide behind. For each card: read the
        briefing and the curves, call the root cause and the mitigation. Diagnose all four — the
        debrief is the lesson. <span className="text-text-3">(+{XP.fleetWeekAct} XP on the full set)</span>
      </p>

      <div className="mt-8 flex flex-wrap gap-2 font-mono text-[12px]">
        {DRILLS.map((d, i) => (
          <button
            key={d.id}
            onClick={() => open(i)}
            className={cn(
              'rounded border px-3 py-1.5 transition-colors',
              idx === i ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-text-3 hover:text-text-1',
            )}
          >
            {solved.includes(d.id) ? '✓ ' : ''}
            {d.title.split('—')[0].trim()}
          </button>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-line bg-surface-1 p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">{incident.title}</p>
        <p className="mt-3 max-w-3xl text-body-sm text-text-2">{incident.briefing}</p>

        <TelemetryGrid series={incident.telemetry} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">root cause</p>
            <div className="mt-2 space-y-1.5">
              {incident.causes.map((c) => (
                <Option key={c.id} active={cause === c.id} onClick={() => { setCause(c.id); setCalled(false) }} label={c.label} />
              ))}
            </div>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">mitigation</p>
            <div className="mt-2 space-y-1.5">
              {incident.mitigations.map((m) => (
                <Option key={m.id} active={mitigation === m.id} onClick={() => { setMitigation(m.id); setCalled(false) }} label={m.label} />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!cause || !mitigation}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-accent/60 bg-accent/10 px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> call it <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {called && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('mt-4 rounded-md border p-4', calledRight ? 'border-accent/50 bg-accent/10' : 'border-amber/50 bg-amber/5')}
          >
            {calledRight ? (
              <>
                <p className="font-mono text-sm text-accent">
                  <Check className="mr-1 inline h-4 w-4" /> CORRECT CALL — {solved.length}/{DRILLS.length} diagnosed
                </p>
                <p className="mt-2 text-body-sm text-text-2">{incident.debrief}</p>
                {solved.length >= DRILLS.length && (
                  <p className="mt-3 font-mono text-[12px] text-accent">
                    all four diagnosed — the engine fears you. close the loop on{' '}
                    <Link to="/engine" className="underline">The Engine</Link> or finish the{' '}
                    <Link to="/labs/hnsw" className="underline">capstone lab</Link>.
                  </p>
                )}
              </>
            ) : (
              <p className="font-mono text-sm text-amber">
                WRONG CALL — cause {causeOk ? '✓' : '✗'} · mitigation {mitOk ? '✓' : '✗'}. Re-read the curves:
                what moves first, and what never moves at all?
              </p>
            )}
          </motion.div>
        )}
      </section>
    </div>
  )
}

function Option({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'block w-full rounded border px-3 py-2 text-left font-mono text-[12px] transition-colors',
        active ? 'border-accent/60 bg-accent/10 text-text-1' : 'border-line bg-ink text-text-2 hover:border-text-3',
      )}
    >
      {label}
    </button>
  )
}

function TelemetryGrid({ series }: { series: DrillSeries[] }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {series.map((s) => (
        <div key={s.label} className="rounded-md border border-line bg-ink p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">{s.label}</p>
          <Sparkline values={s.values} color={s.color} />
          <p className="mt-1 font-mono text-[10px] text-text-3">
            final: {s.values[s.values.length - 1]} · min {Math.min(...s.values)} · max {Math.max(...s.values)}
          </p>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const d = useMemo(() => {
    if (values.length < 2) return ''
    const max = Math.max(...values, 1e-9)
    const min = Math.min(...values)
    return values
      .map((v, i) => `${(i / (values.length - 1)) * 100},${34 - ((v - min) / Math.max(1e-9, max - min)) * 30}`)
      .join(' ')
  }, [values])
  if (!d) return <div className="h-9" />
  return (
    <svg viewBox="0 0 100 36" className="mt-1 h-9 w-full" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
