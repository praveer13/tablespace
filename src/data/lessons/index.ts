/**
 * Lesson registry — tablespace content source of truth.
 * Track ids: t0 (The Disk Contract), t1 (Pages & Tuples), t2 (Indexing),
 * t3 (WAL & Recovery), t4 (MVCC & Isolation), t5 (Executor & Planner),
 * t6 (Vectors & HNSW).
 */

import type { LucideIcon } from 'lucide-react'
import { Database } from 'lucide-react'
import type { Lesson, SimId, TrackId } from './types'

// T0 — The Disk Contract
import t0l1 from './t0/everything-is-a-page'
import t0l2 from './t0/the-cost-model-of-reality'
import t0l3 from './t0/an-operating-system-for-one-file'
import t0l4 from './t0/eviction-is-a-bet'

// T1 — Pages & Tuples
import t1l1 from './t1/anatomy-of-a-page'
import t1l2 from './t1/what-a-tuple-costs'
import t1l3 from './t1/when-a-row-outgrows-its-page'
import t1l4 from './t1/delete-is-a-promise'

// T2 — Indexing
import t2l1 from './t2/the-btree-contract'
import t2l2 from './t2/splits-merges-staying-balanced'
import t2l3 from './t2/the-write-optimized-counterpoint'
import t2l4 from './t2/choosing-the-index-family'

// T3 — WAL & Recovery
import t3l1 from './t3/write-it-down-first'
import t3l2 from './t3/crash-recover-repeat'
import t3l3 from './t3/fsync-is-a-contract'

// T4 — MVCC & Isolation
import t4l1 from './t4/many-worlds-one-truth-each'
import t4l2 from './t4/the-anomaly-zoo'
import t4l3 from './t4/conflicts-and-serializable-snapshots'
import t4l4 from './t4/the-garbage-is-yours'

// T5 — The Executor & the Planner
import t5l1 from './t5/pull-not-push'
import t5l2 from './t5/three-ways-to-join'
import t5l3 from './t5/the-planner-guesses'

// T6 — Vectors & HNSW
import t6l1 from './t6/why-exact-neighbors-die'
import t6l2 from './t6/hnsw-layer-by-layer'
import t6l3 from './t6/recall-is-a-curve'

export const LESSONS_BY_TRACK: Record<TrackId, Lesson[]> = {
  t0: [t0l1, t0l2, t0l3, t0l4],
  t1: [t1l1, t1l2, t1l3, t1l4],
  t2: [t2l1, t2l2, t2l3, t2l4],
  t3: [t3l1, t3l2, t3l3],
  t4: [t4l1, t4l2, t4l3, t4l4],
  t5: [t5l1, t5l2, t5l3],
  t6: [t6l1, t6l2, t6l3],
}

export const TRACK_IDS: TrackId[] = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']

/** All lessons in curriculum order. */
export const ALL_LESSONS: Lesson[] = TRACK_IDS.flatMap((id) => LESSONS_BY_TRACK[id])

export const TOTAL_LESSON_COUNT = ALL_LESSONS.length

/** Canonical ids in curriculum order — for next-recommended selectors. */
export const ORDERED_LESSON_IDS: string[] = ALL_LESSONS.map((l) => l.id)

const byIdMap = new Map<string, Lesson>()
for (const l of ALL_LESSONS) {
  byIdMap.set(l.id, l)
  byIdMap.set(l.slug, l)
}

/** Resolve a lesson by canonical id (`t2.l1`) or slug (`the-btree-contract`). */
export function lessonById(idOrSlug: string | undefined): Lesson | undefined {
  if (!idOrSlug) return undefined
  return byIdMap.get(idOrSlug)
}

export function lessonsForTrack(trackId: string): Lesson[] {
  return LESSONS_BY_TRACK[trackId as TrackId] ?? []
}

/** Next lesson in curriculum order — crosses track boundaries. */
export function nextLesson(lesson: Lesson): Lesson | undefined {
  const i = ORDERED_LESSON_IDS.indexOf(lesson.id)
  return i >= 0 ? lessonById(ORDERED_LESSON_IDS[i + 1]) : undefined
}

/** Previous lesson in curriculum order — crosses track boundaries. */
export function prevLesson(lesson: Lesson): Lesson | undefined {
  const i = ORDERED_LESSON_IDS.indexOf(lesson.id)
  return i > 0 ? lessonById(ORDERED_LESSON_IDS[i - 1]) : undefined
}

/** Route helper — canonical lesson URL. */
export const lessonPath = (l: Lesson) => `/lesson/${l.id}`

/* ---------------------- track extras ---------------------- */

export interface TrackExtras {
  pitch: string
  outcomes: string[]
  requires: string
  sideNote: string
}

