# C2 Wave 1 — Settings schema into todl-runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `SettingDefinition` / `SettingKind` to `todl-runtime` as `Observable`-based types (so the engine and UI share one UX-free settings schema), and fix the `ServiceProvider.registerInstance()` stale-cache bug — then this repo is ready to publish for the C2 chain.

**Architecture:** `todl-runtime` is the zero-dependency base layer. The reshaped `SettingDefinition` replaces mural's DP-backed (`MuralBase`) version with a plain `Observable` subclass: nine `field + getter + guarded-setter` triples that raise `PropertyChanged` by name. `SettingKind` stays a real `enum` with its existing string values (mural's compiler keys enum-literal resolution off the member set, so its shape must not change). This wave is **purely additive** to todl-runtime plus one bug fix; it removes nothing from mural or the engine — those repos retarget their imports in their own later waves, and the two type copies coexist harmlessly until then.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), `tsx --test` (node test runner). Zero runtime deps beyond `chokidar`.

**Spec:** `C:\Users\Eugene\Projects\architecture-agent\Plexus\docs\superpowers\specs\2026-10-02-plexus-project-explorer-migration-design.md` (DR4; Section 1 "Out of todl"; Section 6 step 1; Debt cleared → todl-runtime).

## Global Constraints

- Zero new runtime dependencies. `SettingDefinition` uses only `Observable` (`./observable.js`) and `ObservableCollection` (`./collections/observable-collection.js`), both already in this package. No `mural` import anywhere.
- `SettingKind` MUST remain a real `enum` with exactly these members and string values: `Boolean='boolean'`, `Number='number'`, `String='string'`, `Choice='choice'`, `Color='color'`, `FilePath='filePath'`. (mural's `symbol-table.ts` `ENUM_MEMBERS`/`PROPERTY_TO_ENUM` depend on this exact member set; a later wave retargets the import path, not the shape.)
- House style: OOP; Allman braces (one-line `if (x) return;` stays inline); no inline reused literals hoisted to `private static readonly` PascalCase — but single-use structural tokens (the property-name string each setter passes to `RaisePropertyChanged`) stay inline, matching the existing `ServiceBase`/`observable.test.ts` idiom; PascalCase public members; private members camelCase with leading underscore (`_kind`), matching `ServiceBase`.
- Property set must be a no-op (fire no `PropertyChanged`) when the new value equals the old (`===`), matching the `observable.test.ts` fixture contract.
- Tests live under a `tests/` subfolder. Full suite: `npm test`. Single file: `npx tsx --conditions=development --test src/tests/<file>.test.ts`.

## Review Focus

1. **Equal-value set fires no notification** — a setter that raises unconditionally would spam observers and break the `Observable` contract; covered by Task 1 Step 1 (`does not raise PropertyChanged when the value is unchanged`).
2. **`SettingKind` shape frozen** — if a member is renamed/removed or values change, mural's compiler enum resolution silently breaks in a later wave; covered by Task 1 Step 1 (`SettingKind has the six canonical members with stable string values`).
3. **Re-registration after a resolve** — the exact stale-cache bug: resolve a token, then re-register it; the new registration must win; covered by Task 2 Step 1.
4. **Re-registration invalidates only this provider's cache** — the fix must not disturb parent/child scope caches; covered by Task 2 Step 1b (child scope keeps its own instance).

---

### Task 1: `SettingDefinition` + `SettingKind` in todl-runtime

**Files:**
- Create: `src/setting-definition.ts`
- Create: `src/tests/setting-definition.test.ts`
- Modify: `src/index.ts` (add one export line)

**Interfaces:**
- Consumes: `Observable`, `PropertyChangedEventArgs` from `./observable.js`; `ObservableCollection` from `./collections/observable-collection.js`.
- Produces: `export class SettingDefinition extends Observable` with public PascalCase accessors `Key: string`, `Label: string`, `Description: string`, `Category: string`, `Kind: SettingKind`, `Default: unknown`, `Choices: ObservableCollection<string> | undefined`, `Min: number`, `Max: number`; and `export enum SettingKind` (six members above). Both re-exported from `src/index.ts`. Later waves (mural, engine, plexus-core) import these from `@pragmatic-tech-ai/todl-runtime`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/setting-definition.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingDefinition, SettingKind } from '../setting-definition.js';
import { ObservableCollection } from '../collections/observable-collection.js';
import type { PropertyChangedEventArgs } from '../observable.js';

