import {
    ServiceLifetime,
    type IServiceContainer,
    type ServiceToken,
    type ServiceFactory,
} from '../services/service-provider.js';
import type { HostKind } from './host-kind.js';

// The minimal composition unit a CompositionRoot depends on — no UI. A CLI
// composes plain IModules; a UI shell's module type (e.g. mural's IShellModule)
// extends this with UI contributions. `Targets` empty ⇒ universal (composes for
// every host kind).
export interface IModule
{
    readonly Targets: ReadonlySet<HostKind>;
    RegisterServices(container: IServiceContainer): void;
}

// One service a module contributes: the token it registers under, the lazy
// factory that builds it, and the lifetime. Recorded by `AddRegistration` and
// replayed by `RegisterServices` when the module is composed.
interface ServiceRegistration
{
    token:    ServiceToken<unknown>;
    factory:  ServiceFactory<unknown>;
    lifetime: ServiceLifetime;
}

// A concrete, HEADLESS module: the composition half of a module with no UI. It
// records service registrations (AddRegistration) and host-kind targets
// (AddTarget), then replays the registrations into a container when composed —
// exactly what a `.mu` `module NAME { … }` block lowers to. The UI-flavored
// counterpart, mural's `ShellModule`, adds capabilities / resources on top of the
// same registration API; a `.mu` `shell module NAME { … }` block lowers to that.
//
// Portable: depends only on the todl-runtime composition + service primitives, so
// a CLI, a test harness, or a non-UI package can author and compose modules with
// no framework dependency.
export class Module implements IModule
{
    private readonly _registrations: ServiceRegistration[] = [];
    private readonly _targets = new Set<HostKind>();

    // Host kinds this module composes for. Empty ⇒ universal (every kind).
    // Authored via a `.targets:` block or set from code with AddTarget; the
    // CompositionRoot admit gate reads this to decide whether to compose.
    public get Targets(): ReadonlySet<HostKind> { return this._targets; }

    public AddTarget(kind: HostKind): void { this._targets.add(kind); }

    // True when the module declares at least one registration — mirrors
    // IShellModule.HasServiceRegistrations so a host can gate the lazy provider.
    public get HasServiceRegistrations(): boolean { return this._registrations.length > 0; }

    // Record one service registration (the `.services:` lowering emits one call
    // per entry). Held until the module is composed, then replayed by
    // RegisterServices.
    public AddRegistration(
        token:    ServiceToken<unknown>,
        factory:  ServiceFactory<unknown>,
        lifetime: ServiceLifetime,
    ): void
    {
        this._registrations.push({ token, factory, lifetime });
    }

    // Replay the recorded registrations into `container`, keeping each entry's
    // declared lifetime. Called by the CompositionRoot when the module is
    // composed (a plain IModule composes straight through the base). No-op when
    // the module declares no services.
    public RegisterServices(container: IServiceContainer): void
    {
        for (const r of this._registrations)
        {
            if (r.lifetime === ServiceLifetime.Scoped)
            {
                container.registerScoped(r.token, r.factory);
            }
            else if (r.lifetime === ServiceLifetime.Transient)
            {
                container.registerTransient(r.token, r.factory);
            }
            else
            {
                container.register(r.token, r.factory, ServiceLifetime.Singleton);
            }
        }
    }
}
