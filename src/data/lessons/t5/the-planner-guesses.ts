import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 't5.l3',
  slug: 'the-planner-guesses',
  trackId: 't5',
  index: 3,
  title: 'The Planner Guesses',
  minutes: 15,
  hook: 'Statistics, selectivity, cost models: why the planner picks bad plans on your data specifically, and how to read EXPLAIN as an estimate sheet.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `T5.L2 priced the joins with true cardinalities handed to you on a card. The planner gets no card. It plans your query — join order, join algorithm, scan type — in milliseconds, before a single row is read, from a **sketch** of your data: a few kilobytes per column in \`pg_statistic\`, collected by ANALYZE, refreshed on a schedule, and wrong in ways you can learn to predict.

What the sketch holds, per column: the **most common values** with their frequencies, an **equi-depth histogram** of bounds for everything else, a **distinct count** (\`n_distinct\`), and the **null fraction**. With \`default_statistics_target = 100\` you get 100 MCV slots and 100 histogram buckets, drawn from 300 × 100 = **30,000 sampled rows** — of a table that might hold a billion. Everything the planner believes about selectivity is derived from this. It is a good sketch. It is not the data.`,
    },
    {
      type: 'prose',
      md: `## Selectivity math

The planner's atom is the **selectivity**: a fraction in [0,1] answering "what share of rows survives this predicate?" \`country = 'DE'\`: if 'DE' is in the MCV list, use its stored frequency; otherwise assume the non-MCV mass spreads uniformly across the remaining \`n_distinct\` values. A range like \`age < 30\`: find where 30 falls among the histogram bounds and interpolate. Then arithmetic up the tree:

- **\`rows_out = rows_in × sel\`** at every node — scans, joins, everything.
- **AND multiplies**: \`sel(A ∧ B) = sel(A) × sel(B)\`. That multiplication *is* the independence assumption, and it is where the bodies are buried.
- **Joins estimate \`1 / max(n_distinct(a), n_distinct(b))\`** per pair of join columns — a heuristic dressed as a theorem.

And errors **compound multiplicatively**. A 2× miss at the scan feeds a join whose own estimate is off 2×, feeding the join above it — by the root you are 8–10× from truth, and every choice along the way (nested-loop vs hash, this join order vs that one) was made with the wrong numbers. Which is why practitioners hunt bad plans by walking \`EXPLAIN ANALYZE\` looking for the *first* node where \`rows=\` diverges from \`actual rows\` by an order of magnitude. Everything wrong above that node is usually downstream of it.`,
    },
    {
      type: 'prose',
      md: `## The classics: three ways the sketch lies

**Correlated predicates.** \`WHERE country = 'DE' AND city = 'Berlin'\` on a 10M-row table: \`n_distinct(country) = 200\` → sel 0.005; \`n_distinct(city) = 50,000\` → sel 0.00002. The planner multiplies: 10M × 0.005 × 0.00002 = **1 row**. The truth: city determines country — the predicates are one predicate — so the real count is 10M × 0.00002 = **200 rows**. A 200× underestimate, and "1 row" is exactly the outer side T5.L2's nested-loop adores: the planner will happily hang an index-descent inner loop off it, once, it thinks. Two hundred descents later — or two hundred thousand on a Berlin-heavy events table — you have an incident. The fix exists: \`CREATE STATISTICS\`, extended statistics that teach ANALYZE cross-column dependencies.

**Stale stats.** The sketch refreshes on ANALYZE's schedule, not on your writes. A table that doubled since the last run, a bulk load five minutes ago, an id range that grew past the histogram's top bound — the planner is interpolating over yesterday's data. A range predicate beyond the histogram's end estimates as *almost nothing*, and a falsely tiny estimate is the most dangerous number in the system: it is what buys the catastrophic nested-loop.

**Opaque expressions.** Statistics exist on *columns*, not expressions. \`WHERE lower(email) = $1\`, or \`WHERE payload->>'status' = 'x'\`: the planner holds no histogram for the expression, so it falls back to a hard-coded guess — 0.5% for an equality it cannot see through. That number is a confession, not an estimate. The fix is to make the expression a first-class thing: an **expression index** (whose statistics ANALYZE then collects) or a generated column. Same data, now visible.`,
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'why not just keep exact stats?',
      md: `Exact cardinalities are not free. \`COUNT(DISTINCT)\` needs state proportional to the data — there is a reason HyperLogLog exists — and maintaining per-column histograms *on every write* would make statistics a second write workload riding on every INSERT. So the design samples: ANALYZE reads 30,000 rows in milliseconds, the planner plans in milliseconds, and the system accepts being *systematically, predictably* wrong in exchange. The skill this lesson teaches is recognizing the predictable ways.`,
    },
    {
      type: 'prose',
      md: `## Cost constants, revisited after T0

Selectivity produces row counts; the price sheet from T0.L2 turns row counts into a plan. Now you can read the whole equation — a plan's cost is roughly

\`pages × (seq|random)_page_cost  +  rows × cpu_tuple_cost  +  per-operator setup\`

quoted in units of \`seq_page_cost = 1\`. And the constants' faults are now *mechanisms*, not trivia. \`random_page_cost = 4\` prices an index descent's random fetches at 4× sequential, so on NVMe — honest ratio ~1–2 — the planner systematically over-avoids index scans: the flip-flop from T0.L2 now has a cause you can point at in the math. \`effective_cache_size\` allocates nothing; it tells the planner how much caching to *assume* when estimating whether random pages will be hits.

Two disciplines fall out. First, **cost is a fiction for ranking, not a measurement**: 128,542 means nothing absolute — it is valid only for comparing plans of *this query, on this install, under these constants*. Never compare costs across servers, never report a cost as a latency. Second, the tuning order when a plan is wrong: (1) ANALYZE — is the sketch fresh? (2) If the mis-estimate survives, fix the *statistics* — extended stats, expression indexes, a higher target on skewed columns — before touching constants. (3) Only then re-price the hardware: \`random_page_cost ≈ 1.1\` on NVMe, an honest \`effective_cache_size\`. Hints pin one plan to one moment of your data's life; statistics let the planner keep choosing. Choose the thing that ages well.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '30,000', label: 'rows sampled per table', hint: '300 × default_statistics_target (100). The entire empirical basis for your plans — however large the table.' },
        { value: '100', label: 'MCV slots / histogram buckets', hint: 'Per column. Raise the target per-column on skewed data; the sketch gets finer where you point it.' },
        { value: '0.5%', label: 'the confession guess', hint: 'Selectivity for an equality the planner cannot see through (opaque expression, no stats). A placeholder wearing a number.' },
        { value: '10×', label: 'divergence worth hunting', hint: 'Rule of thumb: find the first EXPLAIN ANALYZE node where rows= vs actual rows differs by ~an order of magnitude. The bug is at or below it.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'On a 10M-row table: WHERE country = \'DE\' AND city = \'Berlin\', with n_distinct(country) = 200 and n_distinct(city) = 50,000. What does the planner estimate, and what is the truth?',
          options: [
            'Estimates 200 rows; truth is 1 — the histograms are exact for cities',
            'Estimates 1 row (10M × 0.005 × 0.00002); truth is ~200 — city determines country, so the independence assumption underestimates 200×',
            'Estimates 1 row; truth is 1 — multiplying selectivities is always sound',
            'Estimates 100,000 rows; truth is 200 — ANDed predicates always overestimate',
          ],
          correct: [1],
          explanation:
            'sel(A) × sel(B) is valid only when A and B are independent. City ⊂ country makes the two predicates one predicate, so the true selectivity is the smaller one alone. CREATE STATISTICS (dependencies) exists precisely to teach ANALYZE this case.',
        },
        {
          q: 'A correlated-predicate mis-estimate keeps producing a catastrophic nested-loop plan. Which fixes address the mechanism? (Select all that apply.)',
          multi: true,
          options: [
            'CREATE STATISTICS on (country, city) so ANALYZE records the cross-column dependency',
            'REINDEX the table\'s primary key',
            'Expose the combination as a generated column or expression index, so statistics exist on the thing being filtered',
            'Run ANALYZE more frequently',
          ],
          correct: [0, 2],
          explanation:
            'The mechanism is missing dependency information, and neither re-indexing nor a fresher single-column sketch supplies it — ANALYZE at any frequency still assumes independence. Extended statistics, or making the expression a first-class statted column, put the correlation into the sketch.',
        },
        {
          q: 'EXPLAIN reports cost=128542. A colleague converts it to milliseconds by dividing by 1000. Why is that wrong?',
          options: [
            'He should divide by seq_page_cost first',
            'Cost is not a time: it is an abstract price in units of seq_page_cost, valid only for ranking alternative plans of the same query on the same install — the mapping to milliseconds changes with every constant and every disk',
            'Costs are already milliseconds, so no conversion is needed',
            'Dividing is right; the divisor is 100, not 1000',
          ],
          correct: [1],
          explanation:
            'Cost units exist so the planner can compare its own candidate plans under one set of constants. Change random_page_cost or the hardware and the same query re-prices without running a millisecond differently. If you want time, measure time: EXPLAIN ANALYZE.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'going deeper: estimates as a research field',
      md: `The docs that run your production plans: **PostgreSQL manual, "How the Planner Uses Statistics"** and **"Planner Cost Constants"** — two chapters that admit, in print, that the model is a model. The origin: **Selinger et al. (SIGMOD 1979)** — selectivity estimation and cost-based access-path selection, basically unchanged in spirit for four decades. The reckoning: **Leis et al., "How Good Are Query Optimizers, Really?" (VLDB 2015)** — the Join Order Benchmark paper, which measured real optimizers against reality and pinned the catastrophic plans on cardinality mis-estimation, exactly the compounding this lesson described; its follow-ups on pessimistic estimation are where the field went next. Lectures: **CMU 15-721 on query optimization**. And the knob-level fix for the correlation case: **the CREATE STATISTICS docs** — dependencies, ndistinct, extended MCV — the least-used high-leverage feature in Postgres.`,
    },
  ],
}

export default lesson
