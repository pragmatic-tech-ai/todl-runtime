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

/** A synchronous, multi-subscriber event carrier of payload `T`. */
export class Signal<T> {
  private readonly handlers = new Set<(value: T) => void>();

  /** Attach `handler`; the returned {@link Disposable} detaches it. */
  subscribe(handler: (value: T) => void): Disposable {
    this.handlers.add(handler);
    return {
      dispose: () => {
        this.handlers.delete(handler);
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
}
