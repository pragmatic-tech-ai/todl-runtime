import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from '../module.js';
import { HostKind } from '../host-kind.js';
import { ServiceProvider, ServiceKey, ServiceLifetime } from '../../services/service-provider.js';

describe('Module (headless composition unit)', () => {
    test('replays recorded registrations into a container', () => {
        const key = new ServiceKey<{ id: string }>('svc');
        const mod = new Module();
        mod.AddRegistration(key, () => ({ id: 'svc' }), ServiceLifetime.Singleton);

        const provider = new ServiceProvider();
        mod.RegisterServices(provider);
        assert.deepEqual(provider.get(key), { id: 'svc' });
    });

    test('HasServiceRegistrations reflects whether any registration was added', () => {
        const empty = new Module();
        assert.equal(empty.HasServiceRegistrations, false);
        empty.AddRegistration(new ServiceKey('x'), () => ({}), ServiceLifetime.Singleton);
        assert.equal(empty.HasServiceRegistrations, true);
    });

    test('Targets is empty by default and collects AddTarget kinds', () => {
        const mod = new Module();
        assert.equal(mod.Targets.size, 0);
        const desktop = new HostKind('desktop');
        mod.AddTarget(desktop);
        assert.equal(mod.Targets.has(desktop), true);
    });

    test('a singleton registration resolves the same instance twice', () => {
        const key = new ServiceKey<object>('singleton');
        const mod = new Module();
        mod.AddRegistration(key, () => ({}), ServiceLifetime.Singleton);
        const provider = new ServiceProvider();
        mod.RegisterServices(provider);
        assert.equal(provider.get(key), provider.get(key));
    });
});
