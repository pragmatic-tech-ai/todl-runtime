/**
 * A minimal subscribe/emit primitive. It is the substrate the graph change bus
 * and the reactive facades (`INotifyPropertyChanged`, `INotifyCollectionChanged`)
 * are built on. It lives in the runtime base so both TODL and Mural can share it
 * without either depending on the other's machinery.
 */

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

/**
 * Optional demand hooks fired on subscriber-count transitions. `onFirstSubscriber`
 * runs when the count goes 0 → 1; `onLastUnsubscribe` when it returns 1 → 0. They
 * let an owner hold an upstream subscription only while this signal is actually
 * observed — subscribe on demand, release when the last listener leaves. (Mural's
 * setting-backed dependency properties use this to bound a setting subscription to
 * the lifetime of the property's listeners; see
 * `Mural/docs/setting-backed-dp-subscriptions.md`.)
 */
export interface SignalLifecycle
{
  onFirstSubscriber?: () => void;
  onLastUnsubscribe?: () => void;
}

/** A synchronous, multi-subscriber event carrier of payload `T`. */
export class Signal<T>
{
  private readonly handlers = new Set<(value: T) => void>();
  private readonly onFirstSubscriber?: () => void;
  private readonly onLastUnsubscribe?: () => void;

  /**
   * @param lifecycle optional demand hooks (see {@link SignalLifecycle}). Omit for
   *   a plain event carrier — existing callers are unaffected.
   */
  constructor(lifecycle?: SignalLifecycle)
  {
    this.onFirstSubscriber = lifecycle?.onFirstSubscriber;
    this.onLastUnsubscribe = lifecycle?.onLastUnsubscribe;
  }

  /** Attach `handler`; the returned {@link IDisposable} detaches it. */
  subscribe(handler: (value: T) => void): IDisposable
  {
    const wasEmpty = this.handlers.size === 0;
    this.handlers.add(handler);
    // Fire the demand hook only on a genuine 0 → 1 transition (re-adding an
    // already-present handler is a no-op the Set dedupes, so `wasEmpty` guards it).
    if (wasEmpty && this.handlers.size > 0) this.onFirstSubscriber?.();
    return new Disposable(() => {
      // Only a real removal that empties the set trips the 1 → 0 hook; a
      // double-dispose deletes nothing and must stay silent.
      const removed = this.handlers.delete(handler);
      if (removed && this.handlers.size === 0) this.onLastUnsubscribe?.();
    });
  }

  /**
   * Deliver `value` to every current subscriber. Iterates a snapshot, so a
   * handler may subscribe or dispose during delivery without disrupting the
   * handlers already scheduled for this emission.
   */
  emit(value: T): void
  {
    for (const handler of [...this.handlers])
    {
      handler(value);
    }
  }

  /** True while at least one subscriber is attached. */
  get hasSubscribers(): boolean
  {
    return this.handlers.size > 0;
  }

  /** Number of currently-attached subscribers. Useful for leak assertions. */
  get subscriberCount(): number
  {
    return this.handlers.size;
  }
}
