// The settings schema, shared UX-free between the todl engine and the UI.
// Reshaped from mural's DP-backed form into a plain Observable: each field
// is a backing value + PascalCase accessor pair whose setter raises
// PropertyChanged(name) only on a real change. SettingKind stays a real
// enum with stable string values — serialization and mural's compiler
// enum-literal resolution both key off this exact member set.

import { Observable } from './observable.js';
import { ObservableCollection } from './collections/observable-collection.js';

export enum SettingKind
{
    Boolean  = 'boolean',
    Number   = 'number',
    String   = 'string',
    Choice   = 'choice',
    Color    = 'color',
    FilePath = 'filePath',
}

export class SettingDefinition extends Observable
{
    private _key = '';
    private _label = '';
    private _description = '';
    private _category = '';
    private _kind: SettingKind = SettingKind.String;
    private _default: unknown = undefined;
    private _choices: ObservableCollection<string> | undefined = undefined;
    private _min = Number.NEGATIVE_INFINITY;
    private _max = Number.POSITIVE_INFINITY;

    public get Key(): string { return this._key; }
    public set Key(v: string)
    {
        const old = this._key;
        if (old === v) return;
        this._key = v;
        this.RaisePropertyChanged('Key', old, v);
    }

    public get Label(): string { return this._label; }
    public set Label(v: string)
    {
        const old = this._label;
        if (old === v) return;
        this._label = v;
        this.RaisePropertyChanged('Label', old, v);
    }

    public get Description(): string { return this._description; }
    public set Description(v: string)
    {
        const old = this._description;
        if (old === v) return;
        this._description = v;
        this.RaisePropertyChanged('Description', old, v);
    }

    public get Category(): string { return this._category; }
    public set Category(v: string)
    {
        const old = this._category;
        if (old === v) return;
        this._category = v;
        this.RaisePropertyChanged('Category', old, v);
    }

    public get Kind(): SettingKind { return this._kind; }
    public set Kind(v: SettingKind)
    {
        const old = this._kind;
        if (old === v) return;
        this._kind = v;
        this.RaisePropertyChanged('Kind', old, v);
    }

    public get Default(): unknown { return this._default; }
    public set Default(v: unknown)
    {
        const old = this._default;
        if (old === v) return;
        this._default = v;
        this.RaisePropertyChanged('Default', old, v);
    }

    public get Choices(): ObservableCollection<string> | undefined { return this._choices; }
    public set Choices(v: ObservableCollection<string> | undefined)
    {
        const old = this._choices;
        if (old === v) return;
        this._choices = v;
        this.RaisePropertyChanged('Choices', old, v);
    }

    public get Min(): number { return this._min; }
    public set Min(v: number)
    {
        const old = this._min;
        if (old === v) return;
        this._min = v;
        this.RaisePropertyChanged('Min', old, v);
    }

    public get Max(): number { return this._max; }
    public set Max(v: number)
    {
        const old = this._max;
        if (old === v) return;
        this._max = v;
        this.RaisePropertyChanged('Max', old, v);
    }
}
