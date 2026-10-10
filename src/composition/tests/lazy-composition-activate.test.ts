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

const Lonely = new ServiceKey<object>("Lonely");
const Shared = new ServiceKey<object>("Shared");
const Dependent = new ServiceKey<object>("Dependent");

class FailingRequirement implements ILazyModule
{
    public Manifest(): ModuleManifest { return ModuleManifest.For("bad").WithService(Lonely); }
    public async Activate(): Promise<void> { throw new Error("bad-boom"); }
}

class NeedsBad implements ILazyModule
{
    public Manifest(): ModuleManifest { return ModuleManifest.For("needs").WithRequirement("bad").WithService(Dependent); }
    public async Activate(context: ActivationContext): Promise<void> { context.ProvideInstance(Dependent, {}); }
}

class StartupBad implements ILazyModule
{
    public Manifest(): ModuleManifest { return ModuleManifest.For("sbad").ActivatedOnStartup(); }
    public async Activate(): Promise<void> { throw new Error("startup-boom"); }
}

class NoDeliver implements ILazyModule
{
    public Manifest(): ModuleManifest { return ModuleManifest.For("nodeliver").WithService(Lonely); }
    public async Activate(): Promise<void> {}
}

class CountingModule implements ILazyModule
{
    public count = 0;
    public Manifest(): ModuleManifest { return ModuleManifest.For("counting").WithService(Shared); }
    public async Activate(context: ActivationContext): Promise<void>
    {
        this.count++;
        await new Promise(r => setTimeout(r, 10));
        context.ProvideInstance(Shared, {});
    }
}

test("Activate of an unknown module throws UnknownModule", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Build();
    await assert.rejects(() => root.Activate("ghost"), /unknown module/i);
});

test("a failing requirement fails the dependent and propagates once", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new FailingRequirement()).Module(new NeedsBad()).Build();
    await assert.rejects(() => root.Activate("needs"), (e: Error) =>
        /required module bad failed: bad-boom/.test(e.message) && (e.message.match(/failed/g) ?? []).length === 2);
    assert.equal(root.StateOf("needs")!.Get().Kind, ModuleStateKind.Failed);
    assert.equal(root.StateOf("bad")!.Get().Kind, ModuleStateKind.Failed);
});

test("Start collects a failure while a sibling on-startup module still activates", async () =>
{
    const audit = new AuditModule();
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new StartupBad()).Module(audit).Build();
    const failures = await root.Start();
    assert.equal(failures.length, 1);
    assert.match(failures[0].message, /startup-boom/);
    assert.equal(audit.activated, true);
});

test("a declared-but-undelivered service fails activation even if the host registered it", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new NoDeliver()).Build();
    root.Services().registerInstance(Lonely, {});
    await assert.rejects(() => root.Activate("nodeliver"), /did not provide/);
    assert.equal(root.StateOf("nodeliver")!.Get().Kind, ModuleStateKind.Failed);
});

test("re-activating a Failed module throws ModuleFailed", async () =>
{
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(new BrokenModule()).Build();
    await assert.rejects(() => root.Activate("broken"));
    await assert.rejects(() => root.Activate("broken"), /failed/i);
});

test("concurrent Resolves share a single activation", async () =>
{
    const counting = new CountingModule();
    const root = LazyCompositionRoot.Builder(HostKinds.Headless).Module(counting).Build();
    const [a, b] = await Promise.all([root.Resolve(Shared), root.Resolve(Shared)]);
    assert.equal(a, b);
    assert.equal(counting.count, 1);
    assert.equal(root.StateOf("counting")!.Get().Kind, ModuleStateKind.Active);
});
