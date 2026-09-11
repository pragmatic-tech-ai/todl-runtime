/**
 * A minimal subscribe/emit primitive. It is the substrate the graph change bus
 * and the reactive facades (`INotifyPropertyChanged`, `INotifyCollectionChanged`)
 * are built on. It lives in the runtime base so both TODL and Mural can share it
 * without either depending on the other's machinery.
 */

/** A cancellable subscription. Disposing it detaches the handler. */
export interface Disposable {
  dispose(): void;
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
export interface SignalLifecycle {
  onFirstSubscriber?: () => void;
  onLastUnsubscribe?: () => void;
}

/** A synchronous, multi-subscriber event carrier of payload `T`. */
export class Signal<T> {
  private readonly handlers = new Set<(value: T) => void>();
  private readonly onFirstSubscriber?: () => void;
  private readonly onLastUnsubscribe?: () => void;

  /**
   * @param lifecycle optional demand hooks (see {@link SignalLifecycle}). Omit for
   *   a plain event carrier — existing callers are unaffected.
   */
  constructor(lifecycle?: SignalLifecycle) {
    this.onFirstSubscriber = lifecycle?.onFirstSubscriber;
    this.onLastUnsubscribe = lifecycle?.onLastUnsubscribe;
  }

  /** Attach `handler`; the returned {@link Disposable} detaches it. */
  subscribe(handler: (value: T) => void): Disposable {
    const wasEmpty = this.handlers.size === 0;
    this.handlers.add(handler);
    // Fire the demand hook only on a genuine 0 → 1 transition (re-adding an
    // already-present handler is a no-op the Set dedupes, so `wasEmpty` guards it).
    if (wasEmpty && this.handlers.size > 0) this.onFirstSubscriber?.();
    return {
      dispose: () => {
        // Only a real removal that empties the set trips the 1 → 0 hook; a
        // double-dispose deletes nothing and must stay silent.
        const removed = this.handlers.delete(handler);
        if (removed && this.handlers.size === 0) this.onLastUnsubscribe?.();
      },
    };
  }

  /**
   * Deliver `value` to every current subscriber. Iterates a snapshot, so a
   * handler may subscribe or dispose during delivery without disrupting the
   * handlers already scheduled for this emission.
   */
  emit(value: T): void {
    for (const handler of [...this.handlers]) {
      handler(value);
    }
  }

  /** True while at least one subscriber is attached. */
  get hasSubscribers(): boolean {
    return this.handlers.size > 0;
  }

  /** Number of currently-attached subscribers. Useful for leak assertions. */
  get subscriberCount(): number {
    return this.handlers.size;
  }
}
