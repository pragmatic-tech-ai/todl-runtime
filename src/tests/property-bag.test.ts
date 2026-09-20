import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MapPropertyBag, type PropertyAccessor } from '../property-bag.js';
import { Signal, type PropertyChangedEventArgs } from '../index.js';

describe('MapPropertyBag — get/set via delegates', () => {
    test('GetValue delegates to accessor.get()', () => {
        let stored = 42;
        const accessors = new Map<string, PropertyAccessor>([
            [
                'count',
                {
                    id: () => 'count',
                    displayName: () => 'count',
                    get: () => stored,
                    set: (v) => {
                        stored = v as number;
                    },
                },
            ],
        ]);
        const bag = new MapPropertyBag(accessors);
        assert.equal(bag.GetValue('count'), 42);
    });

    test('SetValue delegates to accessor.set()', () => {
        let stored = 0;
        const accessors = new Map<string, PropertyAccessor>([
            [
                'count',
                {
                    id: () => 'count',
                    displayName: () => 'count',
                    get: () => stored,
                    set: (v) => {
                        stored = v as number;
                    },
                },
            ],
        ]);
        const bag = new MapPropertyBag(accessors);
        bag.SetValue('count', 99);
        assert.equal(stored, 99);
    });
});

describe('MapPropertyBag — IsReadOnly', () => {
    test('IsReadOnly is false when accessor has set', () => {
        const accessors = new Map<string, PropertyAccessor>([
            ['x', { id: () => 'x', displayName: () => 'x', get: () => 1, set: () => {} }],
        ]);
        const bag = new MapPropertyBag(accessors);
        assert.equal(bag.IsReadOnly('x'), false);
    });

    test('IsReadOnly is true when accessor has no set', () => {
        const accessors = new Map<string, PropertyAccessor>([
            ['x', { id: () => 'x', displayName: () => 'x', get: () => 1 }],
        ]);
        const bag = new MapPropertyBag(accessors);
        assert.equal(bag.IsReadOnly('x'), true);
    });
});

describe('MapPropertyBag — bag-owned notification', () => {
    test('SetValue fires bag-owned listeners when accessor has no changed signal', () => {
        let stored = 0;
        const accessors = new Map<string, PropertyAccessor>([
            [
                'v',
                {
                    id: () => 'v',
                    displayName: () => 'v',
                    get: () => stored,
                    set: (val) => {
                        stored = val as number;
                    },
                },
            ],
        ]);
        const bag = new MapPropertyBag(accessors);
        let notified = 0;
        bag.Observe('v').subscribe(() => {
            notified++;
        });
        bag.SetValue('v', 10);
        assert.equal(notified, 1);
        bag.SetValue('v', 20);
        assert.equal(notified, 2);
    });

    test('Observe returns unsubscribe that stops notifications', () => {
        let stored = 0;
        const accessors = new Map<string, PropertyAccessor>([
            [
                'v',
                {
                    id: () => 'v',
                    displayName: () => 'v',
                    get: () => stored,
                    set: (val) => {
                        stored = val as number;
                    },
                },
            ],
        ]);
        const bag = new MapPropertyBag(accessors);
        let notified = 0;
        const sub = bag.Observe('v').subscribe(() => {
            notified++;
        });
        bag.SetValue('v', 1);
        assert.equal(notified, 1);
        sub.dispose();
        bag.SetValue('v', 2);
        // Listener was removed — count must not increase
        assert.equal(notified, 1);
    });
});

describe('MapPropertyBag — accessor.changed delegation', () => {
    test('Observe subscribes to accessor.changed when present', () => {
        const changed = new Signal<PropertyChangedEventArgs>();
        const accessors = new Map<string, PropertyAccessor>([
            ['x', { id: () => 'x', displayName: () => 'x', get: () => 0, set: () => {}, changed }],
        ]);
        const bag = new MapPropertyBag(accessors);
        let notified = 0;
        bag.Observe('x').subscribe(() => {
            notified++;
        });
        // Simulate the external source firing
        changed.emit({ property: 'x', oldValue: 0, newValue: 0 });
        assert.equal(notified, 1);
    });

    test('SetValue does NOT double-fire when accessor supplies changed', () => {
        // The accessor owns notification; SetValue must not also fire bag listeners
        const changed = new Signal<PropertyChangedEventArgs>();
        let stored = 0;
        const accessors = new Map<string, PropertyAccessor>([
            [
                'x',
                {
                    id: () => 'x',
                    displayName: () => 'x',
                    get: () => stored,
                    set: (v) => {
                        stored = v as number;
                    },
                    changed,
                },
            ],
        ]);
        const bag = new MapPropertyBag(accessors);
        let notified = 0;
        bag.Observe('x').subscribe(() => {
            notified++;
        });
        // SetValue calls set() but must NOT fire bag's own emitter (accessor.changed owns it)
        bag.SetValue('x', 7);
        assert.equal(notified, 0, 'bag must not double-fire when accessor owns notification');
        // The accessor's own channel still works independently
        changed.emit({ property: 'x', oldValue: 0, newValue: 0 });
        assert.equal(notified, 1);
    });

    test('Observe unsubscribe from accessor.changed path removes listener', () => {
        const changed = new Signal<PropertyChangedEventArgs>();
        const accessors = new Map<string, PropertyAccessor>([
            ['x', { id: () => 'x', displayName: () => 'x', get: () => 0, set: () => {}, changed }],
        ]);
        const bag = new MapPropertyBag(accessors);
        let notified = 0;
        const sub = bag.Observe('x').subscribe(() => {
            notified++;
        });
        changed.emit({ property: 'x', oldValue: 0, newValue: 0 });
        assert.equal(notified, 1);
        sub.dispose();
        changed.emit({ property: 'x', oldValue: 0, newValue: 0 });
        // After unsub the accessor's own source no longer drives our listener
        assert.equal(notified, 1);
    });
});

describe('MapPropertyBag — unknown name throws', () => {
    test('GetValue throws on unknown name', () => {
        const bag = new MapPropertyBag(new Map());
        assert.throws(() => bag.GetValue('missing'), /missing/);
    });

    test('SetValue throws on unknown name', () => {
        const bag = new MapPropertyBag(new Map());
        assert.throws(() => bag.SetValue('missing', 1), /missing/);
    });

    test('IsReadOnly throws on unknown name', () => {
        const bag = new MapPropertyBag(new Map());
        assert.throws(() => bag.IsReadOnly('missing'), /missing/);
    });

    test('Observe throws on unknown name', () => {
        const bag = new MapPropertyBag(new Map());
        assert.throws(() => bag.Observe('missing'), /missing/);
    });
});

describe('MapPropertyBag — iteration', () => {
    test('yields [name, accessor] for each property', () => {
        const accessors = new Map<string, PropertyAccessor>([
            ['a', { id: () => 'a', displayName: () => 'Alpha', get: () => 1 }],
            ['b', { id: () => 'b', displayName: () => 'Beta', get: () => 2, set: () => {} }],
        ]);
        const bag = new MapPropertyBag(accessors);
        const seen = [...bag].map(([name, acc]) => [name, acc.id(), acc.displayName(), acc.get()]);
        assert.deepEqual(seen, [
            ['a', 'a', 'Alpha', 1],
            ['b', 'b', 'Beta', 2],
        ]);
    });
});
