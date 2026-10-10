import { ServiceProvider, type ServiceToken } from "../services/service-provider.js";
import type { HostKind } from "./host-kind.js";
import type { ILazyModule } from "./lazy-module.js";
import type { ModuleManifest } from "./module-manifest.js";
import { ModuleState, ModuleStateKind, ModuleStateProperty } from "./module-state.js";
import { ActivationContext } from "./activation-context.js";
import { RootError } from "./root-error.js";
import { CompositionError } from "./composition-error.js";

interface ModuleCandidate
{
    module: ILazyModule;
    manifest: ModuleManifest;
}

interface ModuleEntry extends ModuleCandidate
{
    state: ModuleStateProperty;
}

export class CompositionRootBuilder
{
    private readonly modules: ILazyModule[] = [];

    public constructor(private readonly host: HostKind)
    {
    }

    public Module(m: ILazyModule): this
    {
        this.modules.push(m);
        return this;
    }

    public Build(): LazyCompositionRoot
    {
        const seen = new Set<string>();
        const included: ModuleCandidate[] = [];
        const skipped: string[] = [];
        for (const module of this.modules)
        {
            const manifest = module.Manifest();
            if (seen.has(manifest.Id))
            {
                throw CompositionError.DuplicateModule(manifest.Id);
            }

            seen.add(manifest.Id);
            if (manifest.Supports(this.host))
            {
                included.push({ module, manifest });
            }
            else
            {
                skipped.push(manifest.Id);
            }
        }

        const owners = new Map<ServiceToken<unknown>, string>();
        for (const item of included)
        {
            for (const token of item.manifest.Provides)
            {
                const first = owners.get(token);
                if (first !== undefined)
                {
                    throw CompositionError.DuplicateService(token.toString(), first, item.manifest.Id);
                }

                owners.set(token, item.manifest.Id);
            }
        }

        const ordered = CompositionRootBuilder.TopoOrder(included);
        const entries: ModuleEntry[] = ordered.map(item => (
            { module: item.module, manifest: item.manifest, state: new ModuleStateProperty(ModuleState.Dormant()) }));
        const index = new Map<string, number>();
        entries.forEach((entry, i) => index.set(entry.manifest.Id, i));
        return new LazyCompositionRoot(entries, index, owners, skipped, new ServiceProvider());
    }

    private static TopoOrder(items: readonly ModuleCandidate[]): ModuleCandidate[]
    {
        const byId = new Map<string, ModuleCandidate>();
        for (const item of items)
        {
            byId.set(item.manifest.Id, item);
        }

        const done = new Set<string>();
        const stack: string[] = [];
        const result: ModuleCandidate[] = [];
        for (const item of items)
        {
            CompositionRootBuilder.Visit(item, byId, done, stack, result);
        }

        return result;
    }

    private static Visit(
        item: ModuleCandidate,
        byId: ReadonlyMap<string, ModuleCandidate>,
        done: Set<string>,
        stack: string[],
        result: ModuleCandidate[],
    ): void
    {
        const id = item.manifest.Id;
        if (done.has(id))
        {
            return;
        }

        const at = stack.indexOf(id);
        if (at >= 0)
        {
            throw CompositionError.RequirementCycle([...stack.slice(at), id]);
        }

        stack.push(id);
        for (const required of item.manifest.Requires)
        {
            const dep = byId.get(required);
            if (dep === undefined)
            {
                throw CompositionError.MissingRequirement(id, required);
            }

            CompositionRootBuilder.Visit(dep, byId, done, stack, result);
        }

        stack.pop();
        done.add(id);
        result.push(item);
    }
}

export class LazyCompositionRoot
{
    private static readonly RequiredFailedTemplate = "required module {0} failed: {1}";
    private static readonly NotProvidedTemplate = "module {0} did not provide declared service {1}";
    private static readonly UndeclaredTemplate = "module {0} provided undeclared service {1}";

    private readonly activating = new Map<number, Promise<void>>();

    /** @internal Use LazyCompositionRoot.Builder(); constructed only by CompositionRootBuilder. */
    public constructor(
        private readonly entries: ModuleEntry[],
        private readonly indexById: Map<string, number>,
        private readonly ownerByToken: Map<ServiceToken<unknown>, string>,
        private readonly skipped: string[],
        private readonly services: ServiceProvider,
    )
    {
    }

    public static Builder(host: HostKind): CompositionRootBuilder
    {
        return new CompositionRootBuilder(host);
    }

