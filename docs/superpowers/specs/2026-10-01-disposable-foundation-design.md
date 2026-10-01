# Disposable Foundation — IDisposable interface + Disposable / CompositeDisposable classes

**Status:** design draft 2026-10-01
**Part of:** Mural hierarchy/command roadmap, **Phase 0** of 0 → A → B. Prerequisite for Milestone A (Mural command machinery) and Milestone B (hierarchy consolidation).
**Repo:** todl-runtime

## Goal

Establish the workspace-wide teardown primitive in todl-runtime. Rename the existing `Disposable` *interface* to `IDisposable`, add a concrete `Disposable` **class** (with a `constructor(cleanup?: () => void)` and an idempotent `dispose()`), add a `CompositeDisposable` aggregate, migrate todl-runtime's own references, and publish. After this phase, "a handle that tears something down" is typed `IDisposable`, cleanup lambdas are wrapped as `new Disposable(() => …)`, and several teardowns aggregate into one `CompositeDisposable` — never an array of bare `() => void`.

## Background (current state)

`todl-runtime/src/signal.ts` today declares the teardown shape as an interface only:

```ts
export interface Disposable
{
  dispose(): void;
}
```

It is re-exported from `src/index.ts` as `export { Signal, type Disposable, type SignalLifecycle }`. Current references inside todl-runtime:

- `Signal.subscribe(handler): Disposable` returns an **inline object** `{ dispose: () => { … } }` whose cleanup removes the handler and fires the `onLastUnsubscribe` lifecycle hook on a genuine 1 → 0 transition. Double-dispose is kept silent today only because `Set.delete` returns `false` the second time.
- `src/property-bag.ts`: `interface IPropertyBag … extends Disposable` and `import { Signal, type Disposable }`.
- `src/observable.ts`: a doc comment referencing the returned `Disposable`.

The governing rule (workspace-wide): dispose mechanics are encapsulated with todl-runtime's disposable types, never bare teardown lambdas. A method/field/parameter that represents a teardown handle is typed `IDisposable`; a cleanup lambda is wrapped via `new Disposable(() => …)`; several teardowns aggregate into a composite. This phase supplies the primitive that rule names.

## Design

### IDisposable (interface)

Rename the interface; the shape is unchanged.

```ts
export interface IDisposable
{
  dispose(): void;
}
```

### Disposable (class)

A concrete, idempotent implementation that wraps an optional cleanup lambda, so returning/storing a teardown becomes ergonomic and double-dispose-safe by construction.

```ts
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
```

- `dispose()` runs the cleanup **at most once**; a no-arg `new Disposable()` and `Disposable.None` are no-op handles.
- A private field makes the class nominally typed, so an inline `{ dispose }` object is **not** assignable to `Disposable` — teardown handles that are not class instances must be typed `IDisposable`. This is intentional: `IDisposable` is the structural "handle" type, `Disposable` is the constructor.

### CompositeDisposable (class)

Aggregates several child disposables into one, so a type that tears down several things holds one composite rather than an array of lambdas.

```ts
export class CompositeDisposable implements IDisposable
{
  private readonly children: IDisposable[] = [];
  private isDisposed = false;

  add(child: IDisposable): void
  {
    if (this.isDisposed)
    {
      child.dispose();   // added after disposal → dispose immediately
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
    // reverse order: last attached, first released
    for (let i = this.children.length - 1; i >= 0; i--)
    {
      this.children[i].dispose();
    }
    this.children.length = 0;
  }
}
```

### Signal.subscribe

Return an `IDisposable`, wrapping the detach logic in `new Disposable(() => …)`. The `onLastUnsubscribe` hook and the double-dispose silence are preserved — the latter now guaranteed by the class rather than relying on `Set.delete`'s return:

```ts
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

### index.ts exports + internal migration

- `src/index.ts`: export `type IDisposable`, the `Disposable` class, and the `CompositeDisposable` class. **Remove** the old `type Disposable` export.
- `src/property-bag.ts`: `IPropertyBag extends IDisposable`; update the import and the doc comment.
- `src/observable.ts`: update the doc comment.

## Consumer impact / rollout

Removing the `type Disposable` export is breaking for any code importing it as a type. Inside todl-runtime it is handled here. Downstream:

- **Mural** adopts in **Milestone A** — bumps todl-runtime, migrates its `: Disposable` annotations to `: IDisposable`, and uses `new Disposable(…)` / `CompositeDisposable` where it returns/stores teardown.
- **TODL, Fresco, Plexus** stay on the prior todl-runtime version until their own adoption (the broad bare-lambda sweep is deferred, separate work). No forced cross-repo change in Phase 0 — each consumer breaks only when it bumps, on its own schedule.

The broad sweep of pre-existing `() => void` disposers across repos is **out of scope** here; Phase 0 ships only the primitive + todl-runtime's own use of it.

## Testing / verification

- `Disposable`: cleanup runs exactly once; double-`dispose()` is a no-op; `new Disposable()` and `Disposable.None` are no-ops.
- `CompositeDisposable`: disposes all children once, in reverse order; `add` after disposal disposes the child immediately; double-`dispose()` is a no-op.
- `Signal.subscribe`: returns an `IDisposable`; `dispose()` detaches the handler; double-dispose is silent; `onFirstSubscriber`/`onLastUnsubscribe` still fire only on genuine 0 → 1 / 1 → 0 transitions (regression guard over existing behavior).
- Full todl-runtime suite + `typecheck` green.
- Bump the package version (minor) and publish to GitHub Packages; push `main` first.

## Scope / non-goals

- No bare-`() => void` disposer sweep across repos (deferred, separate work).
- No downstream repo bumps except Mural, which adopts in Milestone A.
- No behavior change to `Signal` emission or lifecycle semantics.
