# Disposable Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename todl-runtime's `Disposable` interface to `IDisposable`, add concrete `Disposable` and `CompositeDisposable` classes, make `Signal.subscribe` return an `IDisposable` wrapping `new Disposable(...)`, migrate every internal reference, and publish a new version.

**Architecture:** `signal.ts` already holds the teardown primitive. This phase splits the name: `IDisposable` is the structural handle interface (`{ dispose(): void }`); `Disposable` becomes a concrete, idempotent class wrapping an optional cleanup lambda; `CompositeDisposable` aggregates several. All internal consumers retype `Disposable` → `IDisposable` and replace inline `{ dispose }` handles with `new Disposable(...)`.

**Tech Stack:** TypeScript (ESM, `type: module`), `tsx --test` (node:test), `tsc` for typecheck/build. Package `@pragmatic-tech-ai/todl-runtime`.

**Spec:** `todl-runtime/docs/superpowers/specs/2026-10-01-disposable-foundation-design.md`

## Global Constraints

- **Allman braces** on every block (opening brace on its own line); `else`/`catch`/`finally` on their own line. Object literals, inline arrows, and genuine one-liners (`if (x) return;`) stay inline.
- **OOP / no new module-level mutable state.** The new types are classes.
- `dispose()` stays **lowercase** — it is the established `IDisposable` contract member, the one exception to the PascalCase-public-method rule (matches every existing `dispose()` in this repo).
- **Idempotent teardown:** `dispose()` runs its cleanup at most once.
- Tests live in a `tests/` subfolder beside source — new test file goes in `src/tests/` (where `signal.test.ts` already lives).
- **Staged rollout:** removing the old `type Disposable` export is intentional and breaking; only todl-runtime is migrated here. No other repo is touched.
- Git commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- After push, do not watch CI (push-and-stop).

## Review Focus

- **Double-dispose** of `Disposable` and `CompositeDisposable` must be a silent no-op (not re-run cleanup) — pinned in Task 1.
- **Signal lifecycle after the `subscribe` refactor:** `onFirstSubscriber`/`onLastUnsubscribe` must still fire only on genuine 0→1 / 1→0 transitions, and double-dispose must not re-fire — pinned by the existing `signal.test.ts`, which Task 1 keeps green.
- **`CompositeDisposable.add` after disposal** must dispose the child immediately — pinned in Task 1.
- **Structural `isDisposable` guard** in `service-provider.ts` must still accept a `Disposable`-class instance (it checks `typeof .dispose === 'function'`) — pinned by a Task 2 assertion.
- **`Disposable.None`** must be callable with no effect — pinned in Task 1.

---

### Task 1: Primitives — `IDisposable` / `Disposable` / `CompositeDisposable` + `Signal.subscribe`

**Files:**
- Modify: `src/signal.ts`
- Test: `src/tests/disposable.test.ts` (create)

**Interfaces:**
- Consumes: nothing (foundation).
- Produces: `interface IDisposable { dispose(): void }`; `class Disposable implements IDisposable` with `constructor(cleanup?: () => void)`, `dispose(): void`, `static readonly None: IDisposable`; `class CompositeDisposable implements IDisposable` with `add(child: IDisposable): void` and `dispose(): void`; `Signal<T>.subscribe(handler): IDisposable`.

> NOTE: after this task the rest of the package does NOT typecheck yet — its files still import `type Disposable`, which is now the class. Task 2 migrates them. Task 1's gate is `npm test` only (tsx transpiles without typechecking); do not run `npm run typecheck` as a Task 1 gate.

- [ ] **Step 1: Write the failing test** — `src/tests/disposable.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { Disposable, CompositeDisposable, type IDisposable } from "../signal.js";

test("Disposable runs its cleanup exactly once", () => {
  let count = 0;
  const d = new Disposable(() => { count += 1; });
  d.dispose();
  d.dispose(); // second call is a no-op
  assert.equal(count, 1);
});

test("a no-arg Disposable and Disposable.None dispose without effect", () => {
  assert.doesNotThrow(() => new Disposable().dispose());
  assert.doesNotThrow(() => Disposable.None.dispose());
});

test("CompositeDisposable disposes all children once, in reverse order", () => {
  const order: number[] = [];
  const c = new CompositeDisposable();
  c.add(new Disposable(() => order.push(1)));
  c.add(new Disposable(() => order.push(2)));
  c.dispose();
  c.dispose(); // no-op
  assert.deepEqual(order, [2, 1]);
});

test("CompositeDisposable.add after disposal disposes the child immediately", () => {
  const c = new CompositeDisposable();
  c.dispose();
  let disposed = false;
  const late: IDisposable = new Disposable(() => { disposed = true; });
  c.add(late);
  assert.equal(disposed, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --conditions=development --test src/tests/disposable.test.ts`
Expected: FAIL — `Disposable`/`CompositeDisposable` are not exported as classes (the current `Disposable` is an interface).

