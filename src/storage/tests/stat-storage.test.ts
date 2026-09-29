import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeStorage } from '../fake-storage.js';
import { isStatStorage } from '../storage.js';
import { NodeFsStorage } from '../node-fs-storage.js';

test('FakeStorage stats a written file with a stable nonzero ino; guard passes', async () =>
{
    const s = new FakeStorage();
    assert.equal(isStatStorage(s), true);
    await s.WriteText('a.txt', 'hi');
    const st1 = await s.Stat('a.txt');
    assert.equal(st1.IsDirectory, false);
    assert.notEqual(st1.Ino, '');
    const st2 = await s.Stat('a.txt');
    assert.equal(st2.Ino, st1.Ino);                        // stable across calls
});

test('FakeStorage.SetInoUnavailable forces an empty ino (unsupported-FS simulation)', async () =>
{
    const s = new FakeStorage();
    await s.WriteText('a.txt', 'hi');
    s.SetInoUnavailable('a.txt');
    assert.equal((await s.Stat('a.txt')).Ino, '');
});

test('NodeFsStorage stats a real file with a nonzero ino', async () =>
{
    const dir = await mkdtemp(join(tmpdir(), 'statfs-'));
    try
    {
        await writeFile(join(dir, 'a.txt'), 'hi');
        const s = new NodeFsStorage(dir);
        const st = await s.Stat('a.txt');
        assert.equal(st.IsDirectory, false);
        assert.equal(st.Size, 2);
        assert.notEqual(st.Ino, '');                       // NTFS/dev box gives a file id
    }
    finally { await rm(dir, { recursive: true, force: true }); }
});
