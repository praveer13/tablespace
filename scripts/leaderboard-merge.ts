/**
 * leaderboard-merge — fold validated entries into public/leaderboard.json.
 *
 *   bun scripts/leaderboard-merge.ts <result.json> <public/leaderboard.json>
 *
 * result.json is the artifact produced by the Leaderboard Validate workflow:
 *   { pr: number, entries: [ { user, hit_bps, hits, reads, writes,
 *                              evictions, sha256, valid } ] }
 *
 * Rules (see SUBMISSIONS.md): one entry per user — a new submission REPLACES
 * the user's previous entry; entries sort by hit_bps descending; the board
 * caps at 50. Runs ONLY in the publish workflow, on master's checkout: the
 * artifact is data, this script is master's code.
 *
 * Prints one "<user> <hit_bps>bps" line per merged entry (the publish
 * workflow composes the commit message from it). Exit non-zero on any
 * malformed input.
 */

const [resultPath, boardPath] = [process.argv[2], process.argv[3]]
if (!resultPath || !boardPath) {
  console.error('usage: bun scripts/leaderboard-merge.ts <result.json> <leaderboard.json>')
  process.exit(2)
}
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

interface RunEntry {
  user: string
  hit_bps: number
  hits: number
  reads: number
  writes: number
  evictions: number
  sha256: string
  valid: boolean
}
interface BoardEntry extends RunEntry {
  pr: number | null
  date: string
}
interface Board {
  trace: string
  frames: number
  refs: number
  updated: string
  entries: BoardEntry[]
}

const result = JSON.parse(await Bun.file(resultPath!).text()) as { pr?: unknown; entries?: unknown }
if (typeof result.pr !== 'number' || !Array.isArray(result.entries) || result.entries.length === 0) {
  fail('result.json must be { pr: number, entries: [...] } with at least one entry.')
}
const pr = result.pr as number
const board = JSON.parse(await Bun.file(boardPath!).text()) as Board
if (!Array.isArray(board.entries)) fail('leaderboard.json is malformed (no entries array).')

const today = new Date().toISOString().slice(0, 10)
const merged: string[] = []
for (const raw of result.entries as RunEntry[]) {
  // The artifact is data produced in the PR's context — re-validate every
  // field before it touches master's tree.
  if (raw.valid !== true) fail(`entry for ${JSON.stringify(raw.user)} is not marked valid.`)
  if (typeof raw.user !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(raw.user)) {
    fail(`entry user ${JSON.stringify(raw.user)} fails the login shape.`)
  }
  for (const k of ['hit_bps', 'hits', 'reads', 'writes', 'evictions'] as const) {
    if (typeof raw[k] !== 'number' || !Number.isInteger(raw[k]) || raw[k] < 0) {
      fail(`entry ${raw.user}: ${k} must be a non-negative integer.`)
    }
  }
  if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256)) {
    fail(`entry ${raw.user}: sha256 must be 64 lowercase hex chars.`)
  }
  if (raw.hits > board.refs || raw.hit_bps > 10000) {
    fail(`entry ${raw.user}: impossible score (hits ${raw.hits} > ${board.refs} refs, or hit_bps > 10000).`)
  }
  board.entries = board.entries.filter((e) => e.user !== raw.user) // replace, never duplicate
  board.entries.push({ ...raw, pr, date: today })
  merged.push(`${raw.user} ${raw.hit_bps}bps`)
}
board.entries.sort((a, b) => b.hit_bps - a.hit_bps || a.user.localeCompare(b.user))
board.entries = board.entries.slice(0, 50)
board.updated = today
await Bun.write(boardPath!, JSON.stringify(board, null, 2) + '\n')
console.log(merged.join(', '))

export {} // a module, so the top-level awaits above are legal
