import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeStorage } from '../fake-storage.js'

test('FakeStorage round-trips text and lists a directory', async () => {
    const s = new FakeStorage()
    await s.WriteText('a/b.txt', 'hi')
    assert.equal(await s.ReadText('a/b.txt'), 'hi')
    const entries = await s.List('a')
    assert.deepEqual([...entries], [{ Name: 'b.txt', IsDirectory: false }])
})

test('FakeStorage Delete removes a subtree', async () => {
    const s = new FakeStorage()
    await s.WriteText('d/x', '1'); await s.WriteText('d/e/y', '2')
    await s.Delete('d')
    assert.equal(await s.Exists('d/x'), false)
    assert.equal(await s.Exists('d/e/y'), false)
})
