import { useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * The Visibility Court (T4) — three keys, three transactions, one predicate.
 * The student rules on eight scripted cases; every ruling is graded
 * immediately against lab 04's visibility predicate, which is displayed
 * verbatim as the reference card — the lab teaches reading it, not
 * memorizing it. Fixed scenario; no clocks, no randomness.
 *
 * Scenario: T0 committed the baseline (seq 1); T4 committed k1=v2 (seq 2);
 * T1 began and wrote k1=v3, k3=v2 — still in flight; T2 took its snapshot
 * mid-scenario { seq 2, in-flight {T1} }; T5 wrote k2=v2 and commits at
 * seq 3 (case 4); T3 takes a fresh snapshot { seq 3, in-flight {T1} };
 * T1 aborts before case 7.
 */

interface CourtCase {
  scene: string
  prompt: string
  options: string[]
  correct: string
  reason: string
}

const CASES: CourtCase[] = [
  {
    scene: 'the opening read.',
    prompt:
      'T2 reads k1. The chain: v1 (T0, seq 1) → v2 (T4, seq 2) → v3 (T1, in flight). What does T2 see?',
    options: ['v1', 'v2', 'v3', 'null'],
    correct: 'v2',
    reason:
      'v3’s creator T1 is in flight AND in T2’s in-flight set — clause 1 fails. v2’s creator committed at seq 2 ≤ 2 and is not in the set: visible. A dirty read, denied.',
  },
  {
    scene: 'the writer checks its own work.',
    prompt: 'T1 reads k1 — the key it just rewrote, still uncommitted. What does T1 see?',
    options: ['v1', 'v2', 'v3', 'null'],
    correct: 'v3',
    reason:
      'V.creator == T — the predicate’s first clause is one comparison. You always read your own writes; no one else does.',
  },
  {
    scene: 'meanwhile, T5 has written k2=v2 — uncommitted.',
    prompt: 'T2 reads k2. What does it see?',
    options: ['v1', 'v2', 'null'],
    correct: 'v1',
    reason:
      'T5 has not committed — the creator fails clause 1, whatever the sequence numbers say. k2’s truth for T2 is still v1.',
  },
  {
    scene: 'T5 commits. The commit clock ticks to seq 3.',
    prompt: 'T2 reads k2 AGAIN — same transaction, same snapshot. What now?',
    options: ['v1', 'v2', 'null'],
    correct: 'v1',
    reason:
      'commit_seq(T5) = 3 > T2’s snapshot seq 2 — the snapshot froze at begin and never moves. Same answer as before the commit: v1. Lab 04’s snapshot_repeatable, exactly.',
  },
  {
    scene: 'T3 begins — snapshot { seq 3, in-flight {T1} }.',
    prompt: 'T3 reads k2. What does the fresh snapshot see?',
    options: ['v1', 'v2', 'null'],
    correct: 'v2',
    reason:
      'T5 committed at seq 3 ≤ 3 and is not in T3’s in-flight set — both clauses hold. A newer snapshot, a newer truth: v2.',
  },
  {
    scene: 'T2 reaches for the pen.',
    prompt: 'T2 writes k3 — whose NEWEST version is T1’s uncommitted v2. The ruling?',
    options: ['allowed — version it and move on', 'ww-conflict — T2 is rejected'],
    correct: 'ww-conflict — T2 is rejected',
    reason:
      'First-writer-wins: the newest version’s creator T1 is another txn still in flight → Err(WwConflict { key: k3, holder: T1 }). The rejected write changes nothing.',
  },
  {
    scene: 'T1 aborts — every version it created is discarded.',
    prompt: 'T2 reads k1 one more time. What does it see?',
    options: ['v1', 'v2', 'v3', 'null'],
    correct: 'v2',
    reason:
      'T1’s v3 is gone from everyone’s world — and it was never in T2’s to begin with. The read is unmoved: v2, same as case 1.',
  },
  {
    scene: 'after the abort.',
    prompt: 'T3 reads k3 — v1 (T0, seq 1), or the v2 that T1 left behind?',
    options: ['v1', 'v2', 'null'],
    correct: 'v1',
    reason:
      'T1’s v2 never passed clause 1 for anyone but T1; with the abort it is as if it never ran. The newest committed version is v1.',
  },
]

/** case index → the key row it concerns (for the highlight) */
const CASE_KEY = ['k1', 'k1', 'k2', 'k2', 'k2', 'k3', 'k1', 'k3']
const T1_ABORTS_AT = 6 // case 7 (0-based 6): T1's versions are struck from here on
const T5_WRITES_AT = 2 // case 3: k2's v2 chip appears
const T5_COMMITS_AT = 3 // case 4: T5's chip flips to committed · seq 3

interface VersionChip {
  v: string
  by: string
  showFrom: number
  status: (phase: number) => string
  dead: (phase: number) => boolean
}

const CHAINS: { key: string; versions: VersionChip[] }[] = [
  {
    key: 'k1',
    versions: [
      { v: 'v1', by: 'T0', showFrom: 0, status: () => 'committed · seq 1', dead: () => false },
      { v: 'v2', by: 'T4', showFrom: 0, status: () => 'committed · seq 2', dead: () => false },
      { v: 'v3', by: 'T1', showFrom: 0, status: () => 'in flight', dead: (p) => p >= T1_ABORTS_AT },
    ],
  },
  {
    key: 'k2',
    versions: [
      { v: 'v1', by: 'T0', showFrom: 0, status: () => 'committed · seq 1', dead: () => false },
      {
        v: 'v2',
        by: 'T5',
        showFrom: T5_WRITES_AT,
        status: (p) => (p >= T5_COMMITS_AT ? 'committed · seq 3' : 'in flight'),
        dead: () => false,
      },
    ],
  },
  {
    key: 'k3',
    versions: [
      { v: 'v1', by: 'T0', showFrom: 0, status: () => 'committed · seq 1', dead: () => false },
      { v: 'v2', by: 'T1', showFrom: 0, status: () => 'in flight', dead: (p) => p >= T1_ABORTS_AT },
    ],
  },
]

const TXN_CARDS = [
  { id: 'T1', role: 'the writer', snap: 'no snapshot — reads its own world' },
  { id: 'T2', role: 'the mid-scenario snapshot', snap: 'snapshot { seq 2, in-flight {T1} }' },
  { id: 'T3', role: 'the fresh snapshot', snap: 'snapshot { seq 3, in-flight {T1} }' },
]

export default function VisibilityCourtLab({ trackColor }: { trackColor: string }) {
  const [idx, setIdx] = useState(0)
  const [maxIdx, setMaxIdx] = useState(0)
  const [picked, setPicked] = useState<(string | null)[]>(CASES.map(() => null))
  const [solved, setSolved] = useState<boolean[]>(CASES.map(() => false))

  const phase = idx
  const current = CASES[idx]
  const currentPicked = picked[idx]
  const currentRight = currentPicked === current.correct

  const tasks: LabTask[] = [
    {
      id: 'dirty-read-denied',
      label: 'Case 1: rule another txn’s uncommitted version invisible',
      done: solved[0],
      hint: 'lab 04’s no_dirty_reads — walk clause 1 for v3’s creator',
    },
    {
      id: 'own-writes',
      label: 'Case 2: rule that a txn reads its own uncommitted write',
      done: solved[1],
      hint: 'the predicate’s first clause is one comparison: V.creator == T',
    },
    {
      id: 'ww-conflict',
      label: 'Case 6: rule on the second writer to k3',
      done: solved[5],
      hint: 'first-writer-wins — the newest version’s creator is another txn, still in flight',
    },
    {
      id: 'snapshot-forever',
      label: 'Cases 3–4: the mid-scenario snapshot gives the SAME answer before and after T5’s commit',
      done: solved[2] && solved[3],
      hint: 'snapshot_repeatable — the horizon and the in-flight set froze at begin',
    },
  ]

  const pick = (option: string) => {
    setPicked((prev) => prev.map((v, i) => (i === idx ? option : v)))
    if (option === current.correct) setSolved((prev) => prev.map((v, i) => (i === idx ? true : v)))
  }

  const goNext = () => {
    const n = Math.min(idx + 1, CASES.length - 1)
    setIdx(n)
    setMaxIdx((m) => Math.max(m, n))
  }

  return (
    <LabShell labId="visibility-court" trackColor={trackColor} tasks={tasks}>
      {/* the predicate — the exact lab-04 sentence, kept on the bench for reference */}
      <div className="rounded-md border border-line bg-ink p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
          the law — lab 04’s visibility predicate
        </p>
        <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-text-2">
{`a version V is visible to reader T  ⇔
    V.creator == T                                     (your own writes)
  OR ( V.creator committed
       AND commit_seq(V.creator) ≤ T.snapshot.seq
       AND V.creator ∉ T.snapshot.inflight )`}
        </pre>
      </div>

      {/* the txns */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {TXN_CARDS.map((t) => {
          const aborted = t.id === 'T1' && phase >= T1_ABORTS_AT
          return (
            <div key={t.id} className="rounded-md border border-line bg-ink p-2.5">
              <p className="font-mono text-[12px] text-text-1">
                {t.id}{' '}
                <span className={`text-[10px] ${aborted ? 'text-danger' : 'text-amber'}`}>
                  {aborted ? 'aborted' : 'in flight'}
                </span>
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-text-3">{t.role}</p>
              <p className="font-mono text-[10px] text-text-3">{t.snap}</p>
            </div>
          )
        })}
      </div>

      {/* the version chains */}
      <div className="mt-3 space-y-2">
        {CHAINS.map((c) => (
          <div
            key={c.key}
            className={`flex flex-wrap items-center gap-2 rounded-md border p-2.5 transition-colors ${
              CASE_KEY[idx] === c.key ? 'border-accent/40 bg-accent/5' : 'border-line bg-ink'
            }`}
          >
            <span className="w-8 font-mono text-[12px] text-text-1">{c.key}</span>
            {c.versions
              .filter((v) => phase >= v.showFrom)
              .map((v, i, arr) => {
                const dead = v.dead(phase)
                return (
                  <span key={v.v} className="flex items-center gap-2">
                    {i > 0 && <span className="font-mono text-[10px] text-text-3">→</span>}
                    <span
                      className={`rounded border px-2 py-1 font-mono text-[10.5px] ${
                        dead
                          ? 'border-danger/50 text-text-3 line-through opacity-60'
                          : i === arr.length - 1
                            ? 'border-line-bright text-text-1'
                            : 'border-line text-text-2'
                      }`}
                    >
                      {v.v} · {v.by} · {dead ? 'discarded' : v.status(phase)}
                    </span>
                  </span>
                )
              })}
          </div>
        ))}
      </div>

      {/* the docket */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
            case {idx + 1} of {CASES.length}
          </p>
          <div className="ml-auto flex gap-1.5">
            {CASES.map((_, i) => (
              <button
                key={i}
                onClick={() => i <= maxIdx && setIdx(i)}
                aria-label={`case ${i + 1}`}
                className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                  solved[i]
                    ? 'border-accent/60 bg-accent'
                    : i === idx
                      ? 'border-text-2 bg-transparent'
                      : i <= maxIdx
                        ? 'border-line bg-surface-3'
                        : 'border-line bg-transparent opacity-40'
                }`}
              />
            ))}
          </div>
        </div>

        <p className="mt-3 font-mono text-[11px] text-text-3">{current.scene}</p>
        <p className="mt-1 font-mono text-[13px] text-text-1">{current.prompt}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {current.options.map((o) => (
            <button
              key={o}
              onClick={() => pick(o)}
              className={`rounded border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors ${
                currentPicked === o
                  ? o === current.correct
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-danger/60 bg-danger/10 text-danger'
                  : 'border-line text-text-3 hover:text-text-1'
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {currentPicked !== null && (
          <p className={`mt-3 font-mono text-[11.5px] ${currentRight ? 'text-accent' : 'text-danger'}`}>
            {currentRight ? '✓ so ruled.' : '✗ overruled.'} {current.reason}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          {idx < CASES.length - 1 ? (
            <button
              onClick={goNext}
              disabled={!solved[idx]}
              className="rounded border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[12px] text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
            >
              next case →
            </button>
          ) : (
            solved.every(Boolean) && (
              <p className="font-mono text-[12px] text-accent">
                the court adjourns — every world was one evaluation of the predicate.
              </p>
            )
          )}
          {!solved[idx] && currentPicked !== null && (
            <span className="font-mono text-[10.5px] text-text-3">re-read the predicate and rule again</span>
          )}
        </div>
      </div>
    </LabShell>
  )
}
