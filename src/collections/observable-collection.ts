// observable-collection.ts — a headless observable list for todl-runtime.
//
// A mutable list that notifies subscribers of structural changes, mirroring the
// mural ObservableCollection surface + change protocol so it is a drop-in for
// both headless engine state (Solution.Members, ProjectNode.Children) and, at the
// presentation boundary, UI binding. No mural dependency — todl stands alone.

export type CollectionChange<T> =
    | { kind: 'inserted'; index: number; items: readonly T[] }
    | { kind: 'removed';  index: number; items: readonly T[] }
    | { kind: 'replaced'; index: number; oldItem: T; newItem: T }
    | { kind: 'moved';    oldIndex: number; newIndex: number; item: T }
    | { kind: 'cleared' }
    | { kind: 'reset' }

export type CollectionChangeListener<T> = (change: CollectionChange<T>) => void

// The read-only slice consumers bind to — count, indexed access, iteration, and
// change subscription, without the mutation surface.
export interface IReadOnlyObservableCollection<T> extends Iterable<T>
{
    readonly Count: number
    Get(index: number): T | undefined
    IndexOf(item: T): number
    Subscribe(listener: CollectionChangeListener<T>): () => void
}

export class ObservableCollection<T> implements IReadOnlyObservableCollection<T>
{
    private readonly items: T[]
    private readonly listeners = new Set<CollectionChangeListener<T>>()
    private suspendDepth = 0
    private dirtyDuringSuspend = false

    constructor(initial: readonly T[] = [])
    {
        this.items = [...initial]
    }

    public get Count(): number { return this.items.length }
    public Get(index: number): T | undefined { return this.items[index] }
    public IndexOf(item: T): number { return this.items.indexOf(item) }
    public [Symbol.iterator](): Iterator<T> { return this.items[Symbol.iterator]() }
    public ToArray(): T[] { return [...this.items] }

    public Add(item: T): void
    {
        this.items.push(item)
        this.notify({ kind: 'inserted', index: this.items.length - 1, items: [item] })
    }

    public Insert(index: number, item: T): void
    {
        this.items.splice(index, 0, item)
        this.notify({ kind: 'inserted', index, items: [item] })
    }

    public RemoveAt(index: number): T | undefined
    {
        if (index < 0 || index >= this.items.length) return undefined
        const [removed] = this.items.splice(index, 1)
        this.notify({ kind: 'removed', index, items: [removed] })
        return removed
    }

    public Remove(item: T): boolean
    {
        const index = this.items.indexOf(item)
        if (index === -1) return false
        this.RemoveAt(index)
        return true
    }

    public SetAt(index: number, item: T): T | undefined
    {
        if (index < 0 || index >= this.items.length) return undefined
        const oldItem = this.items[index]!
        this.items[index] = item
        this.notify({ kind: 'replaced', index, oldItem, newItem: item })
        return oldItem
    }

    public Move(oldIndex: number, newIndex: number): void
    {
        const [item] = this.items.splice(oldIndex, 1)
        this.items.splice(newIndex, 0, item!)
        this.notify({ kind: 'moved', oldIndex, newIndex, item: item! })
    }

    public Clear(): void
    {
        this.items.length = 0
        this.notify({ kind: 'cleared' })
    }

    // Coalesce a burst of mutations into a single 'reset' — subscribers rebuild
    // once instead of per-mutation. Re-entrant (depth-counted).
    public Batch(mutate: () => void): void
    {
        this.suspendDepth++
        try { mutate() }
        finally
        {
            this.suspendDepth--
            if (this.suspendDepth === 0 && this.dirtyDuringSuspend)
            {
                this.dirtyDuringSuspend = false
                this.emit({ kind: 'reset' })
            }
        }
    }

    public Subscribe(listener: CollectionChangeListener<T>): () => void
    {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    private notify(change: CollectionChange<T>): void
    {
        if (this.suspendDepth > 0) { this.dirtyDuringSuspend = true; return }
        this.emit(change)
    }

    private emit(change: CollectionChange<T>): void
    {
        for (const listener of [...this.listeners]) listener(change)
    }
}
