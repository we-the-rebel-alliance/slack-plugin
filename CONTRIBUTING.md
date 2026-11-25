# Contributing

A change lands as one pull request against `master`, with `ci` green. The repository is protected: no direct pushes, no
force pushes, linear history, signed commits.

## Before you start

- Read [AGENTS.md](AGENTS.md), [the plugin standard](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/plugin-standard.md)
  and [the contract](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/contract.md).
- The manifest in `package.json` is the source of truth. A new method, source or event starts there.

## Run the checks

```sh
npm ci --ignore-scripts
npm run check
```

`dist/index.js` is committed, because a tag install has no build step; `npm run bundle` writes it, and `npm run check`
fails when it is stale (the CI job runs `npm run bundle && git diff --exit-code dist/` too).

`npm run check` runs the typecheck, the build, the unit tests, the pack test, and `plugin-kit check` (conformance
with T0 and T1, the doc file set, forbidden patterns and the bundled-kit check).

## Change the manifest, then the docs

Generated sections are written by `npx plugin-kit docs` from `capabilities`; commit the result. Hand-written text is
plain English, for a person installing the plugin and for an agent working in the repository.

## Fixtures

`fixtures/conformance.json` is recorded from the plugin's own handlers over two synthetic workspaces; every person,
channel and message is invented. After a handler change:

```sh
SLACK_RECORD=1 node --test test/unit/fixture.test.ts
```

and commit the result; the same test fails when the committed file and the handlers disagree. `plugin-kit record` is for
a recording from a real account: it redacts personal data, which would replace the invented names here, so it is not run
on this fixture (the contract's own example fixture behaves the same way).

## Commits and releases

Conventional commits. The maintainer cuts `vX.Y.Z` with `npx plugin-kit release <version>` on `master`; CI publishes the
GitHub release, and the version and `CHANGELOG.md` section are prepared in the pull request before it.
