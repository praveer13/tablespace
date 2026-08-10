import { LabShell } from '.'

export default function PageSurgeryLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="page-surgery" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
