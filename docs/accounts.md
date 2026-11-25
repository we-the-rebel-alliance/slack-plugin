# Accounts

Every alias is one Slack workspace with its own sign-in, its own cursors and its own status line. The plugin supports
several at once: `work`, `personal`, and as many more as you configure.

<!-- generated:accounts -->
Accounts are held by the **mcp** mechanism: the vendor's MCP server holds them.

| Field | Type | Required |
|---|---|---|
| `scopes` | array | no |
<!-- /generated:accounts -->

## Sign-in, one workspace at a time

The mechanism is `mcp`: Slack's own MCP server holds the OAuth sign-in, and OpenCode keeps each server's sign-in apart.
The plugin registers one server per alias, named `slack` for `default` and `slack-<alias>` for any other, so a sign-in for
`work` can never reach `personal`'s tools or token.

1. Set the Slack app's client ID once: `/connect` → **Slack app client ID**, or `oauth.client_id`.
2. Restart OpenCode so each alias's server is registered with the app's client ID.
3. `/connect` → `slack` (or `slack-work`) → sign in to that workspace.

The client ID is global because one Slack app signs in every workspace; the OAuth grant is per server because Slack's MCP
server keeps one workspace per grant. Without a client ID no server is registered: status says so, and its next step is
the one above.

## Picking an account

Every method that reads or writes Slack takes `account`; `status` takes none, and Slack's pass-through tools use their alias's server rather than an `account` input. With one alias it may be left out. With more than one, leaving
it out is `ACCOUNT_REQUIRED` and its next step lists the aliases; an alias the plugin does not have is `ACCOUNT_UNKNOWN`.

```json
{ "account": "work", "source": "workspace", "since": "2026-11-17T00:00:00Z" }
```

The alias is also the first half of a permission resource (`work:auth.test`) and of every MCP tool's permission
(`slack-work_slack_search_public`), so a rule for one alias cannot reach another.

## Cursors

A cursor is bound to the plugin, the source, the account and the scope. A cursor issued for `work` is refused as
`CURSOR_INVALID` when `personal` sends it, and a cursor for one scope is refused for another. Keep one cursor per source
and alias.

## Status

`status` lists each alias with `ready`, `needs_sign_in` or `error`, and the owner once the alias has answered: the Slack
user, with `orgs` naming the workspace (`slack-team:T…`) and, on an Enterprise Grid, the organization
(`slack-enterprise:E…`).
