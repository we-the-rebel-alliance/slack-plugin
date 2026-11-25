# Security

## What leaves the machine

The plugin talks to two Slack endpoints and nothing else:

- `https://mcp.slack.com/mcp`, through the account's own MCP server, for Slack's tools;
- `https://slack.com/api/`, for `auth.test`, `assistant.search.context` and `conversations.mark`.

A read sends only what the call names: channel ids, a cursor bound to the account and scope, a thread key, a search
query built from the signed-in user's own id. Nothing is sent to any other host, and no telemetry is collected.

## Credentials

The vendor's MCP server holds the OAuth grant; OpenCode stores and refreshes it per server, and the plugin resolves it
through `ctx.integration.connection` only when it must call Slack's Web API. `src/provider/web.ts` is the only module that
reads the access token. It puts the token in one `Authorization` header and returns Slack's answer with token-shaped
strings scrubbed out. A failure names Slack's error code, never the answer or the token. Status, logs and events never
carry a credential: status reasons are redacted and cut to 160 characters by the contract's `redactReason`.

Fixtures and tests are synthetic: every person, channel, message and token in `fixtures/` and `test/` is invented.

## Scopes

`oauth.scopes` lists the user scopes a sign-in asks for, and each alias's profile may narrow or change them. The default
list is the consent-list reads (`channels:read`, `groups:read`, `im:read`, `mpim:read`), public-channel search, the user
profile, the private and direct-message searches the mentions source uses, and direct-message and group-message history.

Two powers are deliberately not default:

- `groups:history`, needed to read a private channel's history. Add it to the app and to `oauth.scopes` before reading a
  private `G…` channel.
- The write scopes (`channels:write`, `groups:write`, `im:write`, `mpim:write`), needed by `mark_read`. Add the
  conversation type's scope before marking a conversation read.

`docs/slack-app-manifest.json` is a complete app manifest; the plugin requests a subset of it.

## Access and confirmation

`access` is the ceiling and the contract enforces it: `read` methods run at every level, a `write` asks at `ask-changes`
and is off at `read-only`, and a method's `effect` narrows it further. `mentions_list`, Slack's private search and
Slack's file read carry `effect: deny`, so they are denied at every level, `all` included; a later allow rule for one
agent or tool is the only way to run one.

A non-read call over RPC needs a confirmation: an OpenCode ask, or a host-signed action grant bound to the method, the
account, the manifest hash and the exact input. An allow rule alone is not a confirmation. The plugin declares no
`actions`: its writes are Slack's own tools and `mark_read`, and each is confirmed the same way.

## Untrusted data

Every answer carries `trust: "untrusted"`. Slack message text is data: the plugin never follows it, never echoes it into
status, and never uses it to choose a tool or a recipient. A message whose title or text holds a credential is refused
(`refused[]`, reason `secret`) and the cursor moves past it.

## Reporting

See [SECURITY.md](../SECURITY.md).
