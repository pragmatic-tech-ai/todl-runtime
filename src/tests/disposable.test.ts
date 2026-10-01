import { test } from "node:test";
import assert from "node:assert/strict";

import { Disposable, CompositeDisposable, type IDisposable } from "../signal.js";

test("Disposable runs its cleanup exactly once", () => {
  let count = 0;
  const d = new Disposable(() => { count += 1; });
  d.dispose();
  d.dispose(); // second call is a no-op
  assert.equal(count, 1);
});

test("a no-arg Disposable and Disposable.None dispose without effect", () => {
  assert.doesNotThrow(() => new Disposable().dispose());
  assert.doesNotThrow(() => Disposable.None.dispose());
});

test("CompositeDisposable disposes all children once, in reverse order", () => {
  const order: number[] = [];
  const c = new CompositeDisposable();
  c.add(new Disposable(() => order.push(1)));
  c.add(new Disposable(() => order.push(2)));
  c.dispose();
  c.dispose(); // no-op
  assert.deepEqual(order, [2, 1]);
});

test("CompositeDisposable.add after disposal disposes the child immediately", () => {
  const c = new CompositeDisposable();
  c.dispose();
  let disposed = false;
  const late: IDisposable = new Disposable(() => { disposed = true; });
  c.add(late);
  assert.equal(disposed, true);
});
