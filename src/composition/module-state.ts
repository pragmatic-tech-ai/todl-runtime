import { Signal, type IDisposable } from "../signal.js";

export enum ModuleStateKind
{
    Dormant,
    Activating,
    Active,
    Failed,
}

export class ModuleState
{
    private constructor(public readonly Kind: ModuleStateKind, public readonly Reason: string | null)
    {
    }

    public static Dormant(): ModuleState
    {
        return new ModuleState(ModuleStateKind.Dormant, null);
    }

    public static Activating(): ModuleState
    {
        return new ModuleState(ModuleStateKind.Activating, null);
    }

    public static Active(): ModuleState
    {
        return new ModuleState(ModuleStateKind.Active, null);
    }

    public static Failed(reason: string): ModuleState
    {
        return new ModuleState(ModuleStateKind.Failed, reason);
    }

    public Equals(other: ModuleState): boolean
    {
        return this.Kind === other.Kind && this.Reason === other.Reason;
    }
}

export class ModuleStateProperty
{
    private current: ModuleState;
    private readonly changed = new Signal<ModuleState>();

    public constructor(initial: ModuleState)
    {
        this.current = initial;
    }

    public Get(): ModuleState
    {
        return this.current;
    }

    public get Changed(): Signal<ModuleState>
    {
        return this.changed;
    }

    public Set(value: ModuleState): boolean
    {
        if (this.current.Equals(value))
        {
            return false;
        }

        this.current = value;
        this.changed.emit(value);
        return true;
    }

    public Subscribe(handler: (value: ModuleState) => void): IDisposable
    {
        return this.changed.subscribe(handler);
    }
}
