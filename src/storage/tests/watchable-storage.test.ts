import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeStorage } from '../fake-storage.js';
import { isWatchableStorage, FileChangeKind, type FileChange } from '../storage.js';
import { NodeFsStorage } from '../node-fs-storage.js';

test('FakeStorage.Watch delivers injected FileChanges to a folder subscriber; dispose stops them', () =>
{
    const s = new FakeStorage();
    assert.equal(isWatchableStorage(s), true);
    const seen: FileChange[] = [];
    const off = s.Watch('', (c) => seen.push(c));
    s.EmitFileChange('a.txt', FileChangeKind.Added, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].Path, 'a.txt');
    assert.equal(seen[0].Kind, FileChangeKind.Added);
    off();
    s.EmitFileChange('b.txt', FileChangeKind.Added, false);
    assert.equal(seen.length, 1);                          // no delivery after dispose
});

test('NodeFsStorage.Watch reports a real file creation', async () =>
{
    const dir = await mkdtemp(join(tmpdir(), 'watchfs-'));
    const s = new NodeFsStorage(dir);
    const seen: FileChange[] = [];
    const off = s.Watch('', (c) => seen.push(c));
    try
    {
        // chokidar ignores files that appear during its initial scan (ignoreInitial),
        // and readiness is not observable through the Watch abstraction — allow a bounded
        // init window before creating the file so the add is seen as a live change.
        await new Promise((r) => setTimeout(r, 400));
        await writeFile(join(dir, 'a.txt'), 'hi');
        await waitFor(() => seen.some((c) => c.Path === 'a.txt' && c.Kind === FileChangeKind.Added));
    }
    finally { off(); await rm(dir, { recursive: true, force: true }); }
});

// Poll a condition instead of sleeping a fixed time (fs events are timing-sensitive).
async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<void>
{
    const start = Date.now();
    while (!cond())
    {
        if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
        await new Promise((r) => setTimeout(r, 25));
    }
}
