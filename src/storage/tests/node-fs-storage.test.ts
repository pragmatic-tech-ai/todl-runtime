import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFsStorage } from '../node-fs-storage.js'
import { compareStorageEntries, type StorageEntry } from '../storage.js'

// A NodeFsStorage rooted at a fresh OS temp dir, cleaned up after the test.
async function tempStorage(t: TestContext): Promise<NodeFsStorage> {
    const dir = await mkdtemp(join(tmpdir(), 'todl-fs-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    return new NodeFsStorage(dir)
}

const sorted = (e: readonly StorageEntry[]): StorageEntry[] => [...e].sort(compareStorageEntries)

test('round-trips text and lists a directory', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('a/b.txt', 'hi')
    assert.equal(await s.ReadText('a/b.txt'), 'hi')
    assert.deepEqual([...await s.List('a')], [{ Name: 'b.txt', IsDirectory: false }])
})

test('WriteText creates missing parent directories', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('deep/nested/x.txt', 'ok')
    assert.equal(await s.ReadText('deep/nested/x.txt'), 'ok')
    assert.equal(await s.Exists('deep/nested'), true)
})

test('round-trips raw bytes losslessly (binary-safe)', async (t) => {
    const s = await tempStorage(t)
    const bytes = Uint8Array.from([0, 1, 2, 254, 255])
    await s.WriteBytes('blob.bin', bytes)
    assert.deepEqual(await s.ReadBytes('blob.bin'), bytes)
})

test('Exists is true for a file, true for a directory, false for a missing path', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('f.txt', 'x')
    await s.CreateDirectory('d')
    assert.equal(await s.Exists('f.txt'), true)
    assert.equal(await s.Exists('d'), true)
    assert.equal(await s.Exists('nope'), false)
})

test('Delete removes a whole subtree', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('d/x', '1')
    await s.WriteText('d/e/y', '2')
    await s.Delete('d')
    assert.equal(await s.Exists('d/x'), false)
    assert.equal(await s.Exists('d/e/y'), false)
    assert.equal(await s.Exists('d'), false)
})

test('CreateDirectory is recursive and idempotent', async (t) => {
    const s = await tempStorage(t)
    await s.CreateDirectory('a/b/c')
    await s.CreateDirectory('a/b/c')   // second call must not throw
    assert.equal(await s.Exists('a/b/c'), true)
})

test('Rename moves a file', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('old.txt', 'v')
    await s.Rename('old.txt', 'new.txt')
    assert.equal(await s.Exists('old.txt'), false)
    assert.equal(await s.ReadText('new.txt'), 'v')
})

test('Rename moves a directory with its contents', async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('src/a.txt', '1')
    await s.WriteText('src/sub/b.txt', '2')
    await s.Rename('src', 'dst')
    assert.equal(await s.Exists('src'), false)
    assert.equal(await s.ReadText('dst/a.txt'), '1')
    assert.equal(await s.ReadText('dst/sub/b.txt'), '2')
})

test("List('') lists the root, non-recursive, marking directories", async (t) => {
    const s = await tempStorage(t)
    await s.WriteText('c.txt', 'x')
    await s.WriteText('a/deep.txt', 'y')   // 'a' is a dir; 'deep.txt' must NOT appear at root
    assert.deepEqual(sorted(await s.List('')), [
        { Name: 'a', IsDirectory: true },
        { Name: 'c.txt', IsDirectory: false },
    ])
})

test('List returns empty for a missing directory (contract parity with FakeStorage)', async (t) => {
    const s = await tempStorage(t)
    assert.deepEqual([...await s.List('does/not/exist')], [])
})

test('ReadText rejects for a missing file', async (t) => {
    const s = await tempStorage(t)
    await assert.rejects(() => s.ReadText('ghost.txt'))
})

test('Root reports where the storage is rooted', async (t) => {
    const s = await tempStorage(t)
    assert.equal(typeof s.Root, 'string')
    assert.ok(s.Root.length > 0)
})