    public ModuleIds(): readonly string[]
    {
        return this.entries.map(e => e.manifest.Id);
    }

    public SkippedModules(): readonly string[]
    {
        return this.skipped;
    }

    public StateOf(id: string): ModuleStateProperty | undefined
    {
        const i = this.indexById.get(id);
        return i === undefined ? undefined : this.entries[i].state;
    }

    public Services(): ServiceProvider
    {
        return this.services;
    }

    public async Start(): Promise<readonly RootError[]>
    {
        const failures: RootError[] = [];
        for (let i = 0; i < this.entries.length; i++)
        {
            if (!this.entries[i].manifest.OnStartup)
            {
                continue;
            }

            try
            {
                await this.activateIndex(i);
            }
            catch (e)
            {
                failures.push(e as RootError);
            }
        }

        return failures;
    }

    public async Activate(id: string): Promise<void>
    {
        const index = this.indexById.get(id);
        if (index === undefined)
        {
            throw RootError.UnknownModule(id);
        }

        await this.activateIndex(index);
    }

    public async Resolve<T>(token: ServiceToken<T>): Promise<T>
    {
        const ownerId = this.ownerByToken.get(token as ServiceToken<unknown>);
        const present = this.services.has(token);
        if (ownerId === undefined && !present)
        {
            throw RootError.UnknownService(String(token));
        }

        if (ownerId !== undefined && !present)
        {
            await this.activateIndex(this.indexById.get(ownerId)!);
        }

        return this.services.getRequired(token);
    }

    // Concurrent callers of the same dormant module await ONE shared in-flight activation.
    // True requirement cycles are rejected at build time (topo sort) and ActivationContext.Resolve
    // never activates, so runtime re-entry of the same index cannot occur: awaiting the in-flight
    // promise cannot self-deadlock. RootError.ActivationCycle is therefore a defensive guard only.
    private async activateIndex(index: number): Promise<void>
    {
        const entry = this.entries[index];
        const state = entry.state.Get();
        if (state.Kind === ModuleStateKind.Active)
        {
            return;
        }

        if (state.Kind === ModuleStateKind.Failed)
        {
            throw RootError.ModuleFailed(entry.manifest.Id, state.Reason ?? "");
        }

        const inFlight = this.activating.get(index);
        if (inFlight !== undefined)
        {
            return inFlight;
        }

        entry.state.Set(ModuleState.Activating());
        const promise = this.runActivation(index);
        this.activating.set(index, promise);
        try
        {
            await promise;
        }
        finally
        {
            this.activating.delete(index);
        }
    }

    private async runActivation(index: number): Promise<void>
    {
        const entry = this.entries[index];
        const id = entry.manifest.Id;
        let context: ActivationContext | undefined;
        try
        {
            for (const requirement of entry.manifest.Requires)
            {
                const req = this.indexById.get(requirement)!;
                try
                {
                    await this.activateIndex(req);
                }
                catch (e)
                {
                    const inner = this.entries[req].state.Get().Reason ?? (e as Error).message;
                    throw new Error(LazyCompositionRoot.RequiredFailedTemplate
                        .replace("{0}", requirement).replace("{1}", inner));
                }
            }

            context = new ActivationContext(id, this.services);
            await entry.module.Activate(context);
            this.verifyDelivery(entry, context);
            entry.state.Set(ModuleState.Active());
        }
        catch (error)
        {
            if (context !== undefined)
            {
                for (const token of context.ProvidedServices())
                {
                    this.services.unregister(token);
                }
            }

            const reason = (error as Error).message;
            entry.state.Set(ModuleState.Failed(reason));
            throw RootError.ModuleFailed(id, reason);
        }
    }

    private verifyDelivery(entry: ModuleEntry, context: ActivationContext): void
    {
        const id = entry.manifest.Id;
        const declared = new Set<ServiceToken<unknown>>(entry.manifest.Provides);
        const provided = new Set<ServiceToken<unknown>>(context.ProvidedServices());
        for (const token of declared)
        {
            if (!provided.has(token))
            {
                throw new Error(LazyCompositionRoot.NotProvidedTemplate.replace("{0}", id).replace("{1}", String(token)));
            }
        }

        for (const token of provided)
        {
            if (!declared.has(token))
            {
                throw new Error(LazyCompositionRoot.UndeclaredTemplate.replace("{0}", id).replace("{1}", String(token)));
            }
        }
    }
}
