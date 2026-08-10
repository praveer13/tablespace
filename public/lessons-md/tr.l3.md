# TR.L3 — Option, Result, and Match

_Track Tᴿ: Rust Zero · ~13 min · tablespace_

> Option, Result, and match: the exact shape of every forge lab API, the ? operator for early returns, and why todo!() is a feature, not a crutch.
Java gives you two disasters for the price of one: `null`, which means "absent" and blows up anywhere, and exceptions, which mean "failed" and fly anywhere. Rust deletes both and replaces them with two ordinary enums you could have written yourself: **`Option<T>` = `Some(T) | None`** for absence, **`Result<T, E>` = `Ok(T) | Err(E)`** for failure. They are values, not control flow. They sit in signatures where the type checker can see them, and **the caller cannot touch the payload without naming the empty case** — not "shouldn't": *cannot*, it does not compile.

Every forge lab API speaks exactly these two type constructors. Learn them here and every template signature in the course reads as plain English.

---

## Option: null, made honest

Lab 01's template, quoting `page.rs` verbatim:

```
pub fn insert(&mut self, record: &[u8]) -> Option<u16>
pub fn read(&self, slot: u16) -> Option<&[u8]>
pub fn slot_range(&self, slot: u16) -> Option<(usize, usize)>
```

Three different questions, one answer shape. `insert` returns `Some(slot)` on success, `None` when the page cannot fund the record — a full page is a *normal outcome*, part of the contract, and the harness grades that you refuse cleanly: no panic, and a refused insert changes nothing. `read` returns `None` for a dead or invalid slot. `slot_range` returns `None` the same way. In Java each of these would be a null waiting for a caller to forget it. Here, forgetting is a compile error, because the only way past the type is to handle both variants — and the tool for that is `match`.

---

```rust
match page.read(slot) {
    Some(bytes) => sink.extend_from_slice(bytes),
    None => misses += 1,          // dead or invalid slot — a normal Tuesday
}

// Same idea, one-liner form, when a default will do:
let bytes = page.read(slot).unwrap_or(&[]);

// And the bug you cannot write:
// let b = page.read(slot)[0];   // compile error: can't index an Option
```

---

`match` is a `switch` that has graduated: it is an *expression* (it evaluates to a value), the arms destructure the payload (`Some(bytes)` names the inside), and it is **exhaustive** — leave out `None` and the compiler lists the variant you forgot. Add a sixth slot state next month and every match that must know about it lights up red. That is the exhaustiveness Postgres can only simulate with `default: elog(ERROR)` and a prayer.

## Result: the error is a value

Same trick, one more payload. Failure is data, and the error type is in the signature where the harness can grade it. Lab 04, `mvcc.rs`, verbatim:

```
pub struct WwConflict {
    pub key: String,   // the contended key
    pub holder: TxnId, // the in-flight txn whose version blocks the write
}

pub fn write(&mut self, txn: TxnId, key: &str, value: &str) -> Result<(), WwConflict>
```

First-writer-wins, expressed as a return value: `Ok(())` — the unit type, "succeeded, nothing to say" — or `Err(WwConflict { key, holder })` naming exactly who blocks you. Not thrown: *returned*. The rejected write changes nothing, the loser keeps working and may commit its other keys — and none of that is documented convention, it is the type.

---

```rust
fn apply_batch(mvcc: &mut Mvcc, txn: TxnId, writes: &[(&str, &str)])
    -> Result<(), WwConflict>
{
    for (key, value) in writes {
        mvcc.write(txn, key, value)?;   // Err? return it from HERE, now
    }
    Ok(())
}

// Desugars to exactly:
//     match mvcc.write(txn, key, value) {
//         Ok(()) => (),
//         Err(conflict) => return Err(conflict),
//     }
```

---

> **[warning]** `.unwrap()` and `.expect("...")` rip the payload out and **panic** on `None`/`Err`. In the wasm harness a panic is a trap: the check dies mid-run and the lab page scores it as a crash, not a clean refusal. The contracts are explicit — a full page is `None`, a conflict is `Err`, *never a panic* — so every `unwrap` on an op result is a contract violation you typed yourself. Reserve it for test setup and invariants you have already proven.

