import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    ServiceProvider,
    ServiceKey,
    ServiceLifetime,
    type IServiceProvider,
    type IServiceContainer,
} from '../service-provider.js';

// An interface-shaped contract keyed by a typed token (no runtime class).
interface Clock { now(): number; }
const ClockKey = new ServiceKey<Clock>('Clock');

interface Storage { Get(k: string): string | null; }
const StorageKey = new ServiceKey<Storage>('Storage');

// A class-shaped service keyed by its own class reference.
class Counter
{
    public count = 0;
    public tick(): number { return ++this.count; }
}

describe('ServiceProvider — registration + resolution', () => {

    test('implements both halves: compose via IServiceContainer, resolve via IServiceProvider', () => {
        // The same object satisfies both contracts; a collaborator can ask
        // for only the half it needs. Compose through the container view…
        const sp = new ServiceProvider();
        const container: IServiceContainer = sp;
        const clock: Clock = { now: () => 7 };
        const chained = container.registerInstance(ClockKey, clock).register(Counter, () => new Counter());
        assert.equal(chained, sp, 'registration returns the container for chaining');

        // …then resolve through the provider view (no register* reachable here).
        const provider: IServiceProvider = sp;
        assert.equal(provider.getRequired(ClockKey).now(), 7);
        assert.ok(provider.get(Counter) instanceof Counter);
        assert.ok(provider.has(ClockKey));

        // createScope() via the container contract yields another container.
        const scope: IServiceContainer = container.createScope();
        assert.ok(scope !== container);
    });

    test('registerInstance round-trips through get / getRequired', () => {
        const sp = new ServiceProvider();
        const clock: Clock = { now: () => 42 };
        sp.registerInstance(ClockKey, clock);

        assert.equal(sp.get(ClockKey), clock);
        assert.equal(sp.getRequired(ClockKey), clock);
        assert.equal(sp.getRequired(ClockKey).now(), 42);
    });

    test('addInstance derives the token from the instance constructor', () => {
        const sp = new ServiceProvider();
        // No static Key → the class itself is the token.
        const c = new Counter();
        sp.addInstance(c);
        assert.equal(sp.get(Counter), c);
        assert.equal(ServiceProvider.tokenFor(Counter), Counter);
    });

    test('addInstance honours a static Key, incl. inherited (subclass shadows base token)', () => {
        class Keyed { static readonly Key = new ServiceKey('Keyed'); }
        class SubKeyed extends Keyed { }
        const sp = new ServiceProvider();
        const sub = new SubKeyed();
        sp.addInstance(sub);
        // Registered under the inherited Key, not the subclass.
        assert.equal(sp.get(Keyed.Key), sub);
        assert.equal(ServiceProvider.tokenFor(SubKeyed), Keyed.Key);
    });

    test('get returns undefined / getRequired throws for an unregistered token', () => {
        const sp = new ServiceProvider();
        assert.equal(sp.get(ClockKey), undefined);
        assert.equal(sp.has(ClockKey), false);
        assert.throws(() => sp.getRequired(ClockKey), /no service registered for ServiceKey\(Clock\)/);
    });

    test('a class reference is itself a valid token', () => {
        const sp = new ServiceProvider();
        sp.register(Counter, () => new Counter());
        const c = sp.getRequired(Counter);
        assert.ok(c instanceof Counter);
        assert.equal(c.tick(), 1);
        // Same singleton instance on the next resolve.
        assert.equal(sp.getRequired(Counter), c);
        assert.equal(c.count, 1);
    });

    test('getRequired error names a class token by its class name', () => {
        const sp = new ServiceProvider();
        assert.throws(() => sp.getRequired(Counter), /no service registered for Counter/);
    });
});