- [ ] **Step 3: Rename the interface and add the classes in `src/signal.ts`**

Replace the current interface block (lines 8–12):

```ts
/** A cancellable subscription. Disposing it detaches the handler. */
export interface Disposable
{
  dispose(): void;
}
```

with:

```ts
/** A cancellable teardown handle. Disposing it releases whatever it holds. */
export interface IDisposable
{
  dispose(): void;
}

/**
 * A concrete {@link IDisposable} that wraps an optional cleanup lambda. `dispose()`
 * runs the cleanup at most once; a no-arg instance and {@link Disposable.None} are
 * no-ops. Prefer this over returning a bare `{ dispose }` object or a `() => void`.
 */
export class Disposable implements IDisposable
{
  private cleanup?: () => void;
  private isDisposed = false;

  constructor(cleanup?: () => void)
  {
    this.cleanup = cleanup;
  }

  dispose(): void
  {
    if (this.isDisposed)
    {
      return;
    }
    this.isDisposed = true;
    const run = this.cleanup;
    this.cleanup = undefined;
    run?.();
  }

  static readonly None: IDisposable = new Disposable();
}

/**
 * Aggregates several {@link IDisposable}s into one. `dispose()` releases every child
 * once, in reverse order; a child added after disposal is disposed immediately.
 */
export class CompositeDisposable implements IDisposable
{
  private readonly children: IDisposable[] = [];
  private isDisposed = false;

  add(child: IDisposable): void
  {
    if (this.isDisposed)
    {
      child.dispose();
      return;
    }
    this.children.push(child);
  }

  dispose(): void
  {
    if (this.isDisposed)
    {
      return;
    }
    this.isDisposed = true;
    for (let i = this.children.length - 1; i >= 0; i--)
    {
      this.children[i].dispose();
    }
    this.children.length = 0;
  }
}
```

- [ ] **Step 4: Update `Signal.subscribe` to return `IDisposable` wrapping `new Disposable(...)`**

In `src/signal.ts`, change the JSDoc `{@link Disposable}` on the `subscribe` doc comment to `{@link IDisposable}`, and replace the method body's return. The method becomes:

```ts
  /** Attach `handler`; the returned {@link IDisposable} detaches it. */
  subscribe(handler: (value: T) => void): IDisposable
  {
    const wasEmpty = this.handlers.size === 0;
    this.handlers.add(handler);
    if (wasEmpty && this.handlers.size > 0) this.onFirstSubscriber?.();
    return new Disposable(() =>
    {
      const removed = this.handlers.delete(handler);
      if (removed && this.handlers.size === 0) this.onLastUnsubscribe?.();
    });
  }
```

- [ ] **Step 5: Run the new test + the existing signal suite**

Run: `npx tsx --conditions=development --test src/tests/disposable.test.ts src/tests/signal.test.ts`
Expected: PASS — the four new disposable tests pass, and all existing `signal.test.ts` tests (lifecycle, double-dispose, mid-emit unsubscribe) stay green, proving the `subscribe` wrap preserves behavior.

- [ ] **Step 6: Commit**

```bash
git add src/signal.ts src/tests/disposable.test.ts
git commit -m "feat(todl-runtime): IDisposable interface + Disposable/CompositeDisposable classes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migrate internal references + exports to `IDisposable`

**Files:**
- Modify: `src/index.ts`, `src/property-bag.ts`, `src/property-bags/property-bag-store.ts`, `src/property-bags/durable-application-store.ts`, `src/property-bags/transient-session-store.ts`, `src/services/service-provider.ts`, `src/observable.ts`
- Test: `src/services/tests/service-provider.test.ts` (add one assertion)

**Interfaces:**
- Consumes: `IDisposable`, `Disposable` from Task 1 (`src/signal.js`).
- Produces: a package that exports `Disposable`, `CompositeDisposable` (values) and `IDisposable`, `SignalLifecycle` (types); every internal `Disposable` type annotation is now `IDisposable`; returned teardown handles use `new Disposable(...)`.

- [ ] **Step 1: Update the barrel export** — `src/index.ts`

Replace line 2:

```ts
export { Signal, type Disposable, type SignalLifecycle } from './signal.js';
```

with:

```ts
export { Signal, Disposable, CompositeDisposable, type IDisposable, type SignalLifecycle } from './signal.js';
```

- [ ] **Step 2: Migrate `src/property-bag.ts`**

- Change the import `import { Signal, type Disposable } from './signal.js';` → `import { Signal, type IDisposable } from './signal.js';`
- Change `export interface IPropertyBag extends Iterable<[string, IReadOnlyPropertyAccessor]>, Disposable` → `... , IDisposable`.
- In the two doc-comment lines that mention the returned `Disposable` (lines 7–8), change the word `Disposable` → `IDisposable`.

- [ ] **Step 3: Migrate `src/property-bags/property-bag-store.ts`**

- Change `import { type Disposable } from '../signal.js';` → `import { type IDisposable } from '../signal.js';`
- Change the `Register(key: string, bag: IPropertyBag): Disposable;` signature → `: IDisposable;`
- In the doc comment, change `Disposable` → `IDisposable`.

- [ ] **Step 4: Migrate `src/property-bags/transient-session-store.ts`**

- Change `import { type Disposable } from '../signal.js';` → `import { Disposable } from '../signal.js';` (value import now — we construct one).
- Change `public Register(key: string, bag: IPropertyBag): Disposable` → `: IDisposable` (add `type IDisposable` to the same import: `import { Disposable, type IDisposable } from '../signal.js';`).
- Replace the returned inline handle `return { dispose: () => { this.tracked.delete(key); } };` with:

```ts
        return new Disposable(() => { this.tracked.delete(key); });
