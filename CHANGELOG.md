# Changelog

## 0.0.0 (unreleased)

The plugin restarts at `0.0.0` as `@we-the-rebel-alliance/slack-plugin`, after the move to
`we-the-rebel-alliance/slack-plugin`.

- **OpenCode 2.4.1 only.** The host range is `>=2.4.1 <2.5.0` and the checks run on 2.4.1 alone; older releases are
  gone from the tests. The dev dependencies are the 2.4.1 packages, with `effect` 4.1.0 as `@opencode/plugin`'s peer.
- **Two sources.** `slack.workspace` (the messages of the channels a consumer confirms) and `slack.mentions` (the
  messages that mention you). The `slack.dms` snapshot and its `dms_list` were removed, with the direct and group
  message scopes only it needed.
- **No app-specific surface.** The Jelly declaration stays as the plugin's declaration, and its `docs/jelly.md` and
  README/AGENTS sections are gone. The `sources` and `jelly` keys are replaced by the plugin contract's `capabilities`
  manifest in the next phase.
- **No contract-1 cursors.** A cursor is read only when `events_list` bound it to this plugin, source, workspace and
  scope.
- **Fixed context.** The Code Mode namespace line is the standard's 257-character text and the `slack-search` skill
  description is 209 characters; nothing is pinned and no hook runs per request. What left the namespace line (access
  levels, private-content consent, file reads, the tools RPC) is in the skill body.
- **Docs and CI.** The README, AGENTS.md and docs describe the new name and direction; CI is one `ci` job on Node 24
  that installs actionlint before the full check.
