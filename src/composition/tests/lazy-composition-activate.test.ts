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

test("Start activates only on-startup modules and their chains", async () =>
{
    const audit = new AuditModule();
    const greeter = new GreeterModule();
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(greeter).Module(audit).Build();
    const failures = await root.Start();
    assert.deepEqual(failures, []);
    assert.equal(audit.activated, true);
    assert.equal(greeter.activated, false);
    assert.equal(root.StateOf("audit")!.Get().Kind, ModuleStateKind.Active);
    assert.equal(root.StateOf("greeter")!.Get().Kind, ModuleStateKind.Dormant);
});

test("Resolve lazily activates the provider and its requirement chain", async () =>
{
    const audit = new AuditModule();
    const greeter = new GreeterModule();
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(greeter).Module(audit).Build();
    const g = await root.Resolve(Greeter);
    assert.equal(g.greet(), "hi");
    assert.equal(greeter.activated, true);
    assert.equal(audit.activated, true);
});

test("a failing activation ends Failed and rolls back its registrations", async () =>
{
    const broken = new BrokenModule();
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(broken).Build();
    await assert.rejects(() => root.Activate("broken"));
    assert.equal(root.StateOf("broken")!.Get().Kind, ModuleStateKind.Failed);
    assert.equal(root.Services().has(Half), false);
});

test("Resolve of an unprovided service throws UnknownService", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Build();
    await assert.rejects(() => root.Resolve(new ServiceKey<object>("Nope")), /unknown service/i);
});
