import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'

/**
 * Routing contract: Layout renders `{children}` (pattern A), so App wraps
 * `<Layout><Routes>…</Routes></Layout>` — never mix with <Outlet/>.
 *
 * Pages are route-level lazy chunks: the lesson registry (37 lessons of
 * prose) and the sims ride with their pages, not with first paint.
 */
const Curriculum = lazy(() => import('@/pages/Curriculum'))
const Track = lazy(() => import('@/pages/Track'))
const Lesson = lazy(() => import('@/pages/Lesson'))
const Forge = lazy(() => import('@/pages/Forge'))
const ForgeLab = lazy(() => import('@/pages/ForgeLab'))
const Engine = lazy(() => import('@/pages/Engine'))
const Drills = lazy(() => import('@/pages/Drills'))
const Leaderboard = lazy(() => import('@/pages/Leaderboard'))
const Progress = lazy(() => import('@/pages/Progress'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function RouteFallback() {
  return (
    <div className="mx-auto max-w-app px-6 pb-24 pt-24 lg:px-12">
      <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.16em] text-text-3">
        loading…
      </p>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/curriculum" element={<Curriculum />} />
          <Route path="/tracks/:trackId" element={<Track />} />
          <Route path="/lesson/:lessonId" element={<Lesson />} />
          <Route path="/labs" element={<Forge />} />
          <Route path="/labs/:labId" element={<ForgeLab />} />
          <Route path="/engine" element={<Engine />} />
          <Route path="/drills" element={<Drills />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
