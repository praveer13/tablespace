import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't5.l3',
  slug: 'the-planner-guesses',
  trackId: 't5',
  index: 3,
  title: 'The Planner Guesses',
  minutes: 13,
  hook: 'Statistics, selectivity, cost models: why the planner picks bad plans on your data specifically, and how to read EXPLAIN as an estimate sheet.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'callout',
      variant: 'info',
      title: 'in development',
      md: 'This lesson is being written — the outline below is the contract it will teach to.',
    },
    {
      type: 'prose',
      md: `## What this lesson will cover

- What the planner knows: histograms, distinct counts, null fractions — a sketch of your data, not your data.
- Selectivity math: \`rows × sel\` at every node, and how errors compound up the plan tree.
- The classic mis-estimates: correlated predicates, stale stats, functions the planner can't see through.
- Cost constants as fiction you can tune: random_page_cost and friends, revisited after T0.`,
    },
  ],
}

export default lesson
