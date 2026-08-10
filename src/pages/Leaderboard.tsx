import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, ExternalLink, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The Engine leaderboard — buffer-pool hit rate on the public trace
 * (/traces/bp-public-trace.json) at a fixed 32-frame pool. Every row is
 * CI-verified: a submission PRs its wasm, the workflow re-runs the trace
 * against it, and /leaderboard.json is regenerated. A missing or empty
 * file is not an error — the board is simply open.
 */

const REPO = 'https://github.com/praveer13/tablespace'
const REFERENCE_USER = 'reference-lruk'

interface BoardEntry {
  user: string
  hit_bps: number // hit rate in basis points: 87.34% = 8733 bps
  hits: number
  reads: number
  writes: number
  sha256: string
  pr: number | string | null // PR number or full URL; null = no PR (e.g. the seeded reference row)
  date: string
}

interface Board {
  trace: string
  frames: number
  refs: number
  updated: string
  entries: BoardEntry[]
}

const prHref = (pr: number | string): string =>
  typeof pr === 'number' || /^\d+$/.test(String(pr)) ? `${REPO}/pull/${pr}` : String(pr)

interface Step {
  n: string
  title: string
  body: string
  link?: { to: string; label: string; external?: boolean }
}

const STEPS: Step[] = [
  {
    n: '01',
    title: 'finish lab 07',
    body: "The Engine's Pulse: pins, dirty writeback, LRU-K, scan resistance — all five checks green against the reference pool.",
    link: { to: '/labs/buffer-pool', label: 'open lab 07' },
  },
  {
    n: '02',
    title: 'make the replacer yours',
    body: 'LRU-K is the floor, not the ceiling. Tune k, age the history, harden the flood defense — the hit rate is yours to move.',
  },
  {
    n: '03',
    title: 'sha256sum + PR your wasm',
    body: 'Build release, hash target/wasm32-unknown-unknown/release/buffer_pool.wasm, and open a PR against the repo with the digest.',
    link: { to: REPO, label: 'praveer13/tablespace', external: true },
  },
  {
    n: '04',
    title: 'CI re-runs the public trace',
    body: 'The workflow replays bp-public-trace at 32 frames against your wasm, re-checks every counter, and ranks you on this board.',
  },
]

export default function Leaderboard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/leaderboard.json')
      .then((r) => {
        if (!r.ok) throw new Error(`http ${r.status}`)
        return r.json() as Promise<Board>
      })
      .then((b) => {
        if (cancelled) return
        setBoard(b)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setBoard(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // the file ships sorted (hit_bps desc); sort again so a stale or hand-edited file can't misrank
  const entries = board?.entries ? [...board.entries].sort((a, b) => b.hit_bps - a.hit_bps) : []
  const frames = board?.frames ?? 32

  return (
    <div className="mx-auto max-w-app px-6 pb-24 pt-16 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">the engine · ranks</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-1 sm:text-4xl">
          The engine leaderboard.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-2">
          Buffer-pool hit rate on the public trace at {frames} frames — CI-re-verified on every
          submission.
        </p>
        <p className="mt-2 font-mono text-[11px] text-text-3">
          {board
            ? `trace ${board.trace} · ${board.refs.toLocaleString('en-US')} refs · updated ${board.updated.slice(0, 10)}`
            : 'trace bp-public-trace · 11,988 refs'}
          {' · '}
          <Link to="/engine" className="text-accent underline-offset-4 hover:underline">
            run the same stream in the engine
          </Link>
        </p>
      </motion.div>

      {/* the board */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 rounded-lg border border-line bg-surface-1 p-5"
      >
        {loading ? (
          <p className="animate-pulse py-12 text-center font-mono text-[12px] text-text-3">
            loading the board…
          </p>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <Trophy className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 font-mono text-[12px] text-text-2">
              no submissions yet — the board is open
            </p>
            <p className="mt-1 font-mono text-[11px] text-text-3">
              the first PR that re-verifies takes rank 1
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] font-mono text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-text-3">
                  <th className="pb-2 pr-4 font-normal">rank</th>
                  <th className="pb-2 pr-4 font-normal">replacer</th>
                  <th className="pb-2 pr-4 text-right font-normal">hit rate</th>
                  <th className="pb-2 pr-4 text-right font-normal">hits</th>
                  <th className="pb-2 pr-4 text-right font-normal">reads</th>
                  <th className="pb-2 pr-4 text-right font-normal">writes</th>
                  <th className="pb-2 pr-4 font-normal">sha256</th>
                  <th className="pb-2 font-normal">date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isRef = e.user === REFERENCE_USER
                  return (
                    <tr
                      key={`${e.user}-${e.sha256}`}
                      className={cn('border-b border-line/60 last:border-0', isRef && 'bg-accent/5')}
                    >
                      <td className="py-2.5 pr-4 text-text-3">{String(i + 1).padStart(2, '0')}</td>
                      <td className="py-2.5 pr-4">
                        {e.pr === null ? (
                          <span className={cn(isRef ? 'text-accent' : 'text-text-1')}>{e.user}</span>
                        ) : (
                          <a
                            href={prHref(e.pr)}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              'inline-flex items-center gap-1.5 transition-colors hover:text-accent',
                              isRef ? 'text-accent' : 'text-text-1',
                            )}
                          >
                            {e.user}
                            <ExternalLink className="h-3 w-3 text-text-3" />
                          </a>
                        )}
                        {isRef && (
                          <span className="ml-2 rounded border border-accent/50 bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-accent">
                            the bar
                          </span>
                        )}
                      </td>
                      <td className={cn('py-2.5 pr-4 text-right', isRef ? 'text-accent' : 'text-text-1')}>
                        {(e.hit_bps / 100).toFixed(2)}%
                      </td>
                      <td className="py-2.5 pr-4 text-right text-text-2">{e.hits.toLocaleString('en-US')}</td>
                      <td className="py-2.5 pr-4 text-right text-text-2">{e.reads.toLocaleString('en-US')}</td>
                      <td className="py-2.5 pr-4 text-right text-text-2">{e.writes.toLocaleString('en-US')}</td>
                      <td className="py-2.5 pr-4 text-text-3" title={e.sha256}>
                        {e.sha256.slice(0, 7)}
                      </td>
                      <td className="py-2.5 text-text-3">{e.date.slice(0, 10)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      {/* how to compete */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">how to compete</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-lg border border-line bg-surface-1 p-5">
              <p className="font-mono text-[11px] text-accent">{s.n}</p>
              <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.1em] text-text-1">{s.title}</p>
              <p className="mt-2 text-body-sm text-text-2">{s.body}</p>
              {s.link &&
                (s.link.external ? (
                  <a
                    href={s.link.to}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-accent underline-offset-4 hover:underline"
                  >
                    {s.link.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <Link
                    to={s.link.to}
                    className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-accent underline-offset-4 hover:underline"
                  >
                    {s.link.label} <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </motion.div>

      {/* the honesty box */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 rounded-lg border border-amber/40 bg-amber/5 p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber">the honesty box</p>
        <p className="mt-2 max-w-2xl text-body-sm text-text-2">
          CI proves reproducibility, not originality. The honor system, with a checksum.
        </p>
      </motion.div>
    </div>
  )
}
