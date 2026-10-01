import test from 'node:test'
import assert from 'node:assert/strict'
import { ServiceProvider, FakeStorage, MapPropertyBag, EnvironmentKey, StorageProviderKey, OperatingSystem, type IEnvironment, type PropertyAccessor } from '../../index.js'
import { DurableApplicationStore } from '../durable-application-store.js'

// A minimal IEnvironment stand-in: only UserDataDirectory matters to this store,
// but the interface is fully required, so every other field gets an inert default.
const FakeEnvironment: IEnvironment = {
    CurrentDirectory: '/data',
    HomeDirectory: '/data',
    TempDirectory: '/data',
    UserDataDirectory: '/data',
    DocumentsDirectory: '/data',
    DownloadsDirectory: '/data',
    Platform: OperatingSystem.Linux,
    Architecture: 'x64',
    PathSeparator: '/',
    IsWindows: false,
    AppVersion: '0.0.0',
    ElectronVersion: '',
    ChromeVersion: '',
    NodeVersion: '',
    IsDevelopment: true,
    IsPackaged: false,
}

function bagOf(seed: Record<string, unknown>): { bag: MapPropertyBag; values: Record<string, unknown> }
{
    const values = { ...seed }
    const acc = new Map<string, PropertyAccessor>()
    for (const name of Object.keys(seed))
    {
        acc.set(name, { id: () => name, displayName: () => name, get: () => values[name], set: (v) => { values[name] = v } })
    }
    return { bag: new MapPropertyBag(acc), values }
}

function providerWith(storage: FakeStorage): ServiceProvider
{
    const p = new ServiceProvider()
    p.registerInstance(EnvironmentKey, FakeEnvironment)
    p.registerInstance(StorageProviderKey, { CreateStorage: () => storage })
    return p
}

test('DurableApplicationStore round-trips a registered bag across Save + a fresh Restore', async () =>
{
    const storage = new FakeStorage('/data')
    const a = new DurableApplicationStore(providerWith(storage))
    const { bag, values } = bagOf({ token: 'x', count: 1 })
    a.Register('k', bag)
    values.token = 'y'; values.count = 2
    await a.Save()
    const b = new DurableApplicationStore(providerWith(storage))
    const { bag: bag2, values: v2 } = bagOf({ token: '', count: 0 })
    b.Register('k', bag2)
    await b.Restore()
    assert.equal(v2.token, 'y')
    assert.equal(v2.count, 2)
})

test('DurableApplicationStore: a missing/corrupt document restores to empty, not a throw', async () =>
{
    const storage = new FakeStorage('/data')
    await storage.WriteText('application-bags.json', '{ not json')
    const a = new DurableApplicationStore(providerWith(storage))
    await assert.doesNotReject(a.Restore())
})
