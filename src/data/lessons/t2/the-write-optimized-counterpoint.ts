import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't2.l3',
  slug: 'the-write-optimized-counterpoint',
  trackId: 't2',
  index: 3,
  title: 'The Write-Optimized Counterpoint',
  minutes: 13,
  hook: 'Memtables, SSTables, levels, compaction: how LSM trees trade read amplification for write throughput — and why Cassandra, RocksDB, and TigerBeetle all chose them.',
  exercise: 'read+quiz',
  blocks: [
    {
      type: 'callout',
      variant: 'info',
      title: 'in development',
      md: 'This lesson is being written — the outline below is the contract it will teach to.',
    },
    {
      type: 'prose',
      md: `## What this lesson will cover

- The LSM move: never update in place — buffer in memory, flush sorted runs, merge in the background.
- Write amplification vs read amplification vs space amplification: pick two to suffer.
- Compaction as the debt collector: leveled vs size-tiered strategies.
- Bloom filters: the probabilistic bouncer that makes point reads survivable.`,
    },
  ],
}

export default lesson
