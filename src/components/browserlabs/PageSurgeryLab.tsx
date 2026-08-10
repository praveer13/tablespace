import { useMemo, useState } from 'react'
import { LabShell, type LabTask } from '.'

/**
 * Page Surgery (T1) — operate lab 01's 8KB slotted page with your hands.
 * Byte-exact to labs/slotted-pages/src/page.rs: 8B header, 6B slots growing
 * down from byte 8, records growing up from byte 8192, lowest-tombstone
 * reuse on insert, defrag slides live records up and remaps slot offsets.
 * Fixed constants; no clocks, no randomness.
 */

const PAGE_SIZE = 8192
const HEADER_SIZE = 8
const SLOT_SIZE = 6
const MIN_REC = 8
const MAX_REC = 4000
const WASTE_GOAL = 1000
const FULL_90_FREE = 818 // free_space ≤ 818 ⇔ ≥90% of the page in use

interface Slot {
  offset: number
  len: number
  live: boolean
}
/** One run of record bytes inside [records_start, 8192) — live or dead. */
interface Seg {
  start: number
  end: number
  live: boolean
}
interface PageState {
  slots: Slot[]
  segs: Seg[] // sorted by start; covers [recordsStart, 8192) exactly
  recordsStart: number
  deadBytes: number
}

const MINT: PageState = { slots: [], segs: [], recordsStart: PAGE_SIZE, deadBytes: 0 }

const contiguous = (p: PageState) => p.recordsStart - HEADER_SIZE - SLOT_SIZE * p.slots.length
const freeSpace = (p: PageState) => contiguous(p) + p.deadBytes

/** Latched task progress — the states are mutually exclusive, so once green a task stays green. */
interface Flags {
  inserted: boolean
  filled: boolean
  wasted: boolean
  refused: boolean
  defragged: boolean
  recycled: boolean
  exact: boolean
}
const NO_FLAGS: Flags = {
  inserted: false,
  filled: false,
  wasted: false,
  refused: false,
  defragged: false,
  recycled: false,
  exact: false,
}

