import { test } from "node:test";
import assert from "node:assert/strict";
import { HostKinds } from "../host-kinds.js";

test("HostKinds.Server exists with name 'server' and is distinct", () =>
{
    assert.equal(HostKinds.Server.Name, "server");
    assert.notEqual(HostKinds.Server, HostKinds.Headless);
});
