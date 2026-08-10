import { LabShell } from '.'

export default function WalReplayLab({ trackColor }: { trackColor: string }) {
  return (
    <LabShell labId="wal-replay" trackColor={trackColor} tasks={[]}>
      <p className="font-mono text-[12px] text-text-3">under construction</p>
    </LabShell>
  )
}
