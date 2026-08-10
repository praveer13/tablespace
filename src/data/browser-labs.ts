/**
 * Browser labs — metadata for the in-page micro-labs (EXPANSION.md wave 1).
 * One per track: the hands-on rung between the lesson and the forge lab.
 * Component implementations live in src/components/browserlabs/ and are
 * registered in src/components/browserlabs/index.tsx.
 */

import type { TrackId } from '@/data/lessons/types'

export interface BrowserLabMeta {
  id: string
  title: string
  trackId: TrackId
  hook: string
}

export const BROWSER_LABS: BrowserLabMeta[] = [
  {
    id: 'cost-model',
    title: 'The Cost Model Arena',
    trackId: 't0',
    hook: 'Price scans vs point lookups against real device numbers — and find where the plan flips.',
  },
  {
    id: 'page-surgery',
    title: 'Page Surgery',
    trackId: 't1',
    hook: 'Operate an 8KB slotted page with your hands: insert, delete, defrag — byte-exact or bust.',
  },
  {
    id: 'btree-surgeon',
    title: 'B+Tree Surgeon',
    trackId: 't2',
    hook: 'Drive inserts into a live tree — you call the splits and separators; the invariants grade you.',
  },
  {
    id: 'wal-replay',
    title: 'WAL Replay',
    trackId: 't3',
    hook: 'Drag the crash point over a checksummed log and call what recovery applies.',
  },
  {
    id: 'visibility-court',
    title: 'The Visibility Court',
    trackId: 't4',
    hook: 'Version chains and snapshots on trial: rule on what every read may see.',
  },
  {
    id: 'plan-arena',
    title: 'The Plan Arena',
    trackId: 't5',
    hook: 'Cost the three joins from real statistics, pick the winner — then lose on a mis-estimate.',
  },
  {
    id: 'hnsw-explorer',
    title: 'HNSW Explorer',
    trackId: 't6',
    hook: 'Step the greedy descent layer by layer and watch the ef beam decide your recall.',
  },
]

export function browserLabMeta(id: string): BrowserLabMeta | undefined {
  return BROWSER_LABS.find((l) => l.id === id)
}
