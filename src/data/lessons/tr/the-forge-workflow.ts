import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 'tr.l4',
  slug: 'the-forge-workflow',
  trackId: 'tr',
  index: 4,
  title: 'The Forge Workflow',
  minutes: 15,
  hook: 'rustup to a dropped .wasm: the forge loop — unzip, cargo test red→green, build for wasm32, watch the checks light up in the browser. Ends at lab 01.',
  exercise: 'read+quiz',
  blocks: [
    {
      type: 'prose',
      md: `The last piece of the ramp is not the language — it is the **loop**. Every forge lab runs the same five-step circuit: download, test, implement, build, drop. The Rust you just learned is the vocabulary; this lesson is the grammar of a working session, walked once end to end so that lab 01 costs you design effort and zero setup tax. Do the steps for real as you read — by the last section the toolchain will be warm and the only thing left will be the page.`,
    },
    {
      type: 'prose',
      md: `## Step zero: the toolchain, once per machine`,
    },
    {
      type: 'code',
      filename: 'terminal — one install, one target',
      lang: 'bash',
      code: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

cargo --version    # sanity: the build tool you will live in
rustc --version    # the tutor`,
      chips: ['rustup = rust + cargo', 'one time only'],
    },
    {
      type: 'prose',
      md: `\`rustup\` installs the stable toolchain: \`rustc\` (the compiler) and \`cargo\` (the build tool, test runner, and package manager — Maven and javac in one binary, minus the XML). The second line teaches rustc to emit WebAssembly. That is the entire install. No IDE required; the compiler errors are the interface, and they are good enough to be the course's teaching assistant — when \`cargo test\` fails to *build*, read the error the way you would read a code review from someone pedantic and always right.

## Steps one and two: unzip, go red

Each lab downloads as a zip: one crate, a grading harness that ships complete, and **one file marked \`TODO(you)\`** — the only file you edit. Unzip it somewhere under your home directory and run the checks:`,
    },
    {
      type: 'code',
      filename: 'terminal — the first run is supposed to be red',
      lang: 'bash',
      code: `unzip slotted-pages.zip && cd slotted-pages
cargo test

# test checks::insert_read ... FAILED
# ---- checks::insert_read stdout ----
# thread 'checks::insert_read' panicked at src/page.rs:
# not implemented: reuse the lowest tombstone or append a slot; ...`,
      chips: ['red is the starting state', 'the traps talk'],
    },
    {
      type: 'prose',
      md: `All red, every check trapped on a \`todo!\` — that is not a broken lab, that is the syllabus. Two things to internalize on this first run. **The checks are the spec**: the harness source is in the crate, it is readable, and its failure messages name the violated invariant (overlap, free-space leak, visibility violation) rather than just asserting false. Read them before you design. And **\`cargo test\` is the inner loop**: implement one op, rerun, watch one check flip. Native compilation, sub-second iteration. Do not touch the browser until checks are green locally.

## Steps three and four: build the wasm, drop it on the page`,
    },
    {
      type: 'code',
      filename: 'terminal — from green tests to a graded artifact',
      lang: 'bash',
      code: `cargo build --release --target wasm32-unknown-unknown
# → target/wasm32-unknown-unknown/release/slotted_pages.wasm`,
      chips: ['release build', 'wasm32 target'],
    },
    {
      type: 'prose',
      md: `Drag that \`.wasm\` onto the lab page. The browser instantiates it and runs **the same checks** the crate ran locally — same code, same expectations, under the site's trace. Local \`cargo test\` is where you iterate; the dropped wasm is where the grade lands. If it is green locally and red in the browser, suspect determinism before you suspect the harness, which brings us to the one platform trap worth memorizing:`,
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'wasm32 is a deterministic target',
      md: `std's \`HashMap\`/\`HashSet\` seed their hasher from OS randomness — which **does not exist** on \`wasm32-unknown-unknown\`; they panic there. The mvcc template says it verbatim: use \`BTreeMap\` and \`BTreeSet\`, ordered and deterministic everywhere. Same discipline as the rest of the course: a storage engine that depends on ambient randomness is a storage engine you cannot replay.`,
    },
    {
      type: 'prose',
      md: `## Step five: git is your work-backup

The labs are deliberately one file, which makes version control trivially cheap and brutally useful:

\`\`\`
git init && git add -A && git commit -m "template, all red"
\`\`\`

Then commit **on every green check**: \`insert_read green\`, \`no_overlap green\`. A red experiment is one \`git checkout\` away from your last green state, and the diff between two green commits is exactly the design decision that bought the check — your own changelog, written in working code. The 2000-op storm will, at least once, send you back to the last green. That is not failure; that is the workflow working.

## The tutoring contract

Every lab ships an \`AGENTS.md\`, and if you work with a coding agent — this course assumes you might — that file is the terms of engagement. It permits tutoring and forbids the shortcut: the agent may **name the concept, point at the failing check, explain the invariant, sketch a small fragment**. It may never write the solution. If it hands you a complete \`page.rs\`, it has not saved you time — it has robbed you of the only grade that matters, the one your understanding earns, and the later labs (which assume you built the earlier ones) will collect the debt. Paste the \`AGENTS.md\` into your agent's context and hold it to the contract. The checks are readable; a good tutor teaches you to read them, then stops talking.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '1', label: 'command in the inner loop', hint: 'cargo test. Native, sub-second, same checks the browser runs.' },
        { value: '5', label: 'checks grade lab 01', hint: 'insert_read · no_overlap · freespace_accounting · delete_reuse · storm.' },
        { value: '2000', label: 'ops in the storm', hint: 'Seeded, against a reference model — then a full-delete leak check that must end at exactly 8184 free.' },
        { value: '1', label: 'file you may edit', hint: 'src/page.rs in lab 01. The harness ships complete; your design fills one struct.' },
      ],
    },
    {
      type: 'prose',
      md: `## Now: lab 01

That is the whole ramp. T0 taught you what a page is and T1.L1 drew the slotted layout to the byte; Tᴿ gave you the structs, the ownership law, the two enums, and now the loop. Everything left is the good part. Download **slotted-pages** from the labs page, open \`src/page.rs\`, and make \`insert_read\` green. The storm is waiting.`,
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'What is the forge loop, in order?',
          options: [
            'Build the wasm → drop it on the lab page → read the red checks → implement',
            'Unzip → cargo test (all red) → implement op by op until green → cargo build --release --target wasm32-unknown-unknown → drop the .wasm on the lab page',
            'Implement the whole file → cargo test once → fix everything → submit the .rs source',
            'Write tests against the harness API → implement → publish the crate',
          ],
          correct: [1],
          explanation:
            'Red first, on purpose: the traps are the checklist and the checks are the spec. Iterate natively with cargo test; the wasm drop is the grading step, not the development environment.',
        },
        {
          q: 'Your lab is green locally but traps immediately in the browser. The template docs already told you the likely cause. What is it?',
          options: [
            'Release-mode optimizations reorder your writes; rebuild with --debug-assertions',
            'HashMap/HashSet draw OS randomness that does not exist on wasm32-unknown-unknown and panic there — switch to BTreeMap/BTreeSet',
            'The browser sandboxes float arithmetic; use integers only',
            'wasm has no heap; every allocation must be static',
          ],
          correct: [1],
          explanation:
            'std hash tables seed from the OS; the wasm32-unknown-unknown target has none to give. Ordered maps are deterministic on every target — which is also why the harness can replay your run exactly.',
        },
        {
          q: 'Under a lab’s AGENTS.md, which agent behavior is inside the contract?',
          options: [
            'Writing the complete page.rs so you can study the finished style',
            'Refusing to discuss the lab at all, since the checks are graded',
            'Reading the failing check with you, naming the concept it tests, explaining the invariant, sketching a fragment at most — and stopping there',
            'Implementing only the hard methods and leaving the easy ones to you',
          ],
          correct: [2],
          explanation:
            'Tutor, never solver. The contract exists because the labs compound: lab 02 assumes you built lab 01. A solution you did not produce is a prerequisite you do not have.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the tools and the reps',
      md: `The toolchain deserves one quiet hour before it saves you ten: [The Rust Book chapter 1](https://doc.rust-lang.org/book/ch01-00-getting-started.html) covers rustup and cargo new/build/test, and [appendix G](https://doc.rust-lang.org/book/appendix-07-nightly-rust.html) is skippable — but the [Cargo Book's workflow chapters](https://doc.rust-lang.org/cargo/) (\`cargo test\` flags, profiles, \`--release\`) are the difference between using the tool and driving it. For pure language reps, [rustlings](https://rustlings.rust-lang.org/) start to finish is the single best investment before lab 02 — every exercise is one compiler argument, and by the end the error messages read as advice. The [Brown interactive Rust Book](https://rust-book.cs.brown.edu/) remains the reference to keep open in a tab, and the [std docs](https://doc.rust-lang.org/std/) — \`slice\`, \`BTreeMap\`, \`Option\`, \`Result\` — are the entire permitted standard library surface in spirit. Then close the tabs: the next lesson that matters is T1.L1's layout drawing, and the next code that matters is yours, in \`page.rs\`.`,
    },
  ],
}

export default lesson
