# Repository rules

This repository builds `@we-the-rebel-alliance/slack-plugin`, an OpenCode plugin that connects Slack's hosted MCP
server under the `slack.workspace` plugin id. [README.md](README.md) describes what users see;
[docs/configuration.md](docs/configuration.md) is the contract for options, permissions, status and errors;
[docs/architecture.md](docs/architecture.md) maps the code.

## Design

- **Thin plugin.** Register `https://mcp.slack.com/mcp` through `ctx.mcp.transform`. OpenCode owns transport, OAuth,
  token storage and refresh, Code Mode and permission prompts. Add no wrapper tools: the plugin's own tools are
  `slack_events_list` and `slack_mark_read`, for what Slack's server has no tool for.
- **One Web API client.** `src/slack-api.ts` is the only code that reads the Slack token: it resolves the `slack`
  server's sign-in through `ctx.integration.connection` and calls only `SLACK_API_METHODS` (`auth.test` for status's
  account, `conversations.mark` for `slack_mark_read`, `assistant.search.context` for `mentions_list`). It never
  stores, caches, logs or returns the token, and its errors carry Slack's code only. A new method changes
  [SECURITY.md](SECURITY.md)'s promise: update it in the same change.
- **Tools RPC.** `src/host/tools-rpc.ts` lets a script call every known tool (`METHODS`, from `KNOWN_TOOLS` in
  `src/tools.ts`) through OpenCode's own executors from `ctx.tool.list()`, plus the plugin's own `events_list`,
  `probe`, `thread_read`, `channels_list`, `mentions_list`, `mark_read` and `status`. The rule is resolved before
  dispatch, so only an explicit `allow` runs and an `ask` is refused. A tool Slack adds later is not a method until it
  is classified. The transport is the source contract's `tools-rpc` module: change it there, never here.
- **Sources.** `package.json`'s top-level `sources` declares `slack.workspace` (events, with the detail read
  `slack.workspace.thread`) and `slack.mentions` (events), against the source contract, whose `events`, `cursor` and
  `tools-rpc` modules `npm run build` bundles into `dist/index.js`. `src/events.ts` is `events_list`, `src/source.ts`
  the `probe`, `thread_read` and `channels_list`, and `src/mentions.ts` the Web API read through `src/web-reads.ts`,
  which asserts `slack.read` on `<workspace>:<method>` before each call. The account and owner come from status's
  `auth.test` (`src/identity.ts`), never from a content read. Declared equals asserted, and the offline conformance kit
  (`test/support/conformance.ts`, `test/fixtures/conformance.json`) proves it in `npm run check`: change the
  declaration, the reads and the fixture together.
- **Client ID.** Options first, then the `/connect` **Slack app client ID** key method (key: the client ID; form:
  optional secret). No default client ships, ever. Without a client, register no server and say so in status. Never
  put a client ID or secret in `ctx.storage`.
- **Stable IDs.** Plugin `slack.workspace`, TUI `slack.workspace.tui`, status RPC `slack.workspace`, tools RPC
  `slack.workspace.tools`, sources `slack.workspace` and `slack.mentions`, `/connect` entry `slack-app`, MCP server
  `slack` (no option renames it).
- **Setup never throws** for bad input. For invalid options or a host outside the supported range (`opencode.host`),
  register only `/slack-status`, the status RPC and the TUI dialog. Every error has a code, a message and exactly one
  next step: `CODE: What happened. Next step: What to do.` Never echo option values or secrets.
- **One status model.** `src/status.ts` builds it; `/slack-status`, the RPC and the dialog render it, with the rows
  Connection, Account, Access, Server, Client, Callback, Scopes, Skills, Tools, Agents without default rules, OpenCode
  and one Next step. Connection shows the shared labels; the RPC carries the states in machine form and the fields
  `version`, `host`, `state`, `unguardedAgents` and `nextStep`, plus `account` (`teamId`, `userId`, `enterpriseId`)
  while connected, from one `auth.test` per sign-in. `TESTED_HOSTS` in `src/defaults.ts` is the one list of tested
  releases; status calls only those tested.
- **Permissions.** Every tool is allowed by default. `src/permissions.ts` generates the block from the tool classes and
  the `access` option (`all`, the default; `ask-changes`; `read-only`) and inserts it directly after each agent's first
  base `* * allow`, unless the block already appears anywhere after it. User rules and saved approvals keep winning; a
  stricter agent never gets weaker. `defaultRules(access)` is printed in full in the README and in
  `docs/configuration.md` for each value, and a test asserts the docs equal it.
