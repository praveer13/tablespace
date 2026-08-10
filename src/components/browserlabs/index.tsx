/**
 * Browser labs — registry + shared shell (EXPANSION.md wave 1).
 *
 * Each lab is a self-contained interactive component: it owns its
 * interaction, grades deterministically in-page, and reports completion to
 * the progress store as a sim task (`blab:<id>` / 'complete'). Pattern for
 * new labs — copy CostModelLab:
 *   - fixed seeded scenario constants at the top (no wall-clock, no Math.random)
 *   - tasks graded live as the student manipulates the surface
 *   - <LabShell> provides the frame + task checklist + completion line
 */

import { type ReactNode } from 'react'
import { Check, FlaskConical } from 'lucide-react'
import { browserLabMeta } from '@/data/browser-labs'
import { cn } from '@/lib/utils'
import { useLabCompletion, type LabTask } from './shared'
import CostModelLab from './CostModelLab'

export type { LabTask }

/** The shared frame: header chip, interactive surface, task checklist. */
export function LabShell({
  labId,
  trackColor,
  children,
  tasks,
}: {
  labId: string
  trackColor: string
  children: ReactNode
  tasks: LabTask[]
}) {
  const meta = browserLabMeta(labId)
  const allDone = useLabCompletion(labId, tasks)
  const doneCount = tasks.filter((t) => t.done).length

  return (
    <section className="my-8 overflow-hidden rounded-lg border border-line bg-surface-1" data-lab={labId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-label uppercase" style={{ color: trackColor }}>
            browser lab
          </span>
          <span className="font-display text-body-sm font-medium text-text-1">{meta?.title ?? labId}</span>
        </div>
        <span className="font-mono text-[11px] text-text-3">
          {allDone ? (
            <span className="text-accent"><Check className="mr-1 inline h-3 w-3" />complete</span>
          ) : (
            `${doneCount}/${tasks.length} tasks`
          )}
        </span>
      </div>

      <div className="px-5 py-5">{children}</div>

      <div className="border-t border-line px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">tasks</p>
        <ul className="mt-2 space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 font-mono text-[12px]">
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                  t.done ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-transparent',
                )}
              >
                <Check size={10} strokeWidth={3} />
              </span>
              <span className={t.done ? 'text-text-2 line-through opacity-70' : 'text-text-2'}>
                {t.label}
                {!t.done && t.hint && <span className="block text-[10.5px] text-text-3">{t.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        {allDone && (
          <p className="mt-3 font-mono text-[12px] text-accent">
            all tasks green — run it in the forge next.
          </p>
        )}
      </div>
    </section>
  )
}

const REGISTRY: Record<string, (p: { trackColor: string }) => ReactNode> = {
  'cost-model': CostModelLab,
}

/** Renders a `lab` content block. Unknown ids render a gentle placeholder. */
export function BrowserLabView({ lab, trackColor }: { lab: string; trackColor: string }) {
  const C = REGISTRY[lab]
  if (!C) {
    return (
      <section className="my-8 rounded-lg border border-dashed border-line bg-surface-1 px-5 py-8 text-center">
        <FlaskConical className="mx-auto h-5 w-5 text-text-3" />
        <p className="mt-2 font-mono text-[12px] text-text-3">browser lab “{lab}” is being built</p>
      </section>
    )
  }
  return <C trackColor={trackColor} />
}
