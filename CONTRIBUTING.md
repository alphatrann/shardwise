# Contributing to shardwise

Bug fixes, docs and tests are all welcome. For anything bigger, open an issue first so we can agree on the approach.

## Setup

```bash
git clone https://github.com/alphatrann/shardwise.git
cd shardwise
corepack enable
yarn install
```

## Layout

```
src/        library source (kebab-case files)
__tests__/  jest tests
examples/   runnable examples, private, never published
docs/       diagrams used by the README
```

## Scripts

```bash
yarn test         # jest
yarn typecheck    # tsc --noEmit
yarn lint         # eslint
yarn format       # prettier --write
yarn build        # tsup (esm + cjs + types)
```

CI runs lint, typecheck, build and test on every PR to `master`.

## Guidelines

- Strict TypeScript, avoid `any`.
- The library has no runtime dependencies. Keep it that way.
- The router never does I/O of its own. Anything that touches a network goes through the user's `connect`/`disconnect`/`checker`.
- Add tests for new behavior. Timer-based code should use jest fake timers.

## Changesets

Releases are driven by [changesets](https://github.com/changesets/changesets). If your PR changes the published package, add one:

```bash
yarn changeset
```

Pick the bump (patch / minor / major) and describe the change. Docs, tests and examples don't need one.

When changesets land on `master`, the release workflow opens a "version packages" PR. Merging it publishes to npm.

## Pull requests

1. Fork and branch from `master`.
2. Make sure `yarn lint && yarn typecheck && yarn test` pass.
3. Use clear commit messages, e.g. `feat: add weighted replicas`, `fix: re-salt colliding vnodes`, `docs: clarify failover`.
4. Open the PR.
