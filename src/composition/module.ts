import type { IServiceContainer } from '../services/service-provider.js';
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
