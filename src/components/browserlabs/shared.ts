/**
 * Shared bits for browser labs (kept out of index.tsx so that file stays
 * component-only for fast refresh).
 */

import { useEffect } from 'react'
import { useProgress } from '@/lib/progress'

export interface LabTask {
  id: string
  label: string
  done: boolean
  /** one-line hint shown until the task is done */
  hint?: string
}

/** Record completion when every task is done. Call once per lab. */
export function useLabCompletion(labId: string, tasks: LabTask[]): boolean {
  const allDone = tasks.length > 0 && tasks.every((t) => t.done)
  const recordSimTask = useProgress((s) => s.recordSimTask)
  useEffect(() => {
    if (allDone) recordSimTask(`blab:${labId}`, 'complete')
  }, [allDone, labId, recordSimTask])
  return allDone
}
