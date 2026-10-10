import type { ServiceProvider, ServiceToken, ServiceFactory } from "../services/service-provider.js";

export class ActivationContext
{
    private readonly provided: ServiceToken<unknown>[] = [];

    public constructor(private readonly moduleId: string, private readonly services: ServiceProvider)
    {
    }

    public get ModuleId(): string
    {
        return this.moduleId;
    }

    public ProvideInstance<T>(token: ServiceToken<T>, instance: T): void
    {
        this.services.registerInstance(token, instance);
        this.provided.push(token as ServiceToken<unknown>);
    }

    public ProvideFactory<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void
    {
        this.services.register(token, factory);
        this.provided.push(token as ServiceToken<unknown>);
    }

    /** Reads an already-registered service (requirements guarantee presence). Does NOT activate anything. */
    public Resolve<T>(token: ServiceToken<T>): T
    {
        return this.services.getRequired(token);
    }

    public ProvidedServices(): readonly ServiceToken<unknown>[]
    {
        return this.provided;
    }
}
