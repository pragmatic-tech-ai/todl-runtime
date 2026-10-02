import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingDefinition, SettingKind } from '../setting-definition.js';
import { ObservableCollection } from '../collections/observable-collection.js';
import type { PropertyChangedEventArgs } from '../observable.js';

test('SettingKind has the six canonical members with stable string values', () =>
{
    assert.equal(SettingKind.Boolean, 'boolean');
    assert.equal(SettingKind.Number, 'number');
    assert.equal(SettingKind.String, 'string');
    assert.equal(SettingKind.Choice, 'choice');
    assert.equal(SettingKind.Color, 'color');
    assert.equal(SettingKind.FilePath, 'filePath');
    assert.deepEqual(Object.values(SettingKind).sort(),
        ['boolean', 'choice', 'color', 'filePath', 'number', 'string']);
});

test('SettingDefinition has the documented defaults', () =>
{
    const def = new SettingDefinition();
    assert.equal(def.Key, '');
    assert.equal(def.Label, '');
    assert.equal(def.Description, '');
    assert.equal(def.Category, '');
    assert.equal(def.Kind, SettingKind.String);
    assert.equal(def.Default, undefined);
    assert.equal(def.Choices, undefined);
    assert.equal(def.Min, Number.NEGATIVE_INFINITY);
    assert.equal(def.Max, Number.POSITIVE_INFINITY);
});

test('setting a property raises PropertyChanged with old and new values', () =>
{
    const def = new SettingDefinition();
    const seen: PropertyChangedEventArgs[] = [];
    def.PropertyChanged('Kind').subscribe(a => seen.push(a));
    def.Kind = SettingKind.Color;
    assert.equal(seen.length, 1);
    assert.equal(seen[0].property, 'Kind');
    assert.equal(seen[0].oldValue, SettingKind.String);
    assert.equal(seen[0].newValue, SettingKind.Color);
    assert.equal(def.Kind, SettingKind.Color);
});

test('does not raise PropertyChanged when the value is unchanged', () =>
{
    const def = new SettingDefinition();
    def.Label = 'Theme';
    let count = 0;
    def.PropertyChanged('Label').subscribe(() => count++);
    def.Label = 'Theme';
    assert.equal(count, 0);
});

test('Choices holds an ObservableCollection and raises on assignment', () =>
{
    const def = new SettingDefinition();
    const choices = new ObservableCollection<string>();
    let count = 0;
    def.PropertyChanged('Choices').subscribe(() => count++);
    def.Choices = choices;
    assert.equal(count, 1);
    assert.equal(def.Choices, choices);
});
