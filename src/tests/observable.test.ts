import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Observable } from '../index.js'

class Loc extends Observable
{
  #label = ''
  get label(): string
  {
    return this.#label
  }
  set label(v: string)
  {
    const o = this.#label
    if (o === v) return
    this.#label = v
    // RaisePropertyChanged is protected; a subclass may call it.
    ;(this as unknown as { RaisePropertyChanged(n: string, o: unknown, v: unknown): void }).RaisePropertyChanged(
      'label',
      o,
      v,
    )
  }
}

test('notifies by name on setter change', () => {
  const l = new Loc()
  const seen: Array<[string, unknown]> = []
  l.PropertyChanged('label').subscribe(({ property, newValue }) => seen.push([property, newValue]))
  l.label = 'Azure'
  assert.equal(l.label, 'Azure')
  assert.deepEqual(seen, [['label', 'Azure']])
})

test('equal-value set fires nothing', () => {
  const l = new Loc()
  let fired = 0
  l.PropertyChanged('label').subscribe(() => {
    fired++
  })
  l.label = ''
  assert.equal(fired, 0)
})

test('unobserved instance allocates no signal map', () => {
  const l = new Loc()
  assert.equal((l as unknown as { _signals?: unknown })._signals, undefined)
})

test('disposing a subscription stops delivery', () => {
  const l = new Loc()
  let fired = 0
  const sub = l.PropertyChanged('label').subscribe(() => {
    fired++
  })
  sub.dispose()
  l.label = 'x'
  assert.equal(fired, 0)
})
