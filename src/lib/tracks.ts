/**
 * Shared curriculum metadata — tablespace (database internals, from a page
 * to a query engine). Same TrackMeta/SimMeta contract the platform
 * components consume.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Database,
  GitBranch,
  HardDrive,
  Layers,
  Lock,
  Radar,
  ShieldCheck,
  Workflow,
  Wrench,
} from 'lucide-react'

export interface TrackMeta {
  code: string
  id: string
  name: string
  color: string
  glyph: LucideIcon
  promise: string
  lessons: number
  exercises: number
  hours: number
}

export const TRACKS: TrackMeta[] = [
  {
    code: 'Tᴿ',
    id: 'tr',
    name: 'Rust Zero',
    color: '#94A3B8',
    glyph: Wrench,
    promise: 'Just enough Rust to build a database: ownership, enums, and the forge loop.',
    lessons: 4,
    exercises: 4,
    hours: 2,
  },
  {
    code: 'T0',
    id: 't0',
    name: 'The Disk Contract',
    color: '#22D3EE',
    glyph: HardDrive,
    promise: 'What a page is, why 8KB, and why the buffer pool is an operating system for one file.',
    lessons: 4,
    exercises: 4,
    hours: 2,
  },
  {
    code: 'T1',
    id: 't1',
    name: 'Pages & Tuples',
    color: '#5CA8FF',
    glyph: Layers,
    promise: 'Slotted pages, tuple headers, overflow storage, tombstones — how rows actually sit on disk.',
    lessons: 4,
    exercises: 4,
    hours: 2,
  },
  {
    code: 'T2',
    id: 't2',
    name: 'Indexing',
    color: '#3EF2A4',
    glyph: GitBranch,
    promise: 'The two great index families: B+tree splits and balance proofs, LSM levels and compaction — and when each wins.',
    lessons: 4,
    exercises: 4,
    hours: 2,
  },
  {
    code: 'T3',
    id: 't3',
    name: 'WAL & Recovery',
    color: '#FB923C',
    glyph: Lock,
    promise: 'Log first, flush later: LSNs, checkpoints, ARIES redo/undo, and fsync honesty.',
    lessons: 3,
    exercises: 3,
    hours: 2,
  },
  {
    code: 'T4',
    id: 't4',
    name: 'MVCC & Isolation',
    color: '#A78BFA',
    glyph: Database,
    promise: 'Version chains, snapshots, the anomaly zoo, and vacuum — many readers and writers on one honest engine.',
    lessons: 4,
    exercises: 4,
    hours: 2,
  },
  {
    code: 'T5',
    id: 't5',
    name: 'The Executor & the Planner',
    color: '#FB7185',
    glyph: Workflow,
    promise: 'Volcano pull, join strategies, and why the planner mis-estimates your data specifically.',
    lessons: 3,
    exercises: 3,
    hours: 2,
  },
  {
    code: 'T6',
    id: 't6',
    name: 'Vectors & HNSW',
    color: '#E879F9',
    glyph: Radar,
    promise: 'The index you tuned by superstition: approximate neighbors, recall/latency physics, and the build-or-buy answer.',
    lessons: 3,
    exercises: 3,
    hours: 2,
  },
]

export const CAPSTONE: TrackMeta = {
  code: 'T*',
  id: 'capstone',
  name: 'Capstone: Your Engine, Measured',
  color: '#FBBF24',
  glyph: ShieldCheck,
  promise: 'A full engine plus your own HNSW — then the vector-DB business case recomputed from your own curves.',
  lessons: 0,
  exercises: 0,
  hours: 0,
}

export const TOTAL_TRACK_LESSONS = TRACKS.reduce((n, t) => n + t.lessons, 0)

export function getTrack(id: string): TrackMeta | undefined {
  return TRACKS.find((t) => t.id === id)
}

export interface SimMeta {
  id: string
  name: string
  hook: string
  icon: LucideIcon
  trackId: string
  usedIn: string
  difficulty: 1 | 2 | 3
}

/** Simulators, in showcase order. */
export const SIMS: SimMeta[] = [
  {
    id: 'engine',
    name: 'The Engine',
    hook: 'One database, built page by page, under a trace that never forgives.',
    icon: Database,
    trackId: 't0',
    usedIn: 'T0.L3',
    difficulty: 2,
  },
]

/** Ordered lesson ids across tracks for next-lesson selectors. */
export const ORDERED_LESSON_IDS: string[] = TRACKS.flatMap((t) =>
  Array.from({ length: t.lessons }, (_, i) => `${t.id}.l${i + 1}`),
)
