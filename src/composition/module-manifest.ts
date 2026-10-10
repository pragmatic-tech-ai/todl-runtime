import type { HostKind } from "./host-kind.js";
import type { ServiceToken } from "../services/service-provider.js";

export class ModuleManifest
{
    private constructor(
        public readonly Id: string,
        public readonly Targets: ReadonlySet<HostKind>,
        public readonly Requires: readonly string[],
        public readonly Provides: readonly ServiceToken<unknown>[],
        public readonly OnStartup: boolean,
    )
    {
    }

    public static For(id: string): ModuleManifest
    {
        return new ModuleManifest(id, new Set<HostKind>(), [], [], false);
    }

    public WithTargets(...hosts: readonly HostKind[]): ModuleManifest
    {
        return new ModuleManifest(this.Id, new Set([...this.Targets, ...hosts]), this.Requires, this.Provides, this.OnStartup);
    }

    public WithRequirement(id: string): ModuleManifest
    {
        return new ModuleManifest(this.Id, this.Targets, [...this.Requires, id], this.Provides, this.OnStartup);
    }

    public WithService(token: ServiceToken<unknown>): ModuleManifest
    {
        return new ModuleManifest(this.Id, this.Targets, this.Requires, [...this.Provides, token], this.OnStartup);
    }

    public ActivatedOnStartup(): ModuleManifest
    {
        return new ModuleManifest(this.Id, this.Targets, this.Requires, this.Provides, true);
    }

    public Supports(host: HostKind): boolean
    {
        return this.Targets.size === 0 || this.Targets.has(host);
    }
}
