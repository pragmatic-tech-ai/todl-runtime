import { ServiceBase } from '../services/service-base.js';
import { ServiceKey, type IServiceProvider } from '../services/service-provider.js';
import { EnvironmentKey } from '../environment.js';
import { StorageProviderKey } from '../storage/storage-provider.js';
import { type IStorage } from '../storage/storage.js';
import { type IPropertyBag } from '../property-bag.js';
import { type Disposable } from '../signal.js';

// The session-store contract: any service registers a keyed IPropertyBag; the
// store persists all registered bags to one session.json under the user folder
// (debounced on change) and restores them at startup. Distinct from typed user
// PREFERENCES (mural's ApplicationSettings) — this is transient session state.
export interface ISessionStore
{
    // Track a bag under `key`; if the store has already loaded, apply the restored
    // slice immediately. The returned Disposable captures the bag's final values,
    // detaches change listeners, and stops tracking it.
    Register(key: string, bag: IPropertyBag): Disposable;
    // Load session.json once (tolerating missing/corrupt → empty) and apply each
    // key's slice to every currently-registered bag.
    Restore(): Promise<void>;
    // Flush now: write the merged document. The host also calls this on exit.
    Save(): Promise<void>;
}

export const SessionStoreKey = new ServiceKey<ISessionStore>('SessionStore');

// One aggregate document: registration key → { propertyName: value }.
type SessionDocument = Record<string, Record<string, unknown>>;

interface Tracked
{
    readonly bag: IPropertyBag;
    readonly subs: readonly Disposable[];
}

export class SessionStore extends ServiceBase implements ISessionStore
{
    public static readonly Key = SessionStoreKey;

    private static readonly FileName = 'session.json';

    private readonly debounceMs: number;
    private readonly tracked = new Map<string, Tracked>();
    // The last document read from disk, merged with live captures on save. Keys not
    // currently registered are preserved verbatim.
    private loaded: SessionDocument = {};
    private isLoaded = false;
    private saveTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(provider: IServiceProvider, debounceMs = 750)
    {
        super(provider);
        this.debounceMs = debounceMs;
    }

    public Register(key: string, bag: IPropertyBag): Disposable
    {
        if (this.tracked.has(key))
        {
            throw new Error(`SessionStore: key '${key}' is already registered`);
        }
        // Subscribe to every property's change channel → schedule a save.
        const subs: Disposable[] = [];
        for (const [name] of bag)
        {
            subs.push(bag.Observe(name).subscribe(() => this.scheduleSave()));
        }
        this.tracked.set(key, { bag, subs });
        if (this.isLoaded) SessionStore.apply(bag, this.loaded[key]);
        return { dispose: () => this.unregister(key) };
    }

    public async Restore(): Promise<void>
    {
        this.loaded = await this.load();
        this.isLoaded = true;
        for (const [key, t] of this.tracked) SessionStore.apply(t.bag, this.loaded[key]);
    }

    public async Save(): Promise<void>
    {
        if (this.saveTimer !== undefined)
        {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const doc: SessionDocument = { ...this.loaded };
        for (const [key, t] of this.tracked) doc[key] = SessionStore.capture(t.bag);
        this.loaded = doc;
        await this.storage().WriteText(SessionStore.FileName, JSON.stringify(doc, null, 2));
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
        this.loaded = { ...this.loaded, [key]: SessionStore.capture(t.bag) };
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

    private async load(): Promise<SessionDocument>
    {
        try
        {
            const text = await this.storage().ReadText(SessionStore.FileName);
            const parsed: unknown = JSON.parse(text);
            return parsed !== null && typeof parsed === 'object' ? (parsed as SessionDocument) : {};
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
