import { type Disposable } from '../signal.js';
import { type IPropertyBag } from '../property-bag.js';

// The persistence surface for property bags: register a bag under a key, restore the
// persisted values into registered bags at startup, and flush the merged document.
// Two implementations differ only in durability — DurableApplicationStore writes to
// disk and restores across sessions; TransientSessionStore holds values in memory for
// the run only — so a consumer depends on this interface and the composition root picks
// the tier.
export interface IPropertyBagStore
{
    // Track a bag under `key`; if the store has already restored, apply the restored
    // slice immediately. The returned Disposable captures the bag's final values,
    // detaches change listeners, and stops tracking it.
    Register(key: string, bag: IPropertyBag): Disposable;
    // Load the persisted document once (tolerating missing/corrupt → empty) and apply
    // each key's slice to every currently-registered bag.
    Restore(): Promise<void>;
    // Flush the merged document now. The host also calls this on exit.
    Save(): Promise<void>;
}
