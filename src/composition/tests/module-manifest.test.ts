import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceKey, ServiceProvider } from "../../services/service-provider.js";
import { HostKinds } from "../host-kinds.js";
import { ModuleManifest } from "../module-manifest.js";
import { ActivationContext } from "../activation-context.js";

const Logger = new ServiceKey<{ log(m: string): void }>("Logger");

test("manifest builder composes immutably and Supports honors targets", () =>
{
    const m = ModuleManifest.For("audit").WithService(Logger).ActivatedOnStartup();
    assert.equal(m.Id, "audit");
    assert.equal(m.OnStartup, true);
    assert.deepEqual([...m.Provides], [Logger]);
    assert.equal(m.Supports(HostKinds.Headless), true);

    const headlessOnly = ModuleManifest.For("x").WithTargets(HostKinds.Headless);
    assert.equal(headlessOnly.Supports(HostKinds.Headless), true);
    assert.equal(headlessOnly.Supports(HostKinds.Desktop), false);
});

test("ActivationContext tracks provided services for rollback and resolves from the container", () =>
{
    const services = new ServiceProvider();
    const context = new ActivationContext("audit", services);
    const logger = { log(): void {} };
    context.ProvideInstance(Logger, logger);
    assert.equal(context.Resolve(Logger), logger);
    assert.deepEqual([...context.ProvidedServices()], [Logger]);
});
