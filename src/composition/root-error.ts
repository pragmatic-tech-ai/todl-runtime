export class RootError extends Error
{
    private static readonly ErrorName = "RootError";
    private static readonly UnknownModuleTemplate = "Activation requested for unknown module '{0}'";
    private static readonly UnknownServiceTemplate = "Resolve of unknown service {0}: no composed module provides it";
    private static readonly ModuleFailedTemplate = "Module '{0}' failed: {1}";
    private static readonly ActivationCycleTemplate = "Activation cycle detected at module '{0}'";

    private constructor(message: string)
    {
        super(message);
        this.name = RootError.ErrorName;
    }

    public static UnknownModule(id: string): RootError
    {
        return new RootError(RootError.UnknownModuleTemplate.replace("{0}", id));
    }

    public static UnknownService(key: string): RootError
    {
        return new RootError(RootError.UnknownServiceTemplate.replace("{0}", key));
    }

    public static ModuleFailed(module: string, reason: string): RootError
    {
        return new RootError(RootError.ModuleFailedTemplate.replace("{0}", module).replace("{1}", reason));
    }

    public static ActivationCycle(id: string): RootError
    {
        return new RootError(RootError.ActivationCycleTemplate.replace("{0}", id));
    }
}
