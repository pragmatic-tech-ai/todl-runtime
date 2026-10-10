import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceKey } from "../../services/service-provider.js";
import { HostKinds } from "../host-kinds.js";
import { ModuleManifest } from "../module-manifest.js";
import type { ILazyModule } from "../lazy-module.js";
import { ActivationContext } from "../activation-context.js";
import { LazyCompositionRoot } from "../lazy-composition-root.js";
import { ModuleStateKind } from "../module-state.js";

interface ILogger { log(m: string): void; }
const Logger = new ServiceKey<ILogger>("Logger");
const Greeter = new ServiceKey<{ greet(): string }>("Greeter");
const Half = new ServiceKey<object>("Half");   // shared: provided by BrokenModule AND asserted after rollback

class AuditModule implements ILazyModule
{
    public activated = false;
    public Manifest(): ModuleManifest { return ModuleManifest.For("audit").WithService(Logger).ActivatedOnStartup(); }
    public async Activate(context: ActivationContext): Promise<void>
    {
        this.activated = true;
        context.ProvideInstance(Logger, { log(): void {} });
    }
}

class GreeterModule implements ILazyModule
{
    public activated = false;
    public Manifest(): ModuleManifest { return ModuleManifest.For("greeter").WithRequirement("audit").WithService(Greeter); }
    public async Activate(context: ActivationContext): Promise<void>
    {
        this.activated = true;
        context.Resolve(Logger);
        context.ProvideInstance(Greeter, { greet: () => "hi" });
    }
}

class BrokenModule implements ILazyModule
{
    public Manifest(): ModuleManifest { return ModuleManifest.For("broken").WithService(Half); }
    public async Activate(context: ActivationContext): Promise<void>
    {
        context.ProvideInstance(Half, {});   // registers, then throws → must roll back
        throw new Error("kaboom");
    }
}


test("nothing is active immediately after Build", () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new AuditModule()).Module(new GreeterModule()).Build();
    const active = root.ModuleIds().filter((id) => root.StateOf(id)!.Get().Kind === ModuleStateKind.Active);
    assert.deepEqual(active, []);
});

test("Start activates on-startup + its chain; a lazy sibling stays dormant until resolved", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new AuditModule()).Module(new GreeterModule()).Build();
    await root.Start();
    assert.equal(root.StateOf("audit")!.Get().Kind, ModuleStateKind.Active);
    assert.equal(root.StateOf("greeter")!.Get().Kind, ModuleStateKind.Dormant);
    await root.Resolve(Greeter);
    assert.equal(root.StateOf("greeter")!.Get().Kind, ModuleStateKind.Active);
});

test("a broken module fails in isolation and its partial registrations roll back; others still compose", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new AuditModule()).Module(new BrokenModule()).Build();
    const failures = await root.Start();
    await assert.rejects(() => root.Activate("broken"));
    assert.equal(root.StateOf("broken")!.Get().Kind, ModuleStateKind.Failed);
    assert.equal(root.Services().has(Half), false);
    assert.equal(root.StateOf("audit")!.Get().Kind, ModuleStateKind.Active);
    assert.equal(failures.length, 0);   // audit (on-startup) succeeded; broken is not on-startup so Start is clean
});

test("a fresh root re-runs activation from scratch", async () =>
{
    const first = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new AuditModule()).Build();
    await first.Start();
    const second = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new AuditModule()).Build();
    assert.equal(second.StateOf("audit")!.Get().Kind, ModuleStateKind.Dormant);
    await second.Start();
    assert.equal(second.StateOf("audit")!.Get().Kind, ModuleStateKind.Active);
});
