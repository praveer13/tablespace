import { LabShell } from '.'

export default function BtreeSurgeonLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="btree-surgeon" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
