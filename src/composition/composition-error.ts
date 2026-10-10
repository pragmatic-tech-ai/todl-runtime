export class CompositionError extends Error
{
    private static readonly ErrorName = "CompositionError";
    private static readonly DuplicateModuleTemplate = "Duplicate module id '{0}'";
    private static readonly MissingRequirementTemplate = "Module '{0}' has an unknown requirement '{1}' (requirement not composed for this host)";
    private static readonly RequirementCycleTemplate = "Requirement cycle detected: {0}";
    private static readonly DuplicateServiceTemplate = "Duplicate service {0}: already provided by '{1}', also provided by '{2}'";
    private static readonly CycleSeparator = " -> ";

    private constructor(message: string)
    {
        super(message);
        this.name = CompositionError.ErrorName;
    }

    public static DuplicateModule(id: string): CompositionError
    {
        return new CompositionError(CompositionError.DuplicateModuleTemplate.replace("{0}", id));
    }

    public static MissingRequirement(module: string, requires: string): CompositionError
    {
        return new CompositionError(CompositionError.MissingRequirementTemplate.replace("{0}", module).replace("{1}", requires));
    }

    public static RequirementCycle(ids: readonly string[]): CompositionError
    {
        return new CompositionError(CompositionError.RequirementCycleTemplate.replace("{0}", ids.join(CompositionError.CycleSeparator)));
    }

    public static DuplicateService(key: string, first: string, second: string): CompositionError
    {
        return new CompositionError(
            CompositionError.DuplicateServiceTemplate.replace("{0}", key).replace("{1}", first).replace("{2}", second));
    }
}
