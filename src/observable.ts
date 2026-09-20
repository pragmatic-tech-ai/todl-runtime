import { Signal } from './signal.js'

// The payload delivered on a property change. `owner` is the notifying source
// when one exists (an Observable raising the change); it may be absent for
// synthetic change events that no Observable owns. `property` is the changed
// property's name; `oldValue`/`newValue` bracket the change.
export interface PropertyChangedEventArgs
{
  owner?: Observable
  property: string
  oldValue: unknown
  newValue: unknown
}

// Minimal INPC analog. Change notification is keyed by property NAME and driven
// by subclass getters/setters that call `RaisePropertyChanged`. No dependency-
// property machinery — the shared base for both mural's MuralBase and TODL-
// generated entity classes, so a realized TODL node and a mural visual share one
// `Observable` identity.
//
// Notification rides the runtime's one subscribe/emit primitive: each property
// exposes a lazily-created `Signal<PropertyChangedEventArgs>` via
// `PropertyChanged(name)`. Consumers `subscribe` to that Signal and own the
// returned `Disposable` — there is no callback-registry API; the Signal IS the
// change channel.
export class Observable
{
  // One change channel per property name; created on first `PropertyChanged`
  // access. An Observable that is never observed allocates nothing beyond its
  // fields.
  private _signals?: Map<string, Signal<PropertyChangedEventArgs>>

  // The change channel for `name`, created on first access. Subscribe to it to
  // observe changes; dispose the returned subscription to stop. Repeated calls
  // for the same name return the same Signal.
  public PropertyChanged(name: string): Signal<PropertyChangedEventArgs>
  {
    const signals = (this._signals ??= new Map())
    let signal = signals.get(name)
    if (signal === undefined)
    {
      signal = new Signal<PropertyChangedEventArgs>()
      signals.set(name, signal)
    }
    return signal
  }

  // Subclass setters call this AFTER writing the backing field, only on a real
  // change. Emits (owner=this, name, old, new) to the property's channel — a
  // no-op when nothing has ever subscribed (no Signal was created).
  protected RaisePropertyChanged(name: string, oldValue: unknown, newValue: unknown): void
  {
    this._signals?.get(name)?.emit({ owner: this, property: name, oldValue, newValue })
  }
}
