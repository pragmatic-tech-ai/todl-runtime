import { ServiceProvider, type ServiceToken } from "../services/service-provider.js";
import type { HostKind } from "./host-kind.js";
import type { ILazyModule } from "./lazy-module.js";
import type { ModuleManifest } from "./module-manifest.js";
import { ModuleState, ModuleStateProperty } from "./module-state.js";
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
    // entries/indexById/ownerByToken/services are consumed by the activation phase (next task).
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
}
