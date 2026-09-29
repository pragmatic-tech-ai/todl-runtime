import { readFile, writeFile, mkdir, rm, rename, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { watch } from 'chokidar'
import type { IStorage, IStatStorage, IWatchableStorage, FileStat, FileChange, StorageEntry } from './storage.js'
import { FileChangeKind } from './storage.js'

// NodeFsStorage — a headless, disk-backed IStorage over node:fs/promises, rooted at
// an absolute OS folder. Every path is project-relative POSIX ('' addresses the root);
// this backend joins it onto the root and translates separators. No Electron, so `todl`
// can open/build solutions on a CLI/server/test with no host plumbing.
export class NodeFsStorage implements IStorage, IStatStorage, IWatchableStorage
{
    public readonly Root: string

    constructor(root: string)
    {
        this.Root = root
    }

    public async ReadText(path: string): Promise<string>
    {
        return readFile(this.resolve(path), 'utf8')
    }

    public async ReadBytes(path: string): Promise<Uint8Array>
    {
        return Uint8Array.from(await readFile(this.resolve(path)))
    }

    public async WriteText(path: string, content: string): Promise<void>
    {
        const abs = this.resolve(path)
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, content, 'utf8')
    }

    public async WriteBytes(path: string, bytes: Uint8Array): Promise<void>
    {
        const abs = this.resolve(path)
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, bytes)
    }

    public async Exists(path: string): Promise<boolean>
    {
        try { await stat(this.resolve(path)); return true }
        catch { return false }
    }

    public async Delete(path: string): Promise<void>
    {
        await rm(this.resolve(path), { recursive: true, force: true })
    }

    public async CreateDirectory(path: string): Promise<void>
    {
        await mkdir(this.resolve(path), { recursive: true })
    }

    public async Rename(from: string, to: string): Promise<void>
    {
        const dst = this.resolve(to)
        await mkdir(dirname(dst), { recursive: true })
        await rename(this.resolve(from), dst)
    }

    public async Stat(path: string): Promise<FileStat>
    {
        const s = await stat(this.resolve(path))
        return {
            IsDirectory: s.isDirectory(),
            Ino: s.ino === 0 ? '' : String(s.ino),
            Dev: s.dev === 0 ? '' : String(s.dev),
            Size: s.size,
            MtimeMs: s.mtimeMs,
        }
    }

    public async List(path: string): Promise<readonly StorageEntry[]>
    {
        // A missing directory lists as empty (contract parity with FakeStorage) —
        // callers walk optional folders (resource scans, copy) without pre-checking.
        try
        {
            const entries = await readdir(this.resolve(path), { withFileTypes: true })
            return entries.map((e) => ({ Name: e.name, IsDirectory: e.isDirectory() }))
        }
        catch (e)
        {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
            throw e
        }
    }

    public Watch(path: string, sink: (change: FileChange) => void): () => void
    {
        const base = this.resolve(path)
        const watcher = watch(base, { depth: 0, ignoreInitial: true })
        const rel = (abs: string): string =>
            relative(this.Root, abs).split(sep).filter((s) => s !== '').join('/')
        const emit = (kind: FileChangeKind, isDir: boolean) => (abs: string): void =>
        {
            sink({ Kind: kind, Path: rel(abs), IsDirectory: isDir })
        }
        watcher.on('add', emit(FileChangeKind.Added, false))
        watcher.on('addDir', emit(FileChangeKind.Added, true))
        watcher.on('unlink', emit(FileChangeKind.Removed, false))
        watcher.on('unlinkDir', emit(FileChangeKind.Removed, true))
        watcher.on('change', emit(FileChangeKind.Changed, false))
        return () => { void watcher.close() }
    }

    // Project-relative POSIX path → absolute OS path under the root. '' → the root.
    // Separators are split and rejoined with the OS separator; '' and '.' segments
    // are dropped so leading/trailing/duplicate slashes normalize away.
    private resolve(path: string): string
    {
        const segments = path.split(/[\\/]+/).filter((s) => s !== '' && s !== '.')
        return segments.length === 0 ? this.Root : join(this.Root, segments.join(sep))
    }
}
