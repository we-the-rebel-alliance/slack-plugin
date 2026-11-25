# Changelog

## 0.0.0 (2026-11-25)

The first release on plugin-contract v0.

- Slack's 27 MCP tools, passed through as `mcp:<tool>` methods and classed read, write, send or share, with one access
  rule per account alias.
- The plugin's own reads: `status`, `probe`, `events_list`, `thread_read`, `channels_list` and `mentions_list`; and one
  write, `mark_read`, which emits `changed` for the workspace source after the write.
- Accounts through the contract's `accounts` module: one Slack workspace per alias, one MCP server per alias with its
  own OAuth, and one global Slack-app client-ID integration at `slack-app`. `account` on every method that reads or
  writes Slack.
- Two events sources: `slack.workspace`, with a channel scope and a thread detail, and `slack.mentions`. Cursors are
  bound to the plugin, source, account and scope.
- One `register` call wires the agent tool, Code Mode, the RPC and the bus; the access rules are generated from `access`
  and each method's class and effect.
- Documentation and the `slack-search` skill, and a conformance fixture recorded over the two synthetic workspaces
  `work` and `personal`, with T0 and T1.

### Removed since v0.0.7

- The TUI status dialog (the `slack.workspace.tui` plugin): the contract's `status` method and the `/slack` command show
  the same state, so the dialog duplicated a second UI surface. OpenCode 2.4 clients render status from the method; the
  old dialog's refresh key has no replacement, because the method is read on demand.
- The `slack.dms` snapshot and `dms_list` (the old 35th method): phase 4a removed the app-only DMs inbox read per plan
  §5.2, which keeps only the `workspace` and `mentions` sources; `slack.mentions` still searches direct and group
  messages. The manifest now has 34 methods.
- The tools RPC's `describe`: contract §18 makes `describe` diagnostics only, and the manifest and catalog are the
  discovery path. The tools RPC itself is replaced by the contract RPC id `slack` (see the parity table in the pull
  request).