export default function PageSurgeryLab({ trackColor }: { trackColor: string }) {
  const [page, setPage] = useState<PageState>(MINT)
  const [flags, setFlags] = useState<Flags>(NO_FLAGS)
  const [sizeInput, setSizeInput] = useState('120')
  const [exactInput, setExactInput] = useState('')
  const [msg, setMsg] = useState(
    'a mint page: slot_count 0, records_start 8192, dead_bytes 0 — free_space 8184, all of it contiguous. insert something.',
  )

  const cont = contiguous(page)
  const free = freeSpace(page)

  const doInsert = () => {
    const len = Number(sizeInput)
    if (!Number.isInteger(len) || len < MIN_REC || len > MAX_REC) {
      setMsg(`record size must be an integer ${MIN_REC}–${MAX_REC}B for this lab`)
      return
    }
    const tomb = page.slots.findIndex((s) => !s.live)
    const slotCost = tomb === -1 ? SLOT_SIZE : 0
    const need = len + slotCost
    if (need > cont) {
      setMsg(
        `insert ${len}B: REFUSED — needs ${need}B contiguous (${len} record${slotCost ? ` + ${slotCost} slot` : ''}), only ${cont}B there; ${page.deadBytes}B sits dead, unallocatable until defrag`,
      )
      if (page.deadBytes >= WASTE_GOAL) setFlags((f) => ({ ...f, wasted: true, refused: true }))
      return
    }
    const nr = page.recordsStart - len
    const slotId = tomb === -1 ? page.slots.length : tomb
    const slots = [...page.slots]
    if (tomb === -1) slots.push({ offset: nr, len, live: true })
    else slots[tomb] = { offset: nr, len, live: true }
    const next: PageState = {
      slots,
      segs: [{ start: nr, end: nr + len, live: true }, ...page.segs],
      recordsStart: nr,
      deadBytes: page.deadBytes,
    }
    const f1 = freeSpace(next)
    setPage(next)
    setMsg(
      tomb === -1
        ? `insert ${len}B: appended slot ${slotId} (6B slot bytes), record → [${nr}, ${nr + len}), records_start ${page.recordsStart}→${nr}, free ${free}→${f1}`
        : `insert ${len}B: claimed slot ${slotId} (tombstone reused — no slot bytes), records_start ${page.recordsStart}→${nr}, free ${free}→${f1}`,
    )
    setFlags((f) => ({
      ...f,
      inserted: true,
      filled: f.filled || f1 <= FULL_90_FREE,
      recycled: f.recycled || f.defragged,
    }))
  }

  const doDelete = (i: number) => {
    const s = page.slots[i]
    if (!s || !s.live) return
    const slots = page.slots.map((x, j) => (j === i ? { ...x, live: false } : x))
    const segs = page.segs.map((g) => (g.start === s.offset && g.end === s.offset + s.len ? { ...g, live: false } : g))
    const d1 = page.deadBytes + s.len
    const next: PageState = { slots, segs, recordsStart: page.recordsStart, deadBytes: d1 }
    setPage(next)
    setMsg(
      `delete slot ${i}: LIVE cleared, dead_bytes ${page.deadBytes}→${d1}; the bytes stay at [${s.offset}, ${s.offset + s.len}) — free ${free}→${freeSpace(next)}, but the contiguous region didn't move`,
    )
    setFlags((f) => ({ ...f, wasted: f.wasted || d1 >= WASTE_GOAL }))
  }

  const doDefrag = () => {
    const live = page.slots.filter((s) => s.live)
    if (live.length === 0) {
      setPage(MINT)
      setMsg(
        `defrag: zero live records — nothing outside the page can point into it, so it resets to mint (slot_count 0, records_start 8192, free 8184)`,
      )
      setFlags((f) => ({ ...f, defragged: f.defragged || f.refused }))
      return
    }
    let top = PAGE_SIZE
    const segs: Seg[] = []
    const slots = page.slots.map((s) => {
      if (!s.live) return s // tombstones stay in the array — live slot ids must never shift
      top -= s.len
      segs.push({ start: top, end: top + s.len, live: true })
      return { ...s, offset: top }
    })
    segs.sort((a, b) => a.start - b.start)
    const next: PageState = { slots, segs, recordsStart: top, deadBytes: 0 }
    setPage(next)
    setMsg(
      `defrag: slid ${live.length} live records against byte 8192, remapped their slot offsets — dead_bytes ${page.deadBytes}→0, free ${free}→${freeSpace(next)}; live slot ids unchanged, no index notices`,
    )
    setFlags((f) => ({ ...f, defragged: f.defragged || f.refused }))
  }

  const doReset = () => {
    setPage(MINT)
    setMsg('page reset to mint — slot_count 0, records_start 8192, free_space 8184')
  }

  const onExact = (v: string) => {
    setExactInput(v)
    if (v.trim() !== '' && Number(v) === free) setFlags((f) => ({ ...f, exact: true }))
  }

  const tasks: LabTask[] = useMemo(() => {
    const wasteDone = flags.wasted && flags.refused && flags.recycled
    const wasteHint = !flags.wasted
      ? `delete records until dead_bytes ≥ ${WASTE_GOAL}`
      : !flags.refused
        ? 'now insert a record too big for the contiguous region — free_space counts dead bytes, but inserts cannot spend them'
        : 'defrag, then run that same insert again — this time it lands'
    return [
      {
        id: 'first-insert',
        label: 'Land your first record — slot 0 appears, records_start drops',
        done: flags.inserted,
        hint: `any size ${MIN_REC}–${MAX_REC}B; watch the slot table and the byte bar`,
      },
      {
        id: 'fill-90',
        label: `Drive the page to ≥90% full (free_space ≤ ${FULL_90_FREE})`,
        done: flags.filled,
        hint: 'two 4000B records nearly do it — top up from there',
      },
      {
        id: 'waste-then-defrag',
        label: `Waste, refuse, reclaim: dead_bytes ≥ ${WASTE_GOAL} → a refused insert → defrag → the same insert lands`,
        done: wasteDone,
        hint: wasteHint,
      },
      {
        id: 'exact-accounting',
        label: 'Call the current free_space — to the byte',
        done: flags.exact,
        hint: 'free_space() = (records_start − 8 − 6·slot_count) + dead_bytes. Read the header fields, do the arithmetic.',
      },
    ]
  }, [flags])

  const slotBytes = SLOT_SIZE * page.slots.length
  const lowestTomb = page.slots.findIndex((s) => !s.live)
  const barSegs = [
    { key: 'hdr', bytes: HEADER_SIZE, cls: 'bg-text-3/40', pin: true, title: 'header [0, 8) — slot_count · records_start · dead_bytes · reserved' },
    { key: 'slots', bytes: slotBytes, cls: 'bg-info/60', pin: true, title: `slot array [8, ${8 + slotBytes}) — ${page.slots.length} slots × 6B` },
    { key: 'free', bytes: cont, cls: 'bg-surface-3', pin: false, title: `contiguous free [${8 + slotBytes}, ${page.recordsStart}) — ${cont}B` },
    ...page.segs.map((g, i) => ({
      key: `r${i}`,
      bytes: g.end - g.start,
      cls: g.live ? 'bg-accent/70' : 'bg-danger/50',
      pin: false,
      title: `${g.live ? 'live' : 'dead'} record [${g.start}, ${g.end}) — ${g.end - g.start}B`,
    })),
  ].filter((s) => s.bytes > 0)

  const shownSlots = page.slots.slice(0, 12)

  return (
    <LabShell labId="page-surgery" trackColor={trackColor} tasks={tasks}>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-3">
        <input
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          className="w-20 rounded border border-line bg-ink px-2 py-1 text-text-1 outline-none focus:border-accent/60"
          aria-label="record size in bytes"
        />
        <span>B</span>
        {[64, 512, 4000].map((n) => (
          <button key={n} onClick={() => setSizeInput(String(n))} className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:text-text-1">
            {n}
          </button>
        ))}
        <button onClick={doInsert} className="rounded border border-accent/60 bg-accent/10 px-2.5 py-1 text-accent">
          insert
        </button>
        <button onClick={doDefrag} className="rounded border border-line px-2.5 py-1 hover:text-text-1">
          defrag
        </button>
        <button onClick={doReset} className="ml-auto rounded border border-line px-2.5 py-1 hover:text-text-1">
          fresh page
        </button>
      </div>

      {/* what just happened */}
      <div className="mt-3 min-h-[34px] rounded border border-line bg-ink px-3 py-2 font-mono text-[11px] leading-relaxed text-text-2">
        {msg}
      </div>

      {/* the byte bar */}
      <div className="mt-4">
        <div className="relative">
          <div className="flex h-8 overflow-hidden rounded border border-line bg-ink">
            {barSegs.map((s) => (
              <div
                key={s.key}
                title={s.title}
                className={`h-full ${s.cls}`}
                style={{ width: `${(s.bytes / PAGE_SIZE) * 100}%`, minWidth: s.pin ? 2 : undefined }}
              />
            ))}
          </div>
          <div
            className="absolute inset-y-0 w-px"
            style={{ left: `${((PAGE_SIZE - FULL_90_FREE) / PAGE_SIZE) * 100}%`, background: trackColor }}
            title={`90% full ⇔ free_space ${FULL_90_FREE}`}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-text-3">
          <span>byte 0 — slots grow →</span>
          <span>tick = 90% full ⇔ free_space {FULL_90_FREE}</span>
          <span>← records grow — byte 8192</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-text-3">
          {[
            { cls: 'bg-text-3/40', label: 'header 8B' },
            { cls: 'bg-info/60', label: 'slot array' },
            { cls: 'bg-surface-3', label: 'contiguous free' },
            { cls: 'bg-accent/70', label: 'live record' },
            { cls: 'bg-danger/50', label: 'dead bytes' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${l.cls}`} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* header fields + slot table */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">header — the only bookkeeping allowed</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { name: 'slot_count', range: '[0,2)', val: page.slots.length },
              { name: 'records_start', range: '[2,4)', val: page.recordsStart },
              { name: 'dead_bytes', range: '[4,6)', val: page.deadBytes },
            ].map((h) => (
              <div key={h.name} className="rounded border border-line bg-ink p-2.5">
                <p className="font-mono text-[10px] text-text-3">
                  {h.name} <span className="text-text-3/70">{h.range}</span>
                </p>
                <p className="mt-1 font-mono text-[16px] text-text-1">{h.val}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-text-3">
            free_space() is derived, never stored: contiguous {`(records_start − 8 − 6·slot_count)`} + dead_bytes.
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">slot array — 6B each: [offset][len][flags]</p>
          <div className="mt-2 space-y-1">
            {page.slots.length === 0 && (
              <p className="rounded border border-dashed border-line px-2.5 py-2 font-mono text-[11px] text-text-3">
                empty — the first insert appends slot 0 at bytes [8, 14)
              </p>
            )}
            {shownSlots.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded border border-line bg-ink px-2.5 py-1 font-mono text-[11px]">
                <span className="w-7 text-text-3">#{i}</span>
                <span className="text-text-2">off {s.offset}</span>
                <span className="text-text-2">len {s.len}</span>
                {s.live ? (
                  <span className="text-accent">LIVE</span>
                ) : (
                  <span className="text-danger">dead{i === lowestTomb ? ' ← next insert reuses this' : ''}</span>
                )}
                {s.live && (
                  <button
                    onClick={() => doDelete(i)}
                    className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-text-3 hover:border-danger/60 hover:text-danger"
                  >
                    delete
                  </button>
                )}
              </div>
            ))}
            {page.slots.length > shownSlots.length && (
              <p className="px-1 font-mono text-[10px] text-text-3">… {page.slots.length - shownSlots.length} more slots</p>
            )}
          </div>
        </div>
      </div>

      {/* exact accounting */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="font-mono text-[11px] text-text-3">free_space() right now, to the byte:</p>
        <input
          value={exactInput}
          onChange={(e) => onExact(e.target.value)}
          placeholder="your number"
          className={`mt-2 w-full max-w-xs rounded border bg-ink px-3 py-1.5 font-mono text-[12px] text-text-1 outline-none placeholder:text-text-3 ${
            flags.exact ? 'border-accent/60' : 'border-line focus:border-accent/60'
          }`}
        />
        {flags.exact && (
          <p className="mt-2 font-mono text-[11px] text-accent">
            exact — {free}B = contiguous + dead_bytes, maintained from the header on every op, never scanned.
          </p>
        )}
      </div>
    </LabShell>
  )
}
