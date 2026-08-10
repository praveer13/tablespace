import type { Lesson } from '../types'

const lesson: Lesson = {
  id: 'tr.l1',
  slug: 'the-rust-youll-actually-write',
  trackId: 'tr',
  index: 1,
  title: 'The Rust You’ll Actually Write',
  minutes: 14,
  hook: 'Structs, enums, impl blocks, and &mut self — the exact Rust the forge labs grade, taught through a tiny KV store. No async, no lifetimes, no fluff.',
  exercise: 'quiz',
  blocks: [
    {
      type: 'prose',
      md: `You write backend services for a living — Java, maybe Kotlin, maybe Python. You can read a heap dump and you have opinions about GC pauses. The forge labs are Rust, and Rust has a reputation: the borrow checker fight, the lifetime annotations, the month of pain before anything compiles. Here is the counter-offer, and it is honest: **the labs need a small, deliberate subset of Rust, and this track teaches exactly that subset, in the order the labs consume it.** Four lessons. The compiler does the tutoring — that is the rustlings method: small programs, precise error messages, one concept at a time, zero framework tours.

By the end of Tᴿ you will open lab 01's \`page.rs\` and read every character of it without flinching. That is the whole promise. Here is the file's spine right now, unfamiliar on purpose:`,
    },
    {
      type: 'code',
      filename: 'labs/slotted-pages/src/page.rs — the spine',
      lang: 'rust',
      code: `pub struct Page {
    _priv: (),   // you replace this with one [u8; 8192] buffer
}

impl Page {
    pub fn insert(&mut self, record: &[u8]) -> Option<u16> { todo!() }
    pub fn read(&self, slot: u16) -> Option<&[u8]>         { todo!() }
    pub fn delete(&mut self, slot: u16) -> bool            { todo!() }
    pub fn defrag(&mut self)                               { todo!() }
    pub fn free_space(&self) -> usize                      { todo!() }
    pub fn slot_range(&self, slot: u16) -> Option<(usize, usize)> { todo!() }
}`,
      chips: ['the real template', 'std only'],
    },
    {
      type: 'prose',
      md: `## A struct is a record with the layout pinned

A Rust \`struct\` is a Java class that is *only fields*, or a Python dataclass — with two differences that matter in a database course. First: **no object header, no pointer indirection.** Fields are laid out inline and contiguous; a \`Vec<Page>\` is one flat array of 8192-byte structs, not an array of references to heap objects scattered across the old generation. Second: fields are private unless marked \`pub\`, so the struct's invariants hold by construction — nobody writes your header bytes except your methods.

That is why lab 01 can demand that \`Page\` be *literally* one \`[u8; 8192]\` buffer, and the harness can check \`size_of::<Page>() == 8192\`: the struct is the page, not a pointer to it. No side tables, no heap shadows.`,
    },
    {
      type: 'code',
      filename: 'kv.rs — the whole subset in one tiny store',
      lang: 'rust',
      code: `use std::collections::BTreeMap;

pub struct KvStore {
    map: BTreeMap<String, String>,
}

impl KvStore {
    pub fn new() -> Self {
        KvStore { map: BTreeMap::new() }
    }

    pub fn get(&self, key: &str) -> Option<String> {
        self.map.get(key).cloned()
    }

    pub fn put(&mut self, key: &str, value: &str) {
        self.map.insert(key.to_string(), value.to_string());
    }

    pub fn delete(&mut self, key: &str) -> bool {
        self.map.remove(key).is_some()
    }
}`,
      chips: ['BTreeMap', 'Option', '&mut self'],
    },
    {
      type: 'prose',
      md: `## impl: methods are functions with a receiver

Everything in that listing is the language subset, and it reads straighter than it looks:

- **\`new() -> Self\`** has no \`self\` parameter — it is an *associated function*, Java's static factory. \`Self\` just means "the type this \`impl\` block belongs to."
- **\`&self\`** borrows the store read-only: the method can look, not touch. Close to a C++ \`const\` method — except the compiler actually enforces it, through every function you call.
- **\`&mut self\`** borrows the store *exclusively*: for the duration of the call, no other reference to the store exists anywhere in the program. Not a synchronized block, not a runtime lock — the compiler rejects programs where a writer could overlap another accessor. That rule is all of lesson 2; for now, read \`&mut self\` as "this op dirties the page" and \`&self\` as "this op only reads."
- **\`Option<String>\`** instead of null: \`get\` returns \`Some(value)\` or \`None\`, and the caller cannot forget the None case — it does not compile until they handle it. Lesson 3 is entirely about this.

One more deliberate choice in the listing: \`BTreeMap\`, not \`HashMap\`. std's hash tables draw OS randomness that does not exist on \`wasm32-unknown-unknown\`, and they panic there. The labs compile to wasm; ordered maps are deterministic everywhere. The mvcc template says so verbatim.`,
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'The honest scope promise',
      md: `**In:** structs, enums, impl blocks, Option and Result, match, the \`?\` operator, Vec and \`&[u8]\` slices, BTreeMap/BTreeSet, \`#[derive(...)]\`, for loops and the everyday iterator methods.

**Out:** async and .await, threads and channels, \`unsafe\`, explicit lifetime annotations (the labs borrow only in patterns the compiler elides), macros beyond derive, trait objects, generics you write yourself.

If a lab needed one of the out-list, the template would ship it pre-written. It never does.`,
    },
    {
      type: 'prose',
      md: `## Enums are tagged unions, not constants

Java enums are named constants with manners. Rust enums are *one value, several shapes* — each variant carries its own fields, and \`match\` (lesson 3) forces you to handle every one. You have already met the two most important enums in the language: \`Option<T>\` is literally \`Some(T) | None\`, and \`Result<T, E>\` is \`Ok(T) | Err(E)\` — ordinary library definitions, not syntax.

The pattern shows up anywhere a value walks a state machine. A slot on lab 01's page, modeled the Rust way:`,
    },
    {
      type: 'code',
      filename: 'one value, several shapes',
      lang: 'rust',
      code: `enum SlotState {
    Free,
    Live { offset: u16, len: u16 },
    Tombstone { len: u16 },   // bytes accounted, awaiting defrag
}

fn reusable_bytes(state: &SlotState) -> u16 {
    match state {
        SlotState::Free => 0,
        SlotState::Live { .. } => 0,
        SlotState::Tombstone { len } => *len,
    }
}`,
      chips: ['tagged union', 'match is exhaustive'],
    },
    {
      type: 'statline',
      stats: [
        { value: '0', label: 'runtime, GC, VM', hint: 'Rust compiles to machine code — here, wasm. Nothing pauses to collect anything; drops run exactly at scope end.' },
        { value: '1', label: 'file you edit per lab', hint: 'Each crate has one TODO(you) file; the grading harness ships complete around it.' },
        { value: '6', label: 'forge labs', hint: 'slotted page → B+tree → WAL → MVCC → volcano → HNSW. The arc this ramp feeds.' },
        { value: '4', label: 'lessons to lab 01', hint: 'This track, end to end. Lesson 4 drops you at slotted-pages with the toolchain warm.' },
      ],
    },
    {
      type: 'quiz',
      questions: [
        {
          q: 'In `pub fn insert(&mut self, record: &[u8]) -> Option<u16>`, what does `&mut self` promise?',
          options: [
            'The method takes ownership of the Page and frees it when it returns',
            'The method may mutate the Page, and for the call’s duration no other reference to it exists anywhere — enforced at compile time, with zero runtime cost',
            'The method acquires a write lock on the Page, like a synchronized method in Java',
            'The method receives a mutable copy; the caller’s Page is unchanged',
          ],
          correct: [1],
          explanation:
            '&mut is an exclusive borrow: mutation allowed, aliasing forbidden, all checked by the compiler. There is no lock, no copy, and no ownership transfer — the caller keeps the Page.',
        },
        {
          q: 'A Vec<Page> of 64 pages occupies…',
          options: [
            '64 pointers to 64 heap objects, each with an object header, like a Java array of objects',
            '64 × 8192 contiguous bytes of struct data, plus the Vec’s own bookkeeping — no headers, no pointer chase',
            '64 entries in a generational heap, moved by the GC on compaction',
            'Whatever the layout optimizer picks at runtime',
          ],
          correct: [1],
          explanation:
            'Rust structs are laid out inline and contiguous. An array of pages is a flat byte array — which is exactly why lab 01 can check size_of::<Page>() == 8192 and mean it.',
        },
        {
          q: 'Which of these will you NOT need to build all six forge labs?',
          options: [
            'Option and Result',
            'match and the ? operator',
            'async fn and .await',
            '#[derive(...)] attributes',
          ],
          correct: [2],
          explanation:
            'The labs are synchronous, single-threaded, safe Rust. No async, no threads, no unsafe, no handwritten lifetimes or macros — the templates pin simple signatures on purpose.',
        },
      ],
    },
    {
      type: 'deepdive',
      title: 'Going deeper: the language beyond the subset',
      md: `This track is a ramp, not a reference. When you want the full language: [The Rust Book](https://doc.rust-lang.org/book/) — chapters 4 (ownership), 5 (structs), and 6 (enums and match) cover this lesson's ground in depth, and chapters 1–3 fill the syntax gaps. [rustlings](https://rustlings.rust-lang.org/) is the pedagogy this track steals: dozens of tiny broken programs, and the compiler's error messages are the tutor — do the \`structs\` and \`enums\` sections if you want reps before lab 01. The [Brown interactive Rust Book](https://rust-book.cs.brown.edu/) is the same text with an ownership visualizer that shows, per line, which permissions each binding holds — the best borrow-checker intuition pump in print. And the [std docs](https://doc.rust-lang.org/std/) — start with \`Option\`, \`Result\`, and \`BTreeMap\` — are unusually readable; the labs use nothing outside them. Next lesson: the one rule Rust is famous for, and why you already know it from the buffer pool.`,
    },
  ],
}

export default lesson
