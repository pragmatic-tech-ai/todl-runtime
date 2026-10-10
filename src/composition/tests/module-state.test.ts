import { test } from "node:test";
import assert from "node:assert/strict";
import { ModuleState, ModuleStateKind, ModuleStateProperty } from "../module-state.js";
import { HostKinds } from "../host-kinds.js";

test("ModuleState factories and equality", () =>
{
    assert.equal(ModuleState.Dormant().Kind, ModuleStateKind.Dormant);
    assert.equal(ModuleState.Failed("boom").Reason, "boom");
    assert.equal(ModuleState.Active().Equals(ModuleState.Active()), true);
    assert.equal(ModuleState.Failed("a").Equals(ModuleState.Failed("b")), false);
});

test("ModuleStateProperty holds value and emits only on change", () =>
{
    const property = new ModuleStateProperty(ModuleState.Dormant());
    const seen: ModuleStateKind[] = [];
    property.Subscribe((s) => seen.push(s.Kind));
    assert.equal(property.Set(ModuleState.Dormant()), false);
    assert.equal(property.Set(ModuleState.Active()), true);
    assert.equal(property.Get().Kind, ModuleStateKind.Active);
    assert.deepEqual(seen, [ModuleStateKind.Active]);
});

test("HostKinds are distinct minted HostKind constants", () =>
{
    assert.notEqual(HostKinds.Headless, HostKinds.Desktop);
    assert.equal(HostKinds.Headless.Name, "headless");
});