test('SettingKind has the six canonical members with stable string values', () =>
{
    assert.equal(SettingKind.Boolean, 'boolean');
    assert.equal(SettingKind.Number, 'number');
    assert.equal(SettingKind.String, 'string');
    assert.equal(SettingKind.Choice, 'choice');
    assert.equal(SettingKind.Color, 'color');
    assert.equal(SettingKind.FilePath, 'filePath');
    assert.deepEqual(Object.values(SettingKind).sort(),
        ['boolean', 'choice', 'color', 'filePath', 'number', 'string']);
});

test('SettingDefinition has the documented defaults', () =>
{
    const def = new SettingDefinition();
    assert.equal(def.Key, '');
    assert.equal(def.Label, '');
    assert.equal(def.Description, '');
    assert.equal(def.Category, '');
    assert.equal(def.Kind, SettingKind.String);
    assert.equal(def.Default, undefined);
    assert.equal(def.Choices, undefined);
    assert.equal(def.Min, Number.NEGATIVE_INFINITY);
    assert.equal(def.Max, Number.POSITIVE_INFINITY);
});

test('setting a property raises PropertyChanged with old and new values', () =>
{
    const def = new SettingDefinition();
    const seen: PropertyChangedEventArgs[] = [];
    def.PropertyChanged('Kind').subscribe(a => seen.push(a));
    def.Kind = SettingKind.Color;
    assert.equal(seen.length, 1);
    assert.equal(seen[0].property, 'Kind');
    assert.equal(seen[0].oldValue, SettingKind.String);
    assert.equal(seen[0].newValue, SettingKind.Color);
    assert.equal(def.Kind, SettingKind.Color);
});

test('does not raise PropertyChanged when the value is unchanged', () =>
{
    const def = new SettingDefinition();
    def.Label = 'Theme';
    let count = 0;
    def.PropertyChanged('Label').subscribe(() => count++);
    def.Label = 'Theme';
    assert.equal(count, 0);
});