- **Fixed context.** The Code Mode namespace line (`NAMESPACE_DESCRIPTION` in `src/tools.ts`) is at most 400 characters
  and every skill description at most 300; no tool is pinned and no hook runs per request. The namespace line carries
  what every request needs; the skill body carries the rest (access levels, private-content consent, file reads, the
  tools RPC).
- **Greenfield.** No compatibility paths, migrations or dead code. Delete old code, docs and tests with the behaviour
  they cover.

## Forbidden APIs

`test/unit/forbidden.test.ts` scans `src/`, `test/` and `skills/` for these, and is the list: `ctx.mcp.catalog`,
`ctx.mcp.attest`, `supports*` markers, a second argument to `permission.assert`, tool `options.mcp`, config
`capabilities`, `responsePolicy`, `Plugin.image` and profile images, `ctx.generate.text`, `experimental.policies`,
`ctx.experimental.artifact`, `ctx.permission.hook` (the tools RPC's one `evaluate` hook, which turns an ask on one of
its own script calls in flight into a deny because no one can answer it, lives in the source contract's transport, and
the test checks it is the only one there), `@opencode-ai/plugin`, `@opencode/ai` imports, a `server()` export, and
OpenCode host source paths.

## Package

- No runtime or peer dependencies, and no install, `prepare` or `prepack` scripts. `@opencode/*` (exactly 2.4.1),
  `effect` (4.1.0, the plugin package's own peer), OpenTUI and Solid are dev dependencies; `opencode.host` states the
  range, `>=2.4.1 <2.5.0`, and the checks run on 2.4.1 alone.
- `files` is a whitelist. `npm run build` (`scripts/build.ts`) emits exactly two self-contained esbuild bundles,
  `dist/index.js` and `dist/tui.js`, with shared code inlined and no relative, dynamic or required imports; only
  `@opencode/plugin`, `@opentui/*`, `solid-js` and `node:*` stay external. The TUI goes through Babel's Solid
  universal transform first. No `.tsx`, no `.d.ts`, no chunks. `tsc` only typechecks.
- Releases come only from `.github/workflows/release.yml`; no release is cut yet. Never push a tag or a `release/*`
  branch, and never commit, tag or publish a release by hand. Agents never approve a release and never call the
  deployment-approval API.
- Commit as the repository's automation identity, never with a personal address or a local hostname. No personal email
  in anything published.

## Checks

- `npm ci --ignore-scripts`, then `npm run check`. See [CONTRIBUTING.md](CONTRIBUTING.md).
- The stages are `typecheck`, `copies`, `build`, `unit`, `conformance` (the source contract's kit over the sources,
  offline; it writes `reports/conformance-report.json` for a release), `kit`, `tui`, `host`, `pack`, `icons` and
  `actionlint` (a notice when `actionlint` is not on PATH; CI installs it and lints the workflows).
- Host tests run on every release in `TESTED_HOSTS`, which is 2.4.1, and the pack stage runs that stock binary too.
  Only a stock `opencode serve` starts the automation scheduler: the suite runs a Code Mode program through an
  automation there, and asserts the same session rules over the tools RPC on the embedded `@opencode/sdk` host, which
  never runs one. OpenCode 2.4 probes an MCP server that names no protocol with `server/discover` first, so the fake
  server refuses that probe cleanly before the legacy handshake.
- Host tests run OpenCode with HOME, `OPENCODE_TEST_HOME`, XDG directories and TMPDIR inside a temporary root, which is
  a git repository under the system's `/tmp` (never under TMPDIR or HOME), on its own port, and never call Slack.
- `test/host/slack-catalog.ts` holds Slack's live tool schemas; the fake server serves them, and
  `test/unit/docs.test.ts` checks every parameter the skill and the docs name against them. Refresh it when Slack
  changes a tool; `npm run drift` compares the reads with a live, signed-in OpenCode (manual, not part of `check`).
- Do not skip, weaken or delete a test to get green.

## Writing

- Never commit tokens, client secrets, real client IDs, personal data, Slack content or absolute local paths. Docs use
  `YOUR_SLACK_CLIENT_ID`.
- Say "OpenCode automation", never "cron job".
- Commit messages use `type(scope): summary`.
- Keep the README, `docs/`, `SECURITY.md` and `CHANGELOG.md` in step with the code.
