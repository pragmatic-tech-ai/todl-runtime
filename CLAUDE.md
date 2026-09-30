# CLAUDE.md

todl-runtime — `@pragmatic-tech-ai/todl-runtime`, the runtime base for
TODL-generated entity classes and the shared zero-dependency primitives
(`Observable`, `PropertyChangedEventArgs`, `Signal`, `Disposable`, the
`IStorage` family). ESM, strict tsconfig; tests via
`tsx --conditions=development --test "src/**/*.test.ts"`.

## Work tracking

All work — tasks, features, bugs, and design notes — is tracked in the GitHub
Project **Architecture Agentic Suite** (org `pragmatic-tech-ai`, project number
`1`). Work descriptions, backlogs, and TODO lists are **not** stored in local
files anymore. Read and update the backlog with the `gh` CLI:

- List items: `gh project item-list 1 --owner pragmatic-tech-ai`
- Add an item: `gh project item-create 1 --owner pragmatic-tech-ai --title "…" --body "…"`

When you finish or pick up work, reflect it in the Project rather than a local
note.

## Testing

- **Every test file lives in a `tests/` subfolder next to the code it
  exercises** — `src/tests/observable.test.ts`,
  `src/composition/tests/module.test.ts`. The runner globs `src/**/*.test.ts`
  either way, so this is organizational: keep source directories free of test
  files.

## Zero dependencies, single source of truth

- The package has no runtime dependencies by design; neither mural nor the
  `@pragmatic-tech-ai/todl` compiler is pulled in. Keep it that way.
- The primitives defined here are canonical. mural re-exports them from
  `@pragmatic-tech-ai/mural/runtime`, but they must never be re-declared
  downstream — change them here.
