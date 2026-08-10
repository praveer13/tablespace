import { LabShell } from '.'

export default function HnswExplorerLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="hnsw-explorer" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
