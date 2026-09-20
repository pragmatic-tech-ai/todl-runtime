import { Signal, type Disposable } from './signal.js';
import { type PropertyChangedEventArgs } from './observable.js';

/**
 * A named collection of properties. Iterating a bag yields `[name, accessor]`
 * entries for every property it holds; `Observe` hands back a property's change
 * `Signal` (the caller subscribes and disposes the returned `Disposable`).
 * `Disposable`: `dispose()` releases any listeners the bag wired on external sources.
 *
 * This is the DP-free base abstraction (it depends only on todl-runtime's
 * Signal / PropertyChangedEventArgs). The reflective bag over mural dependency
 * properties (`DpPropertyBag`) lives in mural, which owns the DP system.
 */
export interface IPropertyBag extends Iterable<[string, IReadOnlyPropertyAccessor]>, Disposable {
    GetValue(name: string): unknown;
    SetValue(name: string, value: unknown): void;
    IsReadOnly(name: string): boolean;
    Observe(name: string): Signal<PropertyChangedEventArgs>;
}

/**
 * The read side of a property accessor: its identity, current value, and an
 * optional change channel. `changed`, when present, is the accessor's own
 * notification source — the bag subscribes to it instead of owning notification.
 * A read-only accessor over a derived value may expose it too, so a value that
 * changes without a setter still notifies.
 */
export interface IReadOnlyPropertyAccessor {
    /** The property's stable name (the key it is registered under). */
    id(): string;
    /** A human-readable label for the property, shown to the user. */
    displayName(): string;
    get(): unknown;
    changed?: Signal<PropertyChangedEventArgs>;
}

/**
 * A writable accessor. `set` writes the value; when the accessor owns a
 * `changed` channel, the bag skips its own emit on `SetValue` so a value change
 * fires exactly once.
 */
export interface IPropertyAccessor extends IReadOnlyPropertyAccessor {
    set(value: unknown): void;
}

/** An accessor is either read-only (`get`) or writable (`get` + `set` [+ `changed`]). */
export type PropertyAccessor = IReadOnlyPropertyAccessor | IPropertyAccessor;

export class MapPropertyBag implements IPropertyBag {
    private readonly _accessors: ReadonlyMap<string, PropertyAccessor>;
    // Bag-owned change channels, one per name, for accessors that do NOT carry
    // their own `changed` Signal. Created lazily on first Observe.
    private readonly _signals: Map<string, Signal<PropertyChangedEventArgs>> = new Map();

    constructor(accessors: ReadonlyMap<string, PropertyAccessor>) {
        this._accessors = accessors;
    }

    public *[Symbol.iterator](): Iterator<[string, IReadOnlyPropertyAccessor]> {
        yield* this._accessors;
    }

    public GetValue(name: string): unknown {
        return this.entry(name).get();
    }

    public SetValue(name: string, value: unknown): void {
        const accessor = this.entry(name);
        if (!MapPropertyBag.isWritable(accessor)) {
            return;
        }
        const oldValue = accessor.get();
        accessor.set(value);
        // Fire the bag-owned channel only when the accessor does NOT own a change
        // channel — otherwise notification arrives through accessor.changed. No
        // owner: a MapPropertyBag has no Observable identity to attribute.
        if (accessor.changed === undefined) {
            this._signals.get(name)?.emit({ property: name, oldValue, newValue: accessor.get() });
        }
    }

    public IsReadOnly(name: string): boolean {
        return !MapPropertyBag.isWritable(this.entry(name));
    }

    // Drop the bag-owned change channels. Accessor-owned `changed` Signals are
    // not ours to dispose, so they are left untouched.
    public dispose(): void {
        this._signals.clear();
    }

    public Observe(name: string): Signal<PropertyChangedEventArgs> {
        const accessor = this.entry(name);
        // Any accessor — read-only or writable — may own its change channel.
        if (accessor.changed !== undefined) {
            return accessor.changed;
        }
        return this.signalFor(name);
    }

    private signalFor(name: string): Signal<PropertyChangedEventArgs> {
        let signal = this._signals.get(name);
        if (signal === undefined) {
            signal = new Signal<PropertyChangedEventArgs>();
            this._signals.set(name, signal);
        }
        return signal;
    }

    private entry(name: string): PropertyAccessor {
        const accessor = this._accessors.get(name);
        if (accessor === undefined) {
            throw new Error(`MapPropertyBag: unknown property '${name}'`);
        }
        return accessor;
    }

    // Narrow to the writable shape: a settable accessor exposes a `set` method.
    private static isWritable(accessor: PropertyAccessor): accessor is IPropertyAccessor {
        return typeof (accessor as IPropertyAccessor).set === 'function';
    }
}
