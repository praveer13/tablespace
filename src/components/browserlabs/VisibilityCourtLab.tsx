import { LabShell } from '.'

export default function VisibilityCourtLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="visibility-court" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