describe('ServiceProvider — lifetimes', () => {

    test('singleton: one lazily-built instance, cached across resolves', () => {
        const sp = new ServiceProvider();
        let builds = 0;
        sp.register(Counter, () => { builds++; return new Counter(); }, ServiceLifetime.Singleton);

        const a = sp.getRequired(Counter);
        const b = sp.getRequired(Counter);
        assert.equal(a, b);
        assert.equal(builds, 1, 'factory ran once');
    });

    test('transient: a fresh instance on every resolve', () => {
        const sp = new ServiceProvider();
        let builds = 0;
        sp.registerTransient(Counter, () => { builds++; return new Counter(); });

        const a = sp.getRequired(Counter);
        const b = sp.getRequired(Counter);
        assert.notEqual(a, b);
        assert.equal(builds, 2);
    });

    test('factories compose dependencies through the provider', () => {
        const sp = new ServiceProvider();
        sp.registerInstance(ClockKey, { now: () => 7 });
        // A service whose factory pulls another service.
        const StampKey = new ServiceKey<{ at: number }>('Stamp');
        sp.register(StampKey, p => ({ at: p.getRequired(ClockKey).now() }));
        assert.equal(sp.getRequired(StampKey).at, 7);
    });
});

describe('ServiceProvider — hierarchy (scopes)', () => {

    test('child resolves locally first, then falls back to the parent', () => {
        const root = new ServiceProvider();
        root.registerInstance(ClockKey,   { now: () => 1 });
        root.registerInstance(StorageKey, { Get: () => 'root' });

        const scope = root.createScope();
        scope.registerInstance(ClockKey, { now: () => 2 });   // shadow

        assert.equal(scope.getRequired(ClockKey).now(), 2, 'child override wins');
        assert.equal(scope.getRequired(StorageKey).Get('x'), 'root', 'falls back to parent');
        assert.equal(root.getRequired(ClockKey).now(), 1, 'parent unaffected by child shadow');
    });

    test('singleton is cached at the owner and shared by every child scope', () => {
        const root = new ServiceProvider();
        let builds = 0;
        root.register(Counter, () => { builds++; return new Counter(); }, ServiceLifetime.Singleton);

        const s1 = root.createScope();
        const s2 = root.createScope();
        const fromS1 = s1.getRequired(Counter);
        const fromS2 = s2.getRequired(Counter);
        const fromRoot = root.getRequired(Counter);

        assert.equal(fromS1, fromS2, 'scopes share the root singleton');
        assert.equal(fromS1, fromRoot);
        assert.equal(builds, 1, 'root singleton built exactly once');
    });

    test('scoped: one instance per scope, distinct across scopes', () => {
        const root = new ServiceProvider();
        let builds = 0;
        root.registerScoped(Counter, () => { builds++; return new Counter(); });

        const s1 = root.createScope();
        const s2 = root.createScope();

        const a1 = s1.getRequired(Counter);
        const a2 = s1.getRequired(Counter);   // same scope → same instance
        const b1 = s2.getRequired(Counter);   // other scope → different instance

        assert.equal(a1, a2, 'one instance within a scope');
        assert.notEqual(a1, b1, 'different scope → different instance');
        assert.equal(builds, 2, 'one build per scope');
    });

    test('scoped chains land in the same scope', () => {
        const root = new ServiceProvider();
        root.registerScoped(Counter, () => new Counter());
        const HolderKey = new ServiceKey<{ counter: Counter }>('Holder');
        root.registerScoped(HolderKey, p => ({ counter: p.getRequired(Counter) }));

        const scope = root.createScope();
        const holder = scope.getRequired(HolderKey);
        const direct = scope.getRequired(Counter);
        assert.equal(holder.counter, direct, 'holder and direct share the scope instance');
    });

    test('has() walks the parent chain', () => {
        const root = new ServiceProvider();
        root.registerInstance(ClockKey, { now: () => 0 });
        const scope = root.createScope();
        assert.equal(scope.has(ClockKey), true);
        assert.equal(scope.has(StorageKey), false);
    });
});
