import { ServiceBase } from '../services/service-base.js';
import { ServiceKey } from '../services/service-provider.js';
import { type IPropertyBag } from '../property-bag.js';
import { type Disposable } from '../signal.js';
import { type IPropertyBagStore } from './property-bag-store.js';

// A TRANSIENT store of property bags: it tracks registered bags for the run but never
// persists them — Save and Restore are no-ops, so its values do not survive a restart.
// Same IPropertyBagStore surface as DurableApplicationStore, so a consumer that wants
// per-run-only state uses this tier in its place.
export const TransientSessionStoreKey = new ServiceKey<IPropertyBagStore>('TransientSessionStore');

export class TransientSessionStore extends ServiceBase implements IPropertyBagStore
{
    public static readonly Key = TransientSessionStoreKey;

    private readonly tracked = new Map<string, IPropertyBag>();

    public Register(key: string, bag: IPropertyBag): Disposable
    {
        if (this.tracked.has(key))
        {
            throw new Error(`TransientSessionStore: key '${key}' is already registered`);
        }
        this.tracked.set(key, bag);
        return { dispose: () => { this.tracked.delete(key); } };
    }

    // Nothing is persisted: a fresh run starts empty.
    public Restore(): Promise<void>
    {
        return Promise.resolve();
    }

    public Save(): Promise<void>
    {
        return Promise.resolve();
    }

    public override dispose(): void
    {
        this.tracked.clear();
        super.dispose();
    }
}