test('Choices holds an ObservableCollection and raises on assignment', () =>
{
    const def = new SettingDefinition();
    const choices = new ObservableCollection<string>();
    let count = 0;
    def.PropertyChanged('Choices').subscribe(() => count++);
    def.Choices = choices;
    assert.equal(count, 1);
    assert.equal(def.Choices, choices);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/tests/setting-definition.test.ts`
Expected: FAIL — cannot resolve `../setting-definition.js` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/setting-definition.ts`:

```ts
// The settings schema, shared UX-free between the todl engine and the UI.
// Reshaped from mural's DP-backed form into a plain Observable: each field
// is a backing value + PascalCase accessor pair whose setter raises
// PropertyChanged(name) only on a real change. SettingKind stays a real
// enum with stable string values — serialization and mural's compiler
// enum-literal resolution both key off this exact member set.

import { Observable } from './observable.js';
import { ObservableCollection } from './collections/observable-collection.js';

export enum SettingKind
{
    Boolean  = 'boolean',
    Number   = 'number',
    String   = 'string',
    Choice   = 'choice',
    Color    = 'color',
    FilePath = 'filePath',
}

export class SettingDefinition extends Observable
{
    private _key = '';
    private _label = '';
    private _description = '';
    private _category = '';
    private _kind: SettingKind = SettingKind.String;
    private _default: unknown = undefined;
    private _choices: ObservableCollection<string> | undefined = undefined;
    private _min = Number.NEGATIVE_INFINITY;
    private _max = Number.POSITIVE_INFINITY;

    public get Key(): string { return this._key; }
    public set Key(v: string)
    {
        const old = this._key;
        if (old === v) return;
        this._key = v;
        this.RaisePropertyChanged('Key', old, v);
    }

    public get Label(): string { return this._label; }
    public set Label(v: string)
    {
        const old = this._label;
        if (old === v) return;
        this._label = v;
        this.RaisePropertyChanged('Label', old, v);
    }

    public get Description(): string { return this._description; }
    public set Description(v: string)
    {
        const old = this._description;
        if (old === v) return;
        this._description = v;
        this.RaisePropertyChanged('Description', old, v);
    }

    public get Category(): string { return this._category; }
    public set Category(v: string)
    {
        const old = this._category;
        if (old === v) return;
        this._category = v;
        this.RaisePropertyChanged('Category', old, v);
    }

    public get Kind(): SettingKind { return this._kind; }
    public set Kind(v: SettingKind)
    {
        const old = this._kind;
        if (old === v) return;
        this._kind = v;
        this.RaisePropertyChanged('Kind', old, v);
    }

    public get Default(): unknown { return this._default; }
    public set Default(v: unknown)
    {
        const old = this._default;
        if (old === v) return;
        this._default = v;
        this.RaisePropertyChanged('Default', old, v);
    }

    public get Choices(): ObservableCollection<string> | undefined { return this._choices; }
    public set Choices(v: ObservableCollection<string> | undefined)
    {
        const old = this._choices;
        if (old === v) return;
        this._choices = v;
        this.RaisePropertyChanged('Choices', old, v);
    }

    public get Min(): number { return this._min; }
    public set Min(v: number)
    {
        const old = this._min;
        if (old === v) return;
        this._min = v;
        this.RaisePropertyChanged('Min', old, v);
    }

    public get Max(): number { return this._max; }
    public set Max(v: number)
    {
        const old = this._max;
        if (old === v) return;
        this._max = v;
        this.RaisePropertyChanged('Max', old, v);
    }
}
```

- [ ] **Step 4: Add the barrel export**

In `src/index.ts`, add beside the other top-level exports (after the `Observable` export line):

```ts
export { SettingDefinition, SettingKind } from './setting-definition.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/tests/setting-definition.test.ts`
Expected: PASS (5 tests).

Also run `npm run typecheck` — Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/setting-definition.ts src/tests/setting-definition.test.ts src/index.ts
git commit -m "feat(todl-runtime): add SettingDefinition/SettingKind as Observable settings schema"
```

---

### Task 2: Fix `ServiceProvider.registerInstance()` stale-cache bug

**Files:**
- Modify: `src/services/service-provider.ts:114-122` (`register`)
- Test: `src/services/tests/service-provider.test.ts` (append)

**Interfaces:**
- Consumes: `ServiceProvider`, `ServiceKey` from `../service-provider.js`.
- Produces: no API change — `register()` (and therefore `registerInstance`/`registerScoped`/`registerTransient`, which all funnel through it) now evicts any cached instance for the token at this provider, so a re-registration after a resolve takes effect.

**Root cause (already investigated):** `register()` writes `_registrations` but never clears `_cache`. After a singleton/scoped token has been resolved once, its instance is cached (`get()` line 189/200); a later `registerInstance(token, newInstance)` updates the factory but `get()` returns the stale cached value. Fix: evict the token from `this._cache` inside `register()`.

- [ ] **Step 1: Write the failing test**

Append to `src/services/tests/service-provider.test.ts`:

```ts
test('registerInstance after a resolve replaces the cached instance', () =>
{
    const key = new ServiceKey<{ id: number }>('Thing');
    const provider = new ServiceProvider();
    provider.registerInstance(key, { id: 1 });
    assert.equal(provider.getRequired(key).id, 1); // resolve → caches {id:1}
    provider.registerInstance(key, { id: 2 });      // re-register under the resolved token
    assert.equal(provider.getRequired(key).id, 2); // must see the new instance, not the stale cache
});

test('re-registering at a parent does not disturb a child scope cache', () =>
{
    const key = new ServiceKey<{ id: number }>('Scoped');
    const parent = new ServiceProvider();
    parent.registerInstance(key, { id: 1 });
    const child = parent.createScope();
    assert.equal(child.getRequired(key).id, 1);
    parent.registerInstance(key, { id: 2 });
    assert.equal(parent.getRequired(key).id, 2); // parent sees new
    assert.equal(child.getRequired(key).id, 2);  // child re-resolves from parent owner (no stale child copy of a parent singleton)
});
```

Confirm the file's existing imports already include `ServiceProvider`, `ServiceKey`, `test`, and `assert` (the file has other `ServiceProvider` tests); if `ServiceKey` is not yet imported, add it to the existing import from `../service-provider.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/services/tests/service-provider.test.ts`
Expected: FAIL — first new test gets `id` `1`, expected `2` (stale cache returned).

- [ ] **Step 3: Write minimal implementation**

In `src/services/service-provider.ts`, `register()` — evict any cached instance for the token at this provider so the new registration wins:

```ts
    public register<T>(
        token:     ServiceToken<T>,
        factory:   ServiceFactory<T>,
        lifetime:  ServiceLifetime = ServiceLifetime.Singleton,
    ): this
    {
        // Re-registration supersedes any instance cached here under this
        // token (e.g. a test swapping a fake in after a resolve); without
        // the eviction get() would keep returning the stale cached value.
        this._cache.delete(token);
        this._registrations.set(token, { lifetime, factory: factory as ServiceFactory<unknown> });
        return this;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/services/tests/service-provider.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/services/service-provider.ts src/services/tests/service-provider.test.ts
git commit -m "fix(todl-runtime): register() evicts stale cached instance on re-registration"
```

---

## Done when

Both tasks complete, `npm test` green across the whole suite, `npm run typecheck` clean, `npm run build` clean. Then the branch goes through finishing-a-development-branch (merge to main), and todl-runtime publishes a minor bump (0.6.0 → 0.7.0) for the C2 chain — a human-gated step (pre-authorized this session).
