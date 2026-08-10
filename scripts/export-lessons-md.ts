/**
 * export-lessons-md — render every lesson's blocks to plain markdown files
 * in public/lessons-md/, plus public/llms.txt (the agent manifest).
 *
 * This is the agent-native tutoring surface: any coding/chat agent can
 * ingest a lesson as clean markdown; the site links each lesson page to
 * its .md and to Claude/ChatGPT deep links.
 *
 *   bun scripts/export-lessons-md.ts
 */
import { writeFileSync, mkdirSync } from 'fs'
import { ALL_LESSONS, TRACK_EXTRAS } from '../src/data/lessons'
import type { ContentBlock, Lesson } from '../src/data/lessons/types'
import { TRACKS } from '../src/lib/tracks'
import { browserLabMeta } from '../src/data/browser-labs'

const SITE = 'https://tablespace.play.naigap.com'

function blockToMd(b: ContentBlock): string {
  switch (b.type) {
    case 'prose':
    case 'deepdive':
      return b.md
    case 'code': {
      if (b.tabs?.length) {
        return b.tabs.map((t) => `**${t.label}**\n\n\`\`\`${t.lang}\n${t.code}\n\`\`\``).join('\n\n')
      }
      return `\`\`\`${b.lang ?? ''}\n${b.code ?? ''}\n\`\`\``
    }
    case 'callout':
      return `> **[${b.variant}]** ${b.md.replace(/\n/g, '\n> ')}`
    case 'statline':
      return b.stats.map((s) => `- **${s.value}** — ${s.label}${s.hint ? ` (${s.hint})` : ''}`).join('\n')
    case 'diagram': {
      const nodes = b.nodes.map((n) => `${n.label}${n.sub ? ` (${n.sub})` : ''}`).join(' · ')
      const steps = (b.steps ?? []).map((s, i) => `${i + 1}. ${s.caption}`).join('\n')
      return `_${b.caption}_\n\nComponents: ${nodes}${steps ? `\n\nSteps:\n${steps}` : ''}`
    }
    case 'isomorphism':
      return `_${b.title ?? 'isomorphism'}_\n\n${b.pairs
        .map((p) => `- **${p.os}** (${p.osLine}) ≡ **${p.llm}** (${p.llmLine})`)
        .join('\n')}`
    case 'quiz':
      return b.questions
        .map((q, i) => {
          const opts = q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}. ${o}`).join('\n')
          const correct = q.correct.map((c) => String.fromCharCode(65 + c)).join(', ')
          return `**Q${i + 1}. ${q.q}**\n${opts}\n   Answer: ${correct} — ${q.explanation}`
        })
        .join('\n\n')
    case 'exercise':
      return `**Exercise: ${b.title}**\n\n${b.tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}${b.note ? `\n\n_${b.note}_` : ''}`
    case 'lab': {
      const meta = browserLabMeta(b.lab)
      return `**Browser lab: ${meta?.title ?? b.lab}** — ${meta?.hook ?? ''} (interactive, on the lesson page: ${SITE}/lesson/<this-lesson>)`
    }
    default:
      return ''
  }
}

function lessonToMd(l: Lesson): string {
  const track = TRACKS.find((t) => t.id === l.trackId)
  const header = [
    `# ${l.id.toUpperCase()} — ${l.title}`,
    '',
    `_Track ${track?.code ?? l.trackId}: ${track?.name ?? ''} · ~${l.minutes} min · tablespace_`,
    '',
    `> ${l.hook}`,
    '',
  ].join('\n')
  const body = l.blocks.map(blockToMd).filter(Boolean).join('\n\n---\n\n')
  return `${header}${body}\n`
}

mkdirSync('public/lessons-md', { recursive: true })
let count = 0
for (const l of ALL_LESSONS) {
  writeFileSync(`public/lessons-md/${l.id}.md`, lessonToMd(l))
  count++
}

/* llms.txt — the agent manifest (llmstxt.org shape) */
const byTrack = TRACKS.map((t) => {
  const lessons = ALL_LESSONS.filter((l) => l.trackId === t.id)
    .map((l) => `- [${l.id.toUpperCase()} ${l.title}](${SITE}/lessons-md/${l.id}.md): ${l.hook}`)
    .join('\n')
  const extras = TRACK_EXTRAS[t.id as keyof typeof TRACK_EXTRAS]
  return `### ${t.code} — ${t.name}\n\n_${extras?.pitch ?? ''}_\n\n${lessons}`
}).join('\n\n')

const llmsTxt = `# tablespace

> From a slotted page to a query engine: a database-internals course that
> turns backend engineers into people who have BUILT the thing they tune.
> 29 lessons across 8 tracks, 7 in-page browser labs, 6 Rust labs graded
> in-browser, one persistent engine simulator, and a Crash Week capstone.
> All content is plain markdown under /lessons-md/; every page is at
> ${SITE}/lesson/<id> (e.g. t2.l1).

## How to tutor from this material

- The user is a backend engineer learning database internals by building a
  database. Be Socratic; never dump full lab solutions (they are graded by
  checks).
- Labs live at ${SITE}/labs (Rust, wasm-graded in-browser). The Engine
  (${SITE}/engine) is the persistent world — one database assembled from
  the student's own work under a deterministic trace; Crash Week
  (${SITE}/drills) is the incident-diagnosis capstone.

## Curriculum

${byTrack}

## Optional

- [The Forge labs](${SITE}/labs): six Rust labs (slotted page → B+tree → WAL → MVCC → volcano executor → HNSW)
- [The Engine](${SITE}/engine): buffer-pool simulator under a deterministic trace (LRU vs clock-sweep race)
- [Crash Week](${SITE}/drills): four incident cards — crash mid-checkpoint, bloat storm, hot-page convoy, recall collapse
`

writeFileSync('public/llms.txt', llmsTxt)
console.log(`exported ${count} lessons + llms.txt`)
