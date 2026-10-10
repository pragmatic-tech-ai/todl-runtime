import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceKey } from "../../services/service-provider.js";
import { HostKinds } from "../host-kinds.js";
import { ModuleManifest } from "../module-manifest.js";
import type { ILazyModule } from "../lazy-module.js";
import type { ActivationContext } from "../activation-context.js";
import { LazyCompositionRoot } from "../lazy-composition-root.js";
import { ModuleStateKind } from "../module-state.js";

class StubModule implements ILazyModule
{
    public constructor(private readonly manifest: ModuleManifest)
    {
    }

    public Manifest(): ModuleManifest
    {
        return this.manifest;
    }

    public async Activate(_context: ActivationContext): Promise<void>
    {
    }
}

const Logger = new ServiceKey<object>("Logger");

test("build composes requirement-first, all dormant, nothing activated", () =>
{
    const audit = new StubModule(ModuleManifest.For("audit").WithService(Logger));
    const greeter = new StubModule(ModuleManifest.For("greeter").WithRequirement("audit"));
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(greeter).Module(audit).Build();
    assert.deepEqual(root.ModuleIds(), ["audit", "greeter"]);
    for (const id of root.ModuleIds()) assert.equal(root.StateOf(id)!.Get().Kind, ModuleStateKind.Dormant);
    assert.equal(root.Services().has(Logger), false);
});

test("host target filtering skips non-admitted modules", () =>
{
    const desktopOnly = new StubModule(ModuleManifest.For("ui").WithTargets(HostKinds.Desktop));
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(desktopOnly).Build();
    assert.deepEqual(root.ModuleIds(), []);
    assert.deepEqual(root.SkippedModules(), ["ui"]);
});

test("duplicate module id, missing requirement, and cycle are build errors", () =>
{
    const a = new StubModule(ModuleManifest.For("a"));
    assert.throws(() => LazyCompositionRoot.Builder(HostKinds.Headless).Module(a).Module(a).Build(), /duplicate module/i);

    const needsGhost = new StubModule(ModuleManifest.For("b").WithRequirement("ghost"));
    assert.throws(() => LazyCompositionRoot.Builder(HostKinds.Headless).Module(needsGhost).Build(), /requirement/i);

    const x = new StubModule(ModuleManifest.For("x").WithRequirement("y"));
    const y = new StubModule(ModuleManifest.For("y").WithRequirement("x"));
    assert.throws(() => LazyCompositionRoot.Builder(HostKinds.Headless).Module(x).Module(y).Build(), /cycle/i);
});

test("two modules providing the same service key is a build error", () =>
{
    const p1 = new StubModule(ModuleManifest.For("p1").WithService(Logger));
    const p2 = new StubModule(ModuleManifest.For("p2").WithService(Logger));
    assert.throws(() => LazyCompositionRoot.Builder(HostKinds.Headless).Module(p1).Module(p2).Build(), /duplicate service|already provided/i);
});
