import type { ModuleManifest } from "./module-manifest.js";
import type { ActivationContext } from "./activation-context.js";

export interface ILazyModule
{
    /** Pure; called once at composition. */
    Manifest(): ModuleManifest;

    /** Runs at most once, after every required module is active. */
    Activate(context: ActivationContext): Promise<void>;
}
