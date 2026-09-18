import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Ask, ConfirmAsk, PickFolderAsk, type IPromptService } from '../ask.js'

// A canned prompt service: dispatch by request type, return typed answers.
class FakePrompts implements IPromptService {
    constructor(private readonly confirm: boolean, private readonly folder: string | undefined) {}
    async Ask<R>(request: Ask<R>): Promise<R> {
        if (request instanceof ConfirmAsk) return this.confirm as R
        if (request instanceof PickFolderAsk) return this.folder as R
        throw new Error(`unhandled ${request.constructor.name}`)
    }
    Confirm(message: string, confirmLabel?: string): Promise<boolean> { return this.Ask(new ConfirmAsk(message, confirmLabel)) }
    PickFolder(title: string): Promise<string | undefined> { return this.Ask(new PickFolderAsk(title)) }
    PickFile(): Promise<string | undefined> { throw new Error('nyi') }
    PromptText(): Promise<string | undefined> { throw new Error('nyi') }
    Choose<T>(): Promise<T | undefined> { throw new Error('nyi') }
}

test('Ask dispatches by request type and returns the typed response', async () => {
    const p = new FakePrompts(true, 'C:/x')
    const ok: boolean = await p.Ask(new ConfirmAsk('Discard?', 'Discard'))
    assert.equal(ok, true)
    const dir: string | undefined = await p.Ask(new PickFolderAsk('Open'))
    assert.equal(dir, 'C:/x')
})

test('Confirm helper delegates to Ask', async () => {
    assert.equal(await new FakePrompts(false, undefined).Confirm('x'), false)
})
