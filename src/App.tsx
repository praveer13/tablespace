import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Curriculum from '@/pages/Curriculum'
import Track from '@/pages/Track'
import Lesson from '@/pages/Lesson'
import Forge from '@/pages/Forge'
import ForgeLab from '@/pages/ForgeLab'
import Engine from '@/pages/Engine'
import Drills from '@/pages/Drills'
import Leaderboard from '@/pages/Leaderboard'
import Progress from '@/pages/Progress'
import NotFound from '@/pages/NotFound'

/**
 * Routing contract: Layout renders `{children}` (pattern A), so App wraps
 * `<Layout><Routes>…</Routes></Layout>` — never mix with <Outlet/>.
 */
export default function App() {
  return (
    <Layout>
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
    </Layout>
  )
}