export const TRACK_EXTRAS: Record<TrackId, TrackExtras> = {
  t0: {
    pitch:
      'Databases are, at the bottom, files. This track is the contract those files are written against: fixed-size pages, real I/O costs, and a buffer pool that is an operating system for exactly one file.',
    outcomes: [
      'Explain why engines move fixed-size pages, not rows or bytes.',
      'Price a random read vs a sequential scan in orders of magnitude, HDD and SSD.',
      'Walk a buffer pool: frames, pin counts, dirty bits, eviction.',
      'Run clock-sweep by hand and say what LRU gets wrong under a scan.',
    ],
    requires: 'base of the stack · no prerequisites',
    sideNote: '// lesson 1 is the one that makes EXPLAIN start making sense',
  },
  t1: {
    pitch:
      'How rows actually sit inside a page: slotted layout, tuple headers, null bitmaps, overflow storage, and what "deleted" really means on disk.',
    outcomes: [
      'Lay out a slotted page: header, slot array growing down, records growing up.',
      'Explain why updates can move rows and why indexes survive it.',
      'Handle oversized values with overflow pages — the TOAST pattern.',
      'Account for free space exactly — lab 01 grades it to the byte.',
    ],
    requires: 'requires T0 · the disk contract',
    sideNote: '// lab 1 is 8KB of pure accounting discipline',
  },
  t2: {
    pitch:
      'The two great index families. B+trees: sortedness under inserts, splits, merges, balance proofs. LSMs: the write-optimized counterpoint that trades read amplification for write throughput.',
    outcomes: [
      'Split and merge a B+tree node by hand, separators included.',
      'Prove minimum occupancy and why the tree stays shallow.',
      'Explain LSM levels, compaction, and write amplification.',
      'Choose an index family for a workload — and defend it with math.',
    ],
    requires: 'requires T1 · page layout',
    sideNote: '// lab 2 grades your tree under adversarial key orders',
  },
  t3: {
    pitch:
      'Durability is a protocol, not a flag: write the log first, flush the data later, and make recovery a deterministic replay. LSNs, checkpoints, ARIES, and fsync honesty.',
    outcomes: [
      'State the WAL rule and the steal/no-force policy that makes it necessary.',
      'Recover a crashed engine: redo from the checkpoint, undo the losers.',
      'Explain group commit and what fsync actually promises.',
      'Survive lab 03\'s crash-injection harness — committed means durable.',
    ],
    requires: 'requires T1 · you can already store rows',
    sideNote: '// the grader kills your wasm mid-write. on purpose.',
  },
  t4: {
    pitch:
      'Many readers, many writers, one truth per snapshot. MVCC from version chains to visibility rules, the anomaly zoo, and why vacuum exists.',
    outcomes: [
      'Walk version visibility: xmin/xmax evaluated against a snapshot.',
      'Name every isolation anomaly and the level that prevents it.',
      'Explain write-write conflicts and how engines detect them.',
      'Read a bloat curve and say what vacuum can and cannot reclaim.',
    ],
    requires: 'requires T3 · durability first',
    sideNote: '// lab 4 runs your txns through a deterministic scheduler',
  },
  t5: {
    pitch:
      'SQL is a promise; the executor keeps it. The volcano pull model, join strategies, statistics, and why the cost model guesses wrong on your data specifically.',
    outcomes: [
      'Trace a query through pull-based iterators: open/next/close.',
      'Cost nested-loop vs hash vs merge join for given cardinalities.',
      'Read EXPLAIN as a plan with estimates attached, not a prophecy.',
      'Diagnose a mis-estimate: stale stats, correlation, skew.',
    ],
    requires: 'requires T2 · indexes',
    sideNote: '// lab 5 runs your executor over YOUR pages and YOUR tree',
  },
  t6: {
    pitch:
      'The index everyone tunes by superstition. Approximate nearest neighbors from first principles: why exact scan dies, how HNSW navigates a small world, and what the pgvector knobs actually buy.',
    outcomes: [
      'Explain the curse of dimensionality in one picture and one formula.',
      'Build HNSW layer by layer: entry point, greedy descent, neighbor selection.',
      'Trade recall for latency deliberately: ef_search, m, ef_construction.',
      'Answer the filtered-ANN problem without folklore.',
    ],
    requires: 'requires T5 · query execution',
    sideNote: '// lab 6: your recall/latency curve, measured honestly',
  },
}

/* ---------------------- sim metadata ---------------------- */

export interface SimInfo {
  id: SimId
  name: string
  hook: string
  icon: LucideIcon
  trackId: TrackId
}

export const SIM_INFO: Record<SimId, SimInfo> = {
  engine: {
    id: 'engine',
    name: 'The Engine',
    hook: 'One database, built page by page, under a trace that never forgives.',
    icon: Database,
    trackId: 't0',
  },
}

/** Sims exercised by a given track's lessons (deduped, curriculum order). */
export function simsForTrack(trackId: string): { sim: SimInfo; lesson: Lesson }[] {
  const out: { sim: SimInfo; lesson: Lesson }[] = []
  const seen = new Set<SimId>()
  for (const l of lessonsForTrack(trackId)) {
    if (l.simId && !seen.has(l.simId)) {
      seen.add(l.simId)
      out.push({ sim: SIM_INFO[l.simId], lesson: l })
    }
  }
  return out
}

export type { Lesson, ContentBlock } from './types'
