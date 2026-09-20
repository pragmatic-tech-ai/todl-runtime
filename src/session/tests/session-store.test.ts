import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceProvider } from '../../services/service-provider.js';
import { EnvironmentKey, type IEnvironment } from '../../environment.js';
import { StorageProviderKey, type IStorageProvider } from '../../storage/storage-provider.js';
import { FakeStorage } from '../../storage/fake-storage.js';
import { MapPropertyBag, type PropertyAccessor } from '../../property-bag.js';
import { SessionStore } from '../session-store.js';

const USER_DIR = 'fake://userdata';

function harness(): { provider: ServiceProvider; storage: FakeStorage }
{
    const provider = new ServiceProvider();
    const storage = new FakeStorage(USER_DIR);
    provider.registerInstance(EnvironmentKey, {
        UserDataDirectory: USER_DIR,
    } as unknown as IEnvironment);
    const sp: IStorageProvider = { CreateStorage: () => storage };
    provider.registerInstance(StorageProviderKey, sp);
    return { provider, storage };
}

// A writable/read-only MapPropertyBag over a plain record, for test registrants.
function bagOf(
    values: Record<string, unknown>,
    readOnly: ReadonlySet<string> = new Set(),
): MapPropertyBag
{
    const store: Record<string, unknown> = { ...values };
    const accessors = new Map<string, PropertyAccessor>();
    for (const name of Object.keys(store))
    {
        accessors.set(
            name,
            readOnly.has(name)
                ? { id: () => name, displayName: () => name, get: () => store[name] }
                : {
                      id: () => name,
                      displayName: () => name,
                      get: () => store[name],
                      set: (v) => {
                          store[name] = v;
                      },
                  },
        );
    }
    return new MapPropertyBag(accessors);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function seed(storage: FakeStorage, doc: unknown): Promise<void>
{
    await storage.WriteText('session.json', JSON.stringify(doc));
}

describe('SessionStore — restore', () => {
    test('Restore applies a stored slice into a registered bag', async () => {
        const { provider, storage } = harness();
        await seed(storage, { 'diagram.camera': { Zoom: 2, PanX: 5 } });
        const store = new SessionStore(provider);
        const bag = bagOf({ Zoom: 1, PanX: 0 });
        store.Register('diagram.camera', bag);
        await store.Restore();
        assert.equal(bag.GetValue('Zoom'), 2);
        assert.equal(bag.GetValue('PanX'), 5);
    });

    test('a bag registered AFTER Restore gets its slice applied immediately', async () => {
        const { provider, storage } = harness();
        await seed(storage, { 'panel.layout': { Width: 320 } });
        const store = new SessionStore(provider);
        await store.Restore();
        const bag = bagOf({ Width: 0 });
        store.Register('panel.layout', bag);
        assert.equal(bag.GetValue('Width'), 320);
    });

    test('read-only and unknown property names are skipped on restore', async () => {
        const { provider, storage } = harness();
        await seed(storage, { k: { RO: 'stored', Unknown: 1, Ok: 'x' } });
        const store = new SessionStore(provider);
        const bag = bagOf({ RO: 'initial', Ok: '' }, new Set(['RO']));
        store.Register('k', bag);
        await store.Restore();
        assert.equal(bag.GetValue('RO'), 'initial'); // read-only, untouched
        assert.equal(bag.GetValue('Ok'), 'x'); // writable, applied
    });

    test('a missing session.json restores to empty without throwing', async () => {
        const { provider } = harness();
        const store = new SessionStore(provider);
        const bag = bagOf({ A: 1 });
        store.Register('k', bag);
        await store.Restore();
        assert.equal(bag.GetValue('A'), 1);
    });

    test('a corrupt session.json restores to empty without throwing', async () => {
        const { provider, storage } = harness();
        await storage.WriteText('session.json', '{ not json');
        const store = new SessionStore(provider);
        const bag = bagOf({ A: 1 });
        store.Register('k', bag);
        await store.Restore();
        assert.equal(bag.GetValue('A'), 1);
    });
});

describe('SessionStore — save', () => {
    test('Save writes captured bag values to session.json', async () => {
        const { provider, storage } = harness();
        const store = new SessionStore(provider);
        store.Register('diagram.camera', bagOf({ Zoom: 3, PanX: 7 }));
        await store.Save();
        const doc = JSON.parse(await storage.ReadText('session.json'));
        assert.deepEqual(doc['diagram.camera'], { Zoom: 3, PanX: 7 });
    });

    test('Save preserves unknown top-level keys from the loaded doc', async () => {
        const { provider, storage } = harness();
        await seed(storage, { 'old.feature': { Kept: true } });
        const store = new SessionStore(provider);
        await store.Restore();
        store.Register('new.feature', bagOf({ Fresh: 1 }));
        await store.Save();
        const doc = JSON.parse(await storage.ReadText('session.json'));
        assert.deepEqual(doc['old.feature'], { Kept: true });
        assert.deepEqual(doc['new.feature'], { Fresh: 1 });
    });

    test('a bag change schedules a debounced Save', async () => {
        const { provider, storage } = harness();
        const store = new SessionStore(provider, 0); // 0ms debounce for the test
        const bag = bagOf({ Zoom: 1 });
        store.Register('diagram.camera', bag);
        bag.SetValue('Zoom', 9);
        await delay(10);
        const doc = JSON.parse(await storage.ReadText('session.json'));
        assert.equal(doc['diagram.camera'].Zoom, 9);
    });
});

describe('SessionStore — registration lifecycle', () => {
    test('registering the same key twice throws', () => {
        const { provider } = harness();
        const store = new SessionStore(provider);
        store.Register('k', bagOf({ A: 1 }));
        assert.throws(() => store.Register('k', bagOf({ A: 2 })), /already registered/);
    });

    test('unregister captures final values and detaches change listeners', async () => {
        const { provider, storage } = harness();
        const store = new SessionStore(provider, 0);
        const bag = bagOf({ Zoom: 1 });
        const reg = store.Register('diagram.camera', bag);
        bag.SetValue('Zoom', 4);
        reg.dispose();
        // Final value captured; a Save writes it.
        await store.Save();
        const doc = JSON.parse(await storage.ReadText('session.json'));
        assert.equal(doc['diagram.camera'].Zoom, 4);
        // No listeners remain on the bag's change channel.
        assert.equal(bag.Observe('Zoom').subscriberCount, 0);
    });
});
