import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Database, Gauge, Layers, Waves } from 'lucide-react'

/**
 * The Engine — tablespace's persistent world. One database, assembled
 * cumulatively from the student's own lab artifacts, driven by a
 * deterministic trace player. v0 (buffer-pool visualization + first trace
 * mode) lands with the T0/T1 content wave; this page is the doorway.
 */

const ROADMAP = [
  {
    icon: Layers,
    title: 'the buffer pool, visible',
    body: 'Frames, pins, dirty bits — your lab-01 pages cached, evicted, and flushed in front of you. Hit rate is the pulse; the sequential flood is the stress test.',
  },
  {
    icon: Waves,
    title: 'a trace that never forgives',
    body: 'A deterministic page-reference stream (TPC-C shape first, then scan-heavy and skewed modes). Same trace, every run — divergence from the reference is drawn page by page.',
  },
  {
    icon: Gauge,
    title: 'your code, not ours',
    body: 'Each lab\'s wasm plugs in cumulatively: allocator, tree, WAL, MVCC, executor, HNSW. By T6 the engine answering the trace is the one you built.',
  },
]

export default function Engine() {
  return (
    <div className="mx-auto max-w-app px-6 pb-24 pt-16 lg:px-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">the engine · sim</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-1 sm:text-4xl">
          One database, page by page.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-2">
          The persistent world of the course: a single engine that starts as an empty buffer pool and
          ends as your storage engine, your indexes, your executor — driven by a deterministic trace
          that replays exactly, every time. The simulation is being wired up; the first trace mode
          ships with the T0/T1 wave.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ROADMAP.map((r, i) => (
          <motion.div
            key={r.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border border-line bg-surface-1 p-6"
          >
            <r.icon className="h-5 w-5 text-accent" />
            <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.1em] text-text-1">{r.title}</p>
            <p className="mt-2 text-body-sm text-text-2">{r.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-1 p-6"
      >
        <Database className="h-5 w-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-body-sm text-text-2">
          The engine starts as eight kilobytes of empty page. Lab 01 is where you fill it.
        </p>
        <Link
          to="/labs/slotted-pages"
          className="inline-flex items-center gap-2 rounded-md border border-accent/60 bg-accent/10 px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent/20"
        >
          start lab 01 <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    </div>
  )
}
