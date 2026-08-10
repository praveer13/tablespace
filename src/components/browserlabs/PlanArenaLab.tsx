import { LabShell } from '.'

export default function PlanArenaLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="plan-arena" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