---

## todo!() is a feature

Every method in every template ships as `todo!("...what this op must do...")`. Two properties make that a pedagogical device, not laziness. It **compiles**: the crate builds, the harness loads, the checks run. And it **panics only when called** — with a "not implemented" message naming the op. So you implement `insert` first, run `cargo test`, and watch `insert_read` flip green while `defrag` is still a trap; the lab page renders a trapped op as *not implemented yet*, cleanly separated from "implemented and wrong." Progress is graded incrementally, so progress can be *made* incrementally. When the last `todo!` is gone, the lab is done — the traps are the checklist.

---

- **2** — enums to learn (Option for absence, Result for failure. Both are ordinary library types — no syntax, no runtime.)
- **1** — character for early return (expr? unwraps the Ok/Some or returns the Err/None from the current function.)
- **0** — nulls in the language (Tony Hoare’s billion-dollar mistake, deleted. Absence is a type the compiler tracks.)
- **0** — exceptions (No try/catch control flow. Errors are values; panics are for bugs, and the harness scores them as crashes.)

---

**Q1. `page.insert(record)` returns `Option<u16>` and your caller ignores the return value entirely. What happens?**
   A. Nothing — the slot id is informational; the insert already happened
   B. A warning at best — but any code that touches the Option as if it were a u16 fails to compile; the None case must be named to be ignored deliberately
   C. The compiler inserts a null check and throws on None
   D. Undefined behavior if the page was full
   Answer: B — Option<u16> is not a u16. Using it as one — comparing, storing, indexing — is a type error. You must match (or ?, or unwrap_or…) and thereby acknowledge that a full page is a real, graded outcome.

**Q2. Which of these are real signatures from the forge templates? Select all that apply.**
   A. pub fn insert(&mut self, record: &[u8]) -> Option<u16>
   B. pub fn write(&mut self, txn: TxnId, key: &str, value: &str) -> Result<(), WwConflict>
   C. pub fn read(&self, slot: u16) -> &[u8]
   D. pub fn defrag(&mut self) -> Result<(), DefragError>
   Answer: A, B — A and B are verbatim from page.rs and mvcc.rs. C drops the Option — a dead slot must be representable, so read returns Option<&[u8]>. D invents a failure mode — defrag returns nothing; it simply works.

**Q3. Inside a function returning `Result<(), WwConflict>`, the call `mvcc.write(txn, k, v)?` encounters a conflict. What does `?` do?**
   A. Retries the write after the holder commits
   B. Converts the error to a panic that the harness catches
   C. Returns Err(conflict) from the current function immediately, payload unchanged — the caller decides what a conflict means
   D. Logs the conflict and continues with the next key
   Answer: C — ? is match + return: Ok unwraps, Err propagates verbatim. No retry, no panic, no swallowing — the conflict value, with its key and holder, reaches whoever owns the policy.

---

[The Rust Book chapter 6](https://doc.rust-lang.org/book/ch06-00-enums.html) is enums and match end to end — including the exhaustive-ness rules this lesson leans on — and [chapter 9](https://doc.rust-lang.org/book/ch09-00-error-handling.html) is the panic-vs-Result philosophy: when a panic is correct (bugs, broken invariants) and when it is a contract violation (everything the harness grades). The [Brown interactive Rust Book](https://rust-book.cs.brown.edu/) covers both chapters with its quizzes if you want the same material with feedback. For reps, [rustlings](https://rustlings.rust-lang.org/) `enums`, `error_handling`, and `options` are this lesson as compiler arguments. Then read the [std docs for Option](https://doc.rust-lang.org/std/option/enum.Option.html) and [Result](https://doc.rust-lang.org/std/result/enum.Result.html) — the combinator table (`map`, `and_then`, `unwrap_or`, `ok_or`) is the difference between fluent Rust and match-noise, and every one of them is fair game in the labs. Last lesson: the forge loop itself, rustup to dropped wasm.
