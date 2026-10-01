import { ServiceBase } from '../services/service-base.js';
import { ServiceKey, type IServiceProvider } from '../services/service-provider.js';
import { EnvironmentKey } from '../environment.js';
import { StorageProviderKey } from '../storage/storage-provider.js';
import { type IStorage } from '../storage/storage.js';
import { type IPropertyBag } from '../property-bag.js';
import { Disposable, type IDisposable } from '../signal.js';
import { type IPropertyBagStore } from './property-bag-store.js';

// A DURABLE store of property bags: any service registers a keyed IPropertyBag; the
// store persists all registered bags to one application-bags.json under the user folder
// (debounced on change) and restores them at startup, so their values survive across
// sessions. This is durable application data (connections, defaults, the last-active
// solution, persisted view state) — distinct from transient per-run state, which lives
// in TransientSessionStore behind the same IPropertyBagStore interface.
export const DurableApplicationStoreKey = new ServiceKey<IPropertyBagStore>('DurableApplicationStore');

// One aggregate document: registration key → { propertyName: value }.
type BagDocument = Record<string, Record<string, unknown>>;

interface Tracked
{
    readonly bag: IPropertyBag;
    readonly subs: readonly IDisposable[];
}

export class DurableApplicationStore extends ServiceBase implements IPropertyBagStore
{
    public static readonly Key = DurableApplicationStoreKey;

    private static readonly FileName = 'application-bags.json';

    private readonly debounceMs: number;
    private readonly tracked = new Map<string, Tracked>();
    // The last document read from disk, merged with live captures on save. Keys not
    // currently registered are preserved verbatim.
    private loaded: BagDocument = {};
    private isLoaded = false;
    private saveTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(provider: IServiceProvider, debounceMs = 750)
    {
        super(provider);
        this.debounceMs = debounceMs;
    }

    public Register(key: string, bag: IPropertyBag): IDisposable
    {
        if (this.tracked.has(key))
        {
            throw new Error(`DurableApplicationStore: key '${key}' is already registered`);
        }
        // Subscribe to every property's change channel → schedule a save.
        const subs: IDisposable[] = [];
        for (const [name] of bag)
        {
            subs.push(bag.Observe(name).subscribe(() => this.scheduleSave()));
        }
        this.tracked.set(key, { bag, subs });
        if (this.isLoaded) DurableApplicationStore.apply(bag, this.loaded[key]);
        return new Disposable(() => this.unregister(key));
    }

    public async Restore(): Promise<void>
    {
        this.loaded = await this.load();
        this.isLoaded = true;
        for (const [key, t] of this.tracked) DurableApplicationStore.apply(t.bag, this.loaded[key]);
    }

    public async Save(): Promise<void>
    {
        if (this.saveTimer !== undefined)
        {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const doc: BagDocument = { ...this.loaded };
        for (const [key, t] of this.tracked) doc[key] = DurableApplicationStore.capture(t.bag);
        this.loaded = doc;
        await this.storage().WriteText(DurableApplicationStore.FileName, JSON.stringify(doc, null, 2));
    }

    public override dispose(): void
    {
        if (this.saveTimer !== undefined)
        {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        for (const t of this.tracked.values()) for (const s of t.subs) s.dispose();
        this.tracked.clear();
        super.dispose();
    }

    private unregister(key: string): void
    {
        const t = this.tracked.get(key);
        if (t === undefined) return;
        // Capture the bag's final values so a temporary teardown does not lose them.
        this.loaded = { ...this.loaded, [key]: DurableApplicationStore.capture(t.bag) };
        for (const s of t.subs) s.dispose();
        this.tracked.delete(key);
        this.scheduleSave();
    }

    private scheduleSave(): void
    {
        if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            void this.Save();
        }, this.debounceMs);
    }

    private storage(): IStorage
    {
        const env = this.Provider.getRequired(EnvironmentKey);
        const provider = this.Provider.getRequired(StorageProviderKey);
        return provider.CreateStorage(env.UserDataDirectory);
    }

    private async load(): Promise<BagDocument>
    {
        try
        {
            const text = await this.storage().ReadText(DurableApplicationStore.FileName);
            const parsed: unknown = JSON.parse(text);
            return parsed !== null && typeof parsed === 'object' ? (parsed as BagDocument) : {};
        }
        catch
        {
            return {};
        }
    }

    private static capture(bag: IPropertyBag): Record<string, unknown>
    {
        const out: Record<string, unknown> = {};
        for (const [name] of bag) out[name] = bag.GetValue(name);
        return out;
    }

    private static apply(bag: IPropertyBag, slice: Record<string, unknown> | undefined): void
    {
        if (slice === undefined) return;
        const names = new Set<string>();
        for (const [name] of bag) names.add(name);
        for (const [name, value] of Object.entries(slice))
        {
            if (!names.has(name) || bag.IsReadOnly(name)) continue;
            bag.SetValue(name, value);
        }
    }
}
