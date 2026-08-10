import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 'tr.l2',
  slug: 'ownership-is-a-resource-protocol',
  trackId: 'tr',
  index: 2,
  title: 'Ownership Is a Resource Protocol',
  minutes: 14,
  hook: 'Ownership and borrowing as a resource protocol: moves are page handoffs, & is a read latch, &mut is a write latch — and the compiler is the lock manager.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `Every language you have shipped manages the lifetime of values with a *runtime*: a garbage collector that traces the heap (Java, Python), or convention plus hope (C). Rust moves the whole question to compile time, and the mechanism is not a garbage collector with the pauses removed — it is a **resource protocol**, stated as three rules and enforced before the binary exists. Here is the part the tutorials bury: **you already know this protocol.** T0 taught it to you. The buffer pool's pin counts and latches — who may hold a page, who may write it, when it may be reused — are ownership and borrowing, enforced at runtime with crashes for violators. Rust is the same discipline with a compiler standing where the crash used to be.

This lesson maps the three rules onto the three things you already do to a buffer frame.`,
    },
    {
      type: 'prose',
      md: `## Rule one: one owner, one drop

Every value has exactly **one owner** — the binding that holds it. When the owner goes out of scope, the value is *dropped*: its destructor runs, its memory frees, deterministically, at that exact line. This is try-with-resources applied to every value in the program, with the compiler writing every \`finally\`. No pause, no sweep, no finalizer queue: the 8192 bytes of a \`Page\` come back the instant its owner dies, and you can point at the line where it happens.

In buffer-pool terms: a frame's contents are unallocated the moment the last pin falls — except the pin count is not a counter the pool maintains at runtime. It is a fact the compiler *proved* about your code.`,
    },
    {
      type: 'prose',
      md: `## Rule two: assignment is the page handoff

Passing a value — to a variable, into a function, out of one — **moves** it. Not copies: transfers. The old binding is dead the moment the new one takes the deed, and using it is a compile error, not a use-after-free.`,
    },
    {
      type: 'code',
      filename: 'moves.rs — the handoff, caught at compile time',
      lang: 'rust',
      code: `let p1 = Page::new();   // p1 owns the page
let p2 = p1;            // ownership MOVES to p2 — no 8 KiB copy
// p1.free_space();     // compile error: value borrowed here after move
p2.free_space();        // fine — p2 holds the deed

hand_to_wal(p2);        // ownership moves into the function...
// p2.defrag();         // ...so this no longer compiles either`,
      chips: ['move, not copy', 'use-after-move = build error'],
    },
    {
      type: 'prose',
      md: `Read that listing again: the bug class that eats C++ storage engines — a frame handed back to the pool while an index still points into it, then reused under the dangling pointer — is **unrepresentable**. It does not get caught by tests, fuzzers, or code review; it does not compile. When you genuinely want a copy, you say so: \`let p2 = p1.clone();\` — explicit, greppable, and priced (8 KiB is not free) at the call site where the cost belongs.`,
    },
    {
      type: 'prose',
      md: `## Rule three: & is the read latch, &mut is the write latch

Owning everything forever is useless — functions need to *visit* values without taking them. References are visits, and they come in exactly two kinds:

- **\`&Page\` — a shared borrow.** The read latch. Any number may be held at once, by anyone; while a single one is alive, the page cannot change.
- **\`&mut Page\` — an exclusive borrow.** The write latch. At most one exists, and while it does, no readers and no other writer hold anything on that page.

Stated once, the whole law: **many readers XOR one writer.** You know it as the \`RwLock\` contract, and you know what your codebase does to enforce it: latch acquisition orders, assertions, postmortems. The borrow checker enforces the identical rule at compile time. A data race in safe Rust is not a bug you chase — it is a program you were not allowed to build.`,
    },
    {
      type: 'callout',
      variant: 'isomorphism',
      md: `**Borrow rules ≡ latch discipline.** \`&T\` is a read latch: shared, held while you read, released at scope end — no upgrades. \`&mut T\` is a write latch: exclusive, no coexistence, released at scope end. The borrow checker is the lock manager, except it grants or denies *at compile time*: it never blocks, never starves, and never deadlocks, because a program whose latch graph could misbehave is rejected before it runs. What Postgres proves with \`LWLock\` conventions and crash reports, Rust proves with types.`,
    },
    {
      type: 'code',
      filename: 'borrows.rs — visits, not handoffs',
      lang: 'rust',
      code: `fn checksum(page: &Page) -> u64 {
    // reads only — any number of & borrows may coexist
    todo!()
}

fn compact(page: &mut Page) {
    page.defrag();   // exclusive — no reader may be alive right now
}

// The signature you will write a hundred times in lab 01:
fn read(&self, slot: u16) -> Option<&[u8]> { todo!() }
// Returns a slice pointing INTO the page. The compiler guarantees the
// page outlives the slice and nobody mutates it while the slice lives.
// No pin count to maintain — the language is doing the pinning.`,
      chips: ['many readers XOR one writer', 'lifetimes elided'],
    },
    {
      type: 'prose',
      md: `That last signature is the only lifetime pattern the labs use, and you will never annotate it: the returned \`&[u8]\` borrows from \`&self\`, and the compiler *elides* — infers — that relationship because there is exactly one place the bytes could come from. The slice is a read latch you carry out of the function: while it is alive, \`page.insert(...)\` anywhere is a compile error, because insert needs the write latch you are implicitly still holding. T0 made you track that by convention. Here it is arithmetic.

## What the checker charges you

The honest price: sometimes the compiler refuses code that would have run fine, because it proves properties for *all* executions, not the one you meant. The fix is almost never a fight — it is making the data flow more explicit: restructure so borrows do not overlap, \`clone()\` where you truly want a second copy, split the big function at the handoff boundary. The discipline front-loads design decisions your Java code defers to a 3 a.m. heap dump. And it is precisely why the lab harnesses can trust your wasm with a 2000-op storm: the aliasing bugs are gone before the first check runs.`,
    },
    {
      type: 'statline',
      stats: [
        { value: '1', label: 'owner per value', hint: 'Exactly one binding holds the deed. Scope end = drop, deterministically.' },
        { value: 'N ⊻ 1', label: 'the whole borrow law', hint: 'N shared borrows (&) XOR 1 exclusive borrow (&mut). Never both. Checked at compile time.' },
        { value: '0', label: 'runtime cost', hint: 'Borrow checking happens entirely in the compiler. The binary carries no counters, no locks, no GC.' },
        { value: '0', label: 'data races in safe Rust', hint: 'No unsafe blocks in the forge labs — so the guarantee covers every line you write.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: '`let p2 = p1;` where p1 owns a Page. What happened to the 8192 bytes?',
          options: [
            'They were copied; p1 and p2 are independent pages',
            'They were reference-counted; both bindings share the page until both die',
            'Nothing moved in memory — ownership transferred to p2 on paper, and p1 is now a compile error waiting to happen',
            'They were moved, and p1 will double-free them if it goes out of scope',
          ],
          correct: [2],
          explanation:
            'A move transfers the deed; the bytes stay put. p1 is statically dead — the compiler rejects any later use. Double-free is impossible because only p2 will ever drop the buffer.',
        },
        {
          q: 'A thread of execution holds a `&Page` slice returned by `page.read(slot)`. Meanwhile `page.insert(b"new")` is attempted. What does Rust do?',
          options: [
            'Blocks the insert until the read latch is released, like an RwLock',
            'Allows it — readers and one writer can safely interleave on disjoint bytes',
            'Panics at runtime with a borrow violation',
            'Refuses to compile the program — the read borrow is alive, so the exclusive borrow insert requires cannot be granted',
          ],
          correct: [3],
          explanation:
            'insert takes &mut self; a live & borrow from read() makes that exclusive borrow ungrantable. The check is static: there is no runtime to block, panic, or interleave in.',
        },
        {
          q: 'Why is it safe for `read(&self, slot: u16) -> Option<&[u8]>` to hand out a pointer into the page with no pin count, no copy, and no lifetime annotation?',
          options: [
            'It is not safe — the template relies on callers being careful, like C',
            'The slice is bounds-checked at runtime, which covers the aliasing too',
            'The compiler elides the lifetime: the slice borrows from &self, so for as long as the slice is alive the page is frozen — no mutation, no deallocation, no defrag. The pin is enforced by the type system',
            'wasm linear memory makes dangling pointers impossible',
          ],
          correct: [2],
          explanation:
            'Elision infers the only possible relationship: the output borrows from the input. While that borrow lives, &mut self cannot be taken — defrag sliding your record from under the slice does not compile.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the rule, exercised',
      md: `Ownership is the chapter every Rust resource re-derives, because it is the language. [The Rust Book chapter 4](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html) is the canonical walk — ownership, moves, references, slices — and chapter 10.3 explains what elision is doing when you are ready to see the annotations you have been spared. The [Brown interactive Rust Book](https://rust-book.cs.brown.edu/ch04-01-what-is-ownership.html) renders chapter 4 with its permissions visualizer: every line annotated with the read/write/own permissions each binding holds, plus the borrow-checker edge cases as interactive quizzes — the fastest correct intuition available. For reps, [rustlings](https://rustlings.rust-lang.org/) — the \`move_semantics\` section is exactly this lesson as six small compiler arguments. And the [std docs for \`Vec\`](https://doc.rust-lang.org/std/vec/struct.Vec.html) are worth ten minutes: every method declares \`&self\` or \`&mut self\`, and you can now read the whole API as latch annotations. Next lesson: the two enums every lab API speaks.`,
    },
  ],
}

export default lesson
