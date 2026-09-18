import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ObservableCollection, type CollectionChange } from '../observable-collection.js'

test('constructor seeds initial items', () => {
    const c = new ObservableCollection<number>([1, 2, 3])
    assert.equal(c.Count, 3)
    assert.deepEqual(c.ToArray(), [1, 2, 3])
})

test('Add appends and is reflected in Count / Get / iteration', () => {
    const c = new ObservableCollection<string>()
    c.Add('a'); c.Add('b')
    assert.equal(c.Count, 2)
    assert.equal(c.Get(1), 'b')
    assert.deepEqual([...c], ['a', 'b'])
})

test('Insert places an item at the index', () => {
    const c = new ObservableCollection<string>(['a', 'c'])
    c.Insert(1, 'b')
    assert.deepEqual(c.ToArray(), ['a', 'b', 'c'])
})

test('Remove deletes a present item and returns true, false when absent', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    assert.equal(c.Remove('a'), true)
    assert.equal(c.Remove('z'), false)
    assert.deepEqual(c.ToArray(), ['b'])
})

test('RemoveAt removes and returns the item at the index', () => {
    const c = new ObservableCollection<string>(['a', 'b', 'c'])
    assert.equal(c.RemoveAt(1), 'b')
    assert.deepEqual(c.ToArray(), ['a', 'c'])
})

test('IndexOf returns the index or -1', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    assert.equal(c.IndexOf('b'), 1)
    assert.equal(c.IndexOf('z'), -1)
})

test('SetAt replaces and returns the old item', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    assert.equal(c.SetAt(1, 'B'), 'b')
    assert.deepEqual(c.ToArray(), ['a', 'B'])
})

test('Move relocates an item', () => {
    const c = new ObservableCollection<string>(['a', 'b', 'c'])
    c.Move(0, 2)
    assert.deepEqual(c.ToArray(), ['b', 'c', 'a'])
})

test('Clear empties the collection', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    c.Clear()
    assert.equal(c.Count, 0)
})

test('Subscribe delivers an inserted change on Add', () => {
    const c = new ObservableCollection<string>()
    const seen: CollectionChange<string>[] = []
    c.Subscribe((ch) => seen.push(ch))
    c.Add('a')
    assert.deepEqual(seen, [{ kind: 'inserted', index: 0, items: ['a'] }])
})

test('Subscribe delivers a removed change on Remove', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    const seen: CollectionChange<string>[] = []
    c.Subscribe((ch) => seen.push(ch))
    c.Remove('a')
    assert.deepEqual(seen, [{ kind: 'removed', index: 0, items: ['a'] }])
})

test('Subscribe delivers a replaced change on SetAt', () => {
    const c = new ObservableCollection<string>(['a'])
    const seen: CollectionChange<string>[] = []
    c.Subscribe((ch) => seen.push(ch))
    c.SetAt(0, 'A')
    assert.deepEqual(seen, [{ kind: 'replaced', index: 0, oldItem: 'a', newItem: 'A' }])
})

test('Subscribe delivers a cleared change on Clear', () => {
    const c = new ObservableCollection<string>(['a', 'b'])
    const seen: CollectionChange<string>[] = []
    c.Subscribe((ch) => seen.push(ch))
    c.Clear()
    assert.deepEqual(seen, [{ kind: 'cleared' }])
})

test('Batch coalesces multiple mutations into a single reset', () => {
    const c = new ObservableCollection<string>()
    const seen: CollectionChange<string>[] = []
    c.Subscribe((ch) => seen.push(ch))
    c.Batch(() => { c.Add('a'); c.Add('b'); c.Add('c') })
    assert.deepEqual(seen, [{ kind: 'reset' }])
    assert.equal(c.Count, 3)
})

test('unsubscribing stops further delivery', () => {
    const c = new ObservableCollection<string>()
    const seen: CollectionChange<string>[] = []
    const off = c.Subscribe((ch) => seen.push(ch))
    c.Add('a')
    off()
    c.Add('b')
    assert.equal(seen.length, 1)
})
