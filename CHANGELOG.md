# Changelog

## [0.0.0] (2026-11-25)

The first release on plugin-contract v0.

- One plugin name everywhere: id, tool namespace and RPC id `slack`, capability ids `slack.workspace` and
  `slack.mentions`, permission actions `slack.<method>`.
- Accounts through the contract's `accounts` module: one Slack workspace per alias, one MCP server per alias, one global
  Slack-app client-ID integration. `account` on every method that reads or writes Slack.
- The plugin's own reads: `status`, `probe`, `events_list`, `thread_read`, `channels_list`, `mentions_list`. Its one
  write: `mark_read`, which emits `changed` for `slack.workspace` after the write.
- Slack's 27 MCP tools declared as pass-through `mcp:<tool>` methods, classed by what each one does.
- One `register` call wires the agent tool, Code Mode and the RPC; the access rules are generated from `access` and the
  manifest. `mentions_list`, the private search and the file read are denied at `ask-changes` and `read-only`.
- Removed: the copied release kit, the tools RPC and its cursor code, the previous host's declarations and views, the
  TUI, the `/slack-status` command, the old `sources` and `opencode` keys, and the source-contract dependency.
- Docs and the `slack-search` skill written for v0; conformance recorded for two synthetic workspaces, `work` and
  `personal`, with T0 and T1.