```

- [ ] **Step 5: Migrate `src/property-bags/durable-application-store.ts`**

- Change `import { type Disposable } from '../signal.js';` → `import { Disposable, type IDisposable } from '../signal.js';`
- Change `readonly subs: readonly Disposable[];` → `readonly subs: readonly IDisposable[];`
- Change `public Register(key: string, bag: IPropertyBag): Disposable` → `: IDisposable`.
- Change `const subs: Disposable[] = [];` → `const subs: IDisposable[] = [];`
- Replace the returned inline handle `return { dispose: () => this.unregister(key) };` with:

```ts
        return new Disposable(() => this.unregister(key));
```

- [ ] **Step 6: Migrate `src/services/service-provider.ts`**

- Change `import type { Disposable } from '../signal.js';` → `import type { IDisposable } from '../signal.js';`
- Change `export interface IServiceContainer extends Disposable` → `... extends IDisposable`.
- Change the guard `function isDisposable(v: unknown): v is Disposable` → `v is IDisposable`, and the body cast `(v as Partial<Disposable> | null)` → `(v as Partial<IDisposable> | null)`.
- Update the two comments that say `Disposable` (lines ~79 and ~263) to `IDisposable`.

- [ ] **Step 7: Migrate the comment in `src/observable.ts`**

Change the word `Disposable` in the line-24 comment to `IDisposable`.

- [ ] **Step 8: Add the structural-guard regression assertion** — `src/services/tests/service-provider.test.ts`

Add this test (import `Disposable` from `../../signal.js` at the top of the file if not already imported):

```ts
test("a Disposable-class instance is disposed when its owning scope disposes", () => {
  // isDisposable() is structural (checks a dispose() method); a Disposable instance must match.
  const d = new Disposable(() => {});
  assert.equal(typeof d.dispose, "function");
});
```

- [ ] **Step 9: Run the full suite + typecheck**

Run: `npm test` then `npm run typecheck`
Expected: PASS — all suites green and `tsc --noEmit` reports **0 errors** (the whole package now consistently uses `IDisposable`).

- [ ] **Step 10: Verify no stale references remain**

Run: `grep -rn "type Disposable\|: Disposable\|Partial<Disposable>\|extends .*\bDisposable\b" src`
Expected: no matches (every type usage is now `IDisposable`; `Disposable`/`CompositeDisposable` appear only as class construction/exports).

- [ ] **Step 11: Commit**

```bash
git add src/index.ts src/property-bag.ts src/property-bags/ src/services/service-provider.ts src/services/tests/service-provider.test.ts src/observable.ts
git commit -m "refactor(todl-runtime): migrate internal references to IDisposable; return Disposable handles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Version bump, build, publish

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: a green package from Tasks 1–2.
- Produces: `@pragmatic-tech-ai/todl-runtime@0.6.0` published to GitHub Packages.

> NOTE: `npm publish` and `git push` are outward-facing and are the milestone boundary. The executor completes Steps 1–3 and then **stops**; the publish + push (Steps 4–5) are performed at the human-gated boundary, not autonomously.

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.5.8"` → `"version": "0.6.0"` (minor; the removal of the `type Disposable` export is a clean break).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `tsc -p tsconfig.build.json` succeeds; `dist/` contains `index.js`/`index.d.ts` exporting `Disposable`, `CompositeDisposable`, and the `IDisposable` type.

- [ ] **Step 3: Final green gate + commit the bump**

Run: `npm test` and `npm run typecheck`
Expected: PASS / 0 errors.

```bash
git add package.json
git commit -m "release(todl-runtime): 0.6.0 — IDisposable foundation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Publish (human-gated)**

Run: `git push` (push `main` first), then `npm publish`.
Expected: `@pragmatic-tech-ai/todl-runtime@0.6.0` on GitHub Packages. Do not watch CI after push.

- [ ] **Step 5: Record the published version**

Note `todl-runtime@0.6.0` for Milestone A, which bumps its todl-runtime dependency to `^0.6.0` and adopts `IDisposable`.
