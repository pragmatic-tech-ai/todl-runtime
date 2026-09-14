import { ServiceProvider } from '../services/service-provider.js';
import type { HostKind } from './host-kind.js';
import type { IModule } from './module.js';

// Owns the root ServiceProvider and a module catalog; fills the provider from
// the modules whose declared Targets admit this root's HostKind. Composition is
// eager on add (a UI shell relies on services being resolvable synchronously as
// its module block runs). Shell-agnostic: a CLI uses this directly.
export class CompositionRoot
{
    public readonly HostKind: HostKind | undefined;

    private readonly _catalog: IModule[] = [];
    private _provider: ServiceProvider | undefined;

    constructor(hostKind?: HostKind)
    {
        this.HostKind = hostKind;
    }

    // The root provider. Lazily built via CreateProvider so a subclass can seed
    // it (e.g. an Application registers its self-service), and so apps that never
    // compose a service-bearing module pay nothing.
    public get Provider(): ServiceProvider
    {
        if (this._provider === undefined) this._provider = this.CreateProvider();
        return this._provider;
    }

    // Record a candidate module; compose it now if this host admits it. A
    // rejected module stays in the catalog inert (never registered).
    public AddModule(module: IModule): void
    {
        this._catalog.push(module);
        if (this.Admits(module)) this.ComposeModule(module);
    }

    // True when this host may compose the module: no host kind set (universal
    // host), the module is universal (empty targets), or the module names this
    // host's kind.
    protected Admits(module: IModule): boolean
    {
        if (this.HostKind === undefined) return true;
        if (module.Targets.size === 0)  return true;
        return module.Targets.has(this.HostKind);
    }

    // Fill the provider from one admitted module. A UI shell overrides this to
    // route through its module collection (which also aggregates UI + resources).
    protected ComposeModule(module: IModule): void
    {
        module.RegisterServices(this.Provider);
    }

    // Build the root provider. Overridden by a subclass to seed its own services.
    protected CreateProvider(): ServiceProvider
    {
        return new ServiceProvider();
    }
}
