import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceProvider } from '../../services/service-provider.js';
import { FakeStorage } from '../fake-storage.js';
import { StorageProviderKey, type IStorageProvider } from '../storage-provider.js';

test('a registered IStorageProvider resolves and builds a storage rooted at the location', () => {
    const provider = new ServiceProvider();
    const impl: IStorageProvider = { CreateStorage: (location) => new FakeStorage(location) };
    provider.registerInstance(StorageProviderKey, impl);

    const storage = provider.getRequired(StorageProviderKey).CreateStorage('fake://userdata');
    assert.equal(storage.Root, 'fake://userdata');
});
