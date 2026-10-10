import { HostKind } from "./host-kind.js";

/** Standard host kinds. Apps may still mint their own HostKind; these are the ones the platform ships. */
export class HostKinds
{
    public static readonly Desktop = new HostKind("desktop");
    public static readonly Headless = new HostKind("headless");
    public static readonly Web = new HostKind("web");
}
