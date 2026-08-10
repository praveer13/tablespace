import { useEffect, useMemo, useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * WAL Replay (T3) — drag the crash point over a checksummed log, call what
 * recovery will apply, then run it and get graded cell by cell. Constants
 * match lab 03: records are [lsn u64][op u8][klen u16][vlen u16][key]
 * [value][crc32] (13B header + 4B crc), and recovery stops at the first
 * torn/corrupt record, applies committed work only (the pending list
 * drains on each OP_COMMIT), truncates after the last valid record, and
 * must be idempotent. Fixed scenario; no clocks, no randomness.
 */

const REC_HEADER = 13 // lab 03: lsn(8) + op(1) + klen(2) + vlen(2)
const REC_CRC = 4

type Op = 'put' | 'del' | 'commit'

interface Rec {
  lsn: number
  op: Op
  key?: string
  val?: string
  /** the segment between commit records — lab 03's format carries no txn id */
  txn: 1 | 2 | 3
  start: number
  len: number
}

function buildLog(): Rec[] {
  const script: Array<[Op, 1 | 2 | 3, string?, string?]> = [
    ['put', 1, 'x', '1'],
    ['put', 1, 'y', '9'],
    ['commit', 1],
    ['put', 2, 'x', '2'],
    ['del', 2, 'y'],
    ['commit', 2],
    ['put', 3, 'z', '7'],
    ['put', 3, 'w', '4'],
  ]
  let off = 0
  return script.map(([op, txn, key, val], i) => {
    const len = REC_HEADER + (key?.length ?? 0) + (val?.length ?? 0) + REC_CRC
    const rec: Rec = { lsn: i + 1, op, key, val, txn, start: off, len }
    off += len
    return rec
  })
}

const LOG = buildLog()
const TOTAL = LOG.reduce((n, r) => n + r.len, 0)
const TXNS = [1, 2, 3] as const
const CELLS = TXNS.length + LOG.length // 3 txn calls + 8 record calls

interface Verdict {
  valid: boolean[]
  applied: boolean[]
  committed: boolean[]
  stopIdx: number
  stopKind: 'torn' | 'crc' | null
  prefixBytes: number
  lastLsn: number
  store: [string, string][]
  droppedPending: number
}

/** lab 03's recover(), exactly: walk, stop at the first invalid record, drain pending per commit. */
function recover(crashByte: number, corruptLsn: number | null): Verdict {
  const valid = LOG.map(() => false)
  let stopIdx = LOG.length
  let stopKind: Verdict['stopKind'] = null
  for (let i = 0; i < LOG.length; i++) {
    const r = LOG[i]
    const complete = crashByte >= r.start + r.len
    const crcOk = r.lsn !== corruptLsn
    if (complete && crcOk) {
      valid[i] = true
    } else {
      stopIdx = i
      stopKind = complete ? 'crc' : crashByte > r.start ? 'torn' : null
      break
    }
  }
  const committed = TXNS.map(() => false)
  for (let i = 0; i < stopIdx; i++) if (LOG[i].op === 'commit') committed[LOG[i].txn - 1] = true
  const applied = LOG.map((r, i) => valid[i] && (r.op === 'commit' || committed[r.txn - 1]))

  const map = new Map<string, string>()
  let pending: Array<[string, string | null]> = [] // [key, value] — null is the del tombstone
  for (let i = 0; i < stopIdx; i++) {
    const r = LOG[i]
    if (r.op === 'commit') {
      for (const [k, v] of pending) {
        if (v === null) map.delete(k)
        else map.set(k, v)
      }
      pending = []
    } else if (r.key !== undefined) {
      pending.push([r.key, r.op === 'put' ? (r.val ?? '') : null])
    }
  }

  return {
    valid,
    applied,
    committed,
    stopIdx,
    stopKind,
    prefixBytes: stopIdx === LOG.length ? TOTAL : LOG[stopIdx].start,
    lastLsn: stopIdx === 0 ? 0 : LOG[stopIdx - 1].lsn,
    store: [...map.entries()].sort(),
    droppedPending: pending.length,
  }
}

interface Run {
  crashByte: number
  corruptLsn: number | null
  txnCalls: boolean[]
  recCalls: boolean[]
}

const IDEM_OPTIONS = [
  { id: 'journal', label: 'recovery keeps a replay journal and skips records it has seen before' },
  { id: 'idem', label: 'replay is idempotent: applying applied records changes nothing' },
  { id: 'truncate', label: 'the truncation hides the tail, so the second run finds nothing to do' },
] as const

export default function WalReplayLab({ trackColor }: { trackColor: string }) {
  const [crashByte, setCrashByte] = useState(TOTAL)
  const [corruptLsn, setCorruptLsn] = useState<number | null>(null)
  const [txnCalls, setTxnCalls] = useState<boolean[]>(TXNS.map(() => false))
  const [recCalls, setRecCalls] = useState<boolean[]>(LOG.map(() => false))
  const [run, setRun] = useState<Run | null>(null)
  const [step, setStep] = useState(0)
  const [again, setAgain] = useState(false)
  const [idemChoice, setIdemChoice] = useState<string | null>(null)
  const [latched, setLatched] = useState<string[]>([])

  // any change to the injury or the call voids the last grading
  const clearRun = () => {
    setRun(null)
    setStep(0)
    setAgain(false)
    setIdemChoice(null)
  }

  const verdict = useMemo(() => (run ? recover(run.crashByte, run.corruptLsn) : null), [run])

  // latch earned tasks once a run grades fully correct — re-arranging the
  // board afterwards never un-earns them
  const latch = (ids: string[]) =>
    setLatched((prev) => {
      const fresh = ids.filter((id) => !prev.includes(id))
      return fresh.length ? [...prev, ...fresh] : prev
    })

  // the replay animation: records light up one at a time; the final step
  // also grades the run and latches whatever it earned
  useEffect(() => {
    if (!run || !verdict || step >= LOG.length) return
    const t = setTimeout(() => {
      const next = step + 1
      setStep(next)
      if (next < LOG.length) return
      const ok =
        TXNS.every((_, i) => run.txnCalls[i] === verdict.committed[i]) &&
        LOG.every((_, i) => run.recCalls[i] === verdict.applied[i])
      if (!ok) return
      const torn = LOG.some((r) => run.crashByte > r.start && run.crashByte < r.start + r.len)
      const boundary = run.crashByte === TOTAL || LOG.some((r) => r.start === run.crashByte)
      const earned: string[] = []
      if (run.corruptLsn === null && boundary && run.crashByte > 0) earned.push('clean-crash')
      if (run.corruptLsn === null && torn) earned.push('torn-tail')
      const target = run.corruptLsn === null ? undefined : LOG.find((r) => r.lsn === run.corruptLsn)
      if (target && run.crashByte >= target.start + target.len) earned.push('corrupt-record')
      latch(earned)
    }, 140)
    return () => clearTimeout(t)
  }, [run, step, verdict])

  const graded = Boolean(run && verdict && step >= LOG.length)
  const matches = useMemo(() => {
    if (!run || !verdict) return null
    return {
      txn: TXNS.map((_, i) => run.txnCalls[i] === verdict.committed[i]),
      rec: LOG.map((_, i) => run.recCalls[i] === verdict.applied[i]),
    }
  }, [run, verdict])
  const rightCells = matches ? matches.txn.filter(Boolean).length + matches.rec.filter(Boolean).length : 0
  const allCorrect = Boolean(graded && matches && rightCells === CELLS)

  const tasks: LabTask[] = [
    {
      id: 'clean-crash',
      label: 'Clean crash: marker on a record boundary — call the committed prefix exactly',
      done: latched.includes('clean-crash'),
      hint: 'whole records survive — but only txns whose commit record is in the valid prefix get applied',
    },
    {
      id: 'torn-tail',
      label: 'Torn tail: park the crash MID-record and call the partial record + tail dropped',
      done: latched.includes('torn-tail'),
      hint: 'a record short of its last byte never existed — and the log is a sequence, not a set',
    },
    {
      id: 'corrupt-record',
      label: 'Flip one payload byte and call recovery stopping at the crc mismatch',
      done: latched.includes('corrupt-record'),
      hint: 'later records can be perfectly intact — the crc convicts, and everything after the first bad record is fiction',
    },
    {
      id: 'idempotent',
      label: 'After a fully correct run: recover again and say why nothing changes',
      done: latched.includes('idempotent'),
      hint: 'the second run re-applies what the first applied — what does that do to the state?',
    },
  ]

  const crashNote = (() => {
    if (crashByte === TOTAL) return 'end of log — nothing lost'
    if (crashByte === 0) return 'byte 0 — the whole log is gone'
    const mid = LOG.find((r) => crashByte > r.start && crashByte < r.start + r.len)
    if (mid) return `MID-record ${mid.lsn} — byte ${crashByte - mid.start} of ${mid.len}: a torn tail`
    const at = LOG.find((r) => r.start === crashByte)
    return at ? `clean boundary — record ${at.lsn} starts here` : ''
  })()

  const misses: string[] = []
  if (graded && matches && verdict && run) {
    TXNS.forEach((t, i) => {
      if (!matches.txn[i])
        misses.push(`t${t} committed? you said ${run.txnCalls[i] ? 'yes' : 'no'} — recovery says ${verdict.committed[i] ? 'yes' : 'no'}`)
    })
    LOG.forEach((r, i) => {
      if (!matches.rec[i])
        misses.push(`lsn ${r.lsn} applied? you said ${run.recCalls[i] ? 'yes' : 'no'} — recovery says ${verdict.applied[i] ? 'yes' : 'no'}`)
    })
  }

  const cardClass = (i: number): string => {
    if (!run || !verdict || i >= step) return 'border-line bg-ink'
    if (!verdict.valid[i]) return 'border-danger/50 bg-ink opacity-45'
    if (verdict.applied[i]) return 'border-accent/60 bg-accent/10'
    return 'border-amber/60 bg-amber/5'
  }
  const cardFoot = (i: number): string | null => {
    if (!run || !verdict || i >= step) return null
    if (!verdict.valid[i]) return i === verdict.stopIdx && verdict.stopKind ? (verdict.stopKind === 'crc' ? 'crc ✗ — stop here' : 'torn — cut') : 'cut'
    return verdict.applied[i] ? 'applied' : 'pending — dropped'
  }

  return (
    <LabShell labId="wal-replay" trackColor={trackColor} tasks={tasks}>
      {/* the log, left to right */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOG.map((r, i) => {
          const corrupt = corruptLsn === r.lsn
          const foot = cardFoot(i)
          return (
            <div key={r.lsn} className={`rounded-md border p-2.5 transition-colors ${cardClass(i)}`}>
              <div className="flex items-center justify-between font-mono text-[10px] text-text-3">
                <span>lsn {r.lsn}</span>
                <span>t{r.txn}</span>
              </div>
              <p className="mt-1 font-mono text-[12px] text-text-1">
                {r.op} {r.key ?? ''}
                {r.val ? `="${r.val}"` : ''}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-text-3">
                {r.len}B · crc {corrupt ? <span className="text-danger">✗ flipped</span> : '✓'}
              </p>
              {r.op !== 'commit' && (
                <button
                  onClick={() => {
                    clearRun()
                    setCorruptLsn(corrupt ? null : r.lsn)
                  }}
                  className={`mt-1.5 rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition-colors ${
                    corrupt
                      ? 'border-danger/60 bg-danger/10 text-danger'
                      : 'border-line text-text-3 hover:text-text-1'
                  }`}
                >
                  {corrupt ? 'unflip payload byte' : 'flip a payload byte'}
                </button>
              )}
              {foot && <p className="mt-1 font-mono text-[10px] text-text-2">{foot}</p>}
            </div>
          )
        })}
      </div>

      {/* the crash claw */}
      <label className="mt-4 block font-mono text-[11px] text-text-3">
        the crash claw lands at byte <span className="text-text-1">{crashByte}</span> / {TOTAL} —{' '}
        <span className="text-amber">{crashNote}</span>
        <input
          type="range"
          min={0}
          max={TOTAL}
          step={1}
          value={crashByte}
          onChange={(e) => {
            clearRun()
            setCrashByte(Number(e.target.value))
          }}
          className="mt-2 w-full accent-accent"
        />
      </label>

      {/* the student's call — filled in BEFORE the run */}
      <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
            your call — committed before the crash?
          </p>
          <div className="mt-2 space-y-1.5">
            {TXNS.map((t) => {
              const recs = LOG.filter((r) => r.txn === t)
              return (
                <label key={t} className="flex items-center gap-2 font-mono text-[12px] text-text-2">
                  <input
                    type="checkbox"
                    checked={txnCalls[t - 1]}
                    onChange={(e) => {
                      clearRun()
                      setTxnCalls((prev) => prev.map((v, i) => (i === t - 1 ? e.target.checked : v)))
                    }}
                    className="accent-accent"
                  />
                  <span>
                    t{t} · lsn {recs[0].lsn}–{recs[recs.length - 1].lsn}
                    {t === 3 && <span className="text-text-3"> · no commit record in the log</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
            your call — applied after recovery?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {LOG.map((r, i) => (
              <label key={r.lsn} className="flex items-center gap-2 font-mono text-[11.5px] text-text-2">
                <input
                  type="checkbox"
                  checked={recCalls[i]}
                  onChange={(e) => {
                    clearRun()
                    setRecCalls((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                  }}
                  className="accent-accent"
                />
                <span>
                  lsn {r.lsn} · {r.op}
                  {r.key ? ` ${r.key}` : ''}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          setRun({ crashByte, corruptLsn, txnCalls: [...txnCalls], recCalls: [...recCalls] })
          setStep(0)
          setAgain(false)
          setIdemChoice(null)
        }}
        disabled={Boolean(run && step < LOG.length)}
        className="mt-4 rounded border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[12px] text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {run && step < LOG.length ? 'replaying…' : 'run recovery'}
      </button>

      {/* the verdict */}
      {run && verdict && (
        <div className="mt-4 rounded-md border border-line bg-ink p-3 font-mono text-[11.5px]">
          {!graded ? (
            <p className="text-text-3">replaying the log…</p>
          ) : (
            <>
              <p className="text-text-2">
                the valid prefix is {verdict.prefixBytes} bytes
                {verdict.prefixBytes === TOTAL && ' — the whole log'}
              </p>
              {verdict.stopKind === 'crc' && (
                <p className="text-danger">crc mismatch at record {LOG[verdict.stopIdx].lsn} — the tail is fiction</p>
              )}
              {verdict.stopKind === 'torn' && (
                <p className="text-danger">record {LOG[verdict.stopIdx].lsn} is torn — cut it, and everything after it</p>
              )}
              {verdict.droppedPending > 0 && (
                <p className="text-amber">
                  {verdict.droppedPending} record(s) pending at the stop point — uncommitted work never resurrects
                </p>
              )}
              <p className="text-text-2">disk.bytes truncated after lsn {verdict.lastLsn}</p>
              <p className="text-text-2">
                store after recovery:{' '}
                <span className="text-text-1">
                  {verdict.store.length ? verdict.store.map(([k, v]) => `${k}="${v}"`).join('  ') : '(empty)'}
                </span>
              </p>

              <p className={`mt-2 ${allCorrect ? 'text-accent' : 'text-amber'}`}>
                your call: {rightCells}/{CELLS} cells
                {allCorrect ? ' — exact. recovery is a deterministic replay, and you called it.' : ''}
              </p>
              {misses.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-text-3">
                  {misses.map((m) => (
                    <li key={m}>✗ {m}</li>
                  ))}
                </ul>
              )}

              {allCorrect && !again && (
                <button
                  onClick={() => setAgain(true)}
                  className="mt-3 rounded border border-line px-2.5 py-1 text-[11px] text-text-2 transition-colors hover:border-accent/60 hover:text-accent"
                >
                  recover again
                </button>
              )}
              {again && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-text-2">
                    recover(); recover() — same valid prefix, same store, same lsn high-water. Crashing mid-recovery
                    is a Tuesday. Why does the second run change nothing?
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {IDEM_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setIdemChoice(o.id)
                          if (o.id === 'idem') latch(['idempotent'])
                        }}
                        className={`block w-full rounded border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                          idemChoice === o.id
                            ? o.id === 'idem'
                              ? 'border-accent/60 bg-accent/10 text-accent'
                              : 'border-danger/60 bg-danger/10 text-danger'
                            : 'border-line text-text-3 hover:text-text-1'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {idemChoice === 'idem' && (
                    <p className="mt-2 text-accent">✓ idempotence by construction, not by bookkeeping.</p>
                  )}
                  {idemChoice && idemChoice !== 'idem' && (
                    <p className="mt-2 text-danger">
                      ✗ there is no journal and nothing hides — the second run re-applies the same records and lands
                      on the same state.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </LabShell>
  )
}
