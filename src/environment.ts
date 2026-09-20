import { ServiceKey } from './services/service-provider.js';

// The operating system, normalised from Node's process.platform to a named set —
// an enum, not the raw string union, so consumers branch on a member
// (`env.Platform === OperatingSystem.MacOS`). Anything outside the desktop trio
// maps to Other.
export enum OperatingSystem
{
    Windows = 'win32',
    MacOS = 'darwin',
    Linux = 'linux',
    Other = 'other',
}

// The host-environment service contract: the static facts about where and how the
// app runs — directories, platform, versions, runtime flags — as read-only members.
// A host supplies the implementation (an Electron renderer reading a bridged
// snapshot, a Node process building it from os/path, …); consumers depend on this
// interface + EnvironmentKey rather than any concrete class, so code that needs
// "where things live" stays host-agnostic. Every value is constant for the process
// lifetime.
export interface IEnvironment
{
    // ── Directories ──
    readonly CurrentDirectory: string;
    readonly HomeDirectory: string;
    readonly TempDirectory: string;
    readonly UserDataDirectory: string;
    readonly DocumentsDirectory: string;
    readonly DownloadsDirectory: string;

    // ── Platform ──
    readonly Platform: OperatingSystem;
    readonly Architecture: string; // process.arch (x64, arm64, …)
    readonly PathSeparator: string; // path.sep ('\\' on Windows, '/' elsewhere)
    readonly IsWindows: boolean; // convenience over Platform, for case-insensitive path logic

    // ── Versions ──
    readonly AppVersion: string;
    readonly ElectronVersion: string; // empty outside an Electron host
    readonly ChromeVersion: string; // empty outside a Chromium host
    readonly NodeVersion: string;

    // ── Runtime flags ──
    readonly IsDevelopment: boolean;
    readonly IsPackaged: boolean;
}

// The container key the environment implementation registers under; consumers
// resolve IEnvironment through it.
export const EnvironmentKey = new ServiceKey<IEnvironment>('Environment');
