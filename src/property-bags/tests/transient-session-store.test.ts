import test from 'node:test'
import assert from 'node:assert/strict'
import { ServiceProvider, MapPropertyBag, type PropertyAccessor } from '../../index.js'
import { TransientSessionStore } from '../transient-session-store.js'

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

test('TransientSessionStore keeps values within a run but a fresh instance restores nothing', async () =>
{
    const t = new TransientSessionStore(new ServiceProvider())
    const { bag, values } = bagOf({ tab: 'a' })
    t.Register('view', bag)
    values.tab = 'b'
    await t.Save()                         // no-op, no throw
    const t2 = new TransientSessionStore(new ServiceProvider())
    const { bag: bag2, values: v2 } = bagOf({ tab: 'z' })
    t2.Register('view', bag2)
    await t2.Restore()                     // no-op
    assert.equal(v2.tab, 'z')              // nothing persisted across instances
})
