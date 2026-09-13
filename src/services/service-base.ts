import { Observable } from '../observable.js';
import type { IServiceProvider } from './service-provider.js';

// Base for application services. A lightweight Observable (INPC via
// RaisePropertyChanged) — NOT a MuralBase: a service exposes bindable state as
// plain Observable properties (a binding reads plain getters/setters and
// subscribes the name-keyed change channel), so it needs no dependency-property
// machinery. Living in todl-runtime lets a service be authored without a mural
// dependency; mural re-exports this from its runtime barrel.
//
// Convention (TS can't express a `static abstract`): every concrete service
// declares a `static readonly Key: ServiceKey<Self>` token and registers itself
// against it, so registration / resolution sites stay uniform and greppable
// (tokens are real objects, never strings).
//
// Lifecycle: dispose() releases subscriptions / timers the service holds. A
// ServiceProvider scope calls dispose() on every ServiceBase it owns when the
// scope is disposed (see ServiceProvider.dispose), so a per-scope service tears
// down with its scope.
export abstract class ServiceBase extends Observable
{
    // The container that built this service, narrowed to the consumer contract
    // (resolve only — no register / scope). Every concrete service ctor takes an
    // IServiceProvider and forwards it here via `super(provider)`; both the
    // `.services:` markup block and any code registration construct a service as
    // `new Impl(provider)`. A service resolves its own collaborators from here —
    // in the ctor for eager wiring, or lazily, e.g. `this.Provider.getRequired(Other.Key)`.
    protected readonly Provider: IServiceProvider;

    // Optional header-action affordances the shell presents for this service when
    // it backs a content region — the right side of a ShellSideContentPane header
    // (a button row, a "…" menu, …). A view-facing slot a service sets to expose
    // its actions; the pane binds it via `Commands = $service(…).ActiveService.HeaderCommands`.
    // `unknown` (not a Visual type) so runtime stays free of a visual-engine
    // dependency — a ContentPresenter resolves whatever's here. Unset ⇒ no commands.
    private _headerCommands: unknown = undefined;

    constructor(provider: IServiceProvider)
    {
        super();
        this.Provider = provider;
    }

    public get HeaderCommands(): unknown { return this._headerCommands; }
    public set HeaderCommands(v: unknown)
    {
        const old = this._headerCommands;
        this._headerCommands = v;
        this.RaisePropertyChanged('HeaderCommands', old, v);
    }

    // Override to release resources (event subscriptions, timers, …). Default
    // no-op. Idempotent by contract — the container calls it once on scope
    // teardown, but a defensive double-call must be safe.
    public dispose(): void { }
}
