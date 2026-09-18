// A request the engine makes of the host that carries its response type. Concrete
// asks subclass this; the phantom marker keeps two asks with different response
// types from being structurally identical (so Ask<R> inference works).
export abstract class Ask<TResponse> {
    /** Phantom marker binding the response type; never assigned or read. */
    declare readonly _response: TResponse
}

// A file-type filter for a pick-file ask (leading-dot-free extensions).
export interface FileFilter { readonly Name: string; readonly Extensions: readonly string[] }

// One selectable option for a Choose ask.
export interface Choice<T> { readonly Label: string; readonly Value: T }

// Confirm a yes/no decision (defaults to OK). Response: the user's yes/no.
export class ConfirmAsk extends Ask<boolean> {
    constructor(readonly Message: string, readonly ConfirmLabel: string = 'OK', readonly Title?: string) { super() }
}
// Pick a folder. Response: the chosen path, or undefined if cancelled.
export class PickFolderAsk extends Ask<string | undefined> {
    constructor(readonly Title: string) { super() }
}
// Pick a file, optionally filtered. Response: the chosen path, or undefined.
export class PickFileAsk extends Ask<string | undefined> {
    constructor(readonly Title: string, readonly Filters?: readonly FileFilter[]) { super() }
}
// Prompt for a line of text. Response: the entered text, or undefined if cancelled.
export class PromptTextAsk extends Ask<string | undefined> {
    constructor(readonly Label: string, readonly Initial?: string) { super() }
}
// Choose one of a set of options. Response: the chosen value, or undefined.
export class ChooseAsk<T> extends Ask<T | undefined> {
    constructor(readonly Title: string, readonly Options: readonly Choice<T>[]) { super() }
}

// The host service the engine resolves by ServiceKey to ask the user something.
// A UI host implements it over dialogs/pickers, a test mocks it, a CLI over stdio.
// Ask is the generic channel; the rest are typed convenience wrappers over it.
export interface IPromptService {
    Ask<R>(request: Ask<R>): Promise<R>
    Confirm(message: string, confirmLabel?: string): Promise<boolean>
    PickFolder(title: string): Promise<string | undefined>
    PickFile(title: string, filters?: readonly FileFilter[]): Promise<string | undefined>
    PromptText(label: string, initial?: string): Promise<string | undefined>
    Choose<T>(title: string, options: readonly Choice<T>[]): Promise<T | undefined>
}
