# Configuration

Every option is set in the plugin's entry in `opencode.json`:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/slack-plugin#v0.0.0",
      "options": {
        "access": "ask-changes",
        "accounts": { "work": {}, "personal": {} },
        "oauth": { "client_id": "1234567890.1234567890" },
        "events": { "channels": ["C0123ABCD45"] }
      }
    }
  ]
}
```

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods may do: everything, ask before changes, or reads only. |
| `accounts` | object | — | One profile per account alias. Each alias is one Slack workspace with its own sign-in. |
| `oauth` | object | — | The Slack app the sign-ins use. Set client_id here, or paste it in /connect under "Slack app client ID". |
| `events` | object | — | What the workspace source reads when a call names no channels. A private channel's history needs groups:history, which is not a default scope. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
<!-- /generated:configuration -->

## Nested options

| Option | Type | Default | Description |
|---|---|---|---|
| `events.channels` | list of ids | `[]` | The channel and direct-message ids a read uses when its call names no scope. A private channel's history needs `groups:history`, which is not a default scope. |
| `oauth.client_id` | string | — | The Slack app's client ID. The `/connect` "Slack app client ID" entry sets it otherwise. |
| `oauth.client_secret` | string | — | Only for a Slack app without PKCE; prefer `{env:SLACK_CLIENT_SECRET}`. |
| `oauth.redirect_uri` | string | `http://localhost:8765/callback` | A redirect URL registered on the app. |
| `oauth.callback_port` | integer | — | The local port a proxy forwards an `https:` redirect to; set only with an `https:` redirect. |
| `oauth.scopes` | list of scopes | the plugin's default list | The user scopes every alias's sign-in asks for. |
| `oauth.auth_server_metadata_url` | string | — | An OAuth metadata document to read instead of Slack's. |
| `accounts.<alias>.scopes` | list of scopes | the alias uses `oauth.scopes` | The user scopes that alias's sign-in asks for. |

## The Slack app

`oauth.client_id` is the app's client ID. Set it here for a managed configuration; otherwise leave it out and paste the
ID in `/connect` under **Slack app client ID**. `oauth.client_secret` is only for a Slack app without PKCE, and should be
`{env:SLACK_CLIENT_SECRET}` so the value stays out of the file. `oauth.redirect_uri` must be one of the app's redirect
URLs: the loopback default `http://localhost:8765/callback`, or an `https:` address your proxy forwards to OpenCode,
with `oauth.callback_port` naming the local port. `oauth.scopes` is the sign-in's user scopes; a profile's own `scopes`
list wins for that alias.

The app's scopes must include every scope the sign-in asks for. The default list reads public and private messages,
direct and group messages, the user's profile, and the searches the mentions source uses. It deliberately leaves out
`groups:history` and the `:write` scopes.

## Channels

`events.channels` is the list of ids a read uses when its call names no scope. A private channel's history needs
`groups:history`, which is not a default scope: add it to the app and to `oauth.scopes` before reading a `G…` channel
that is private. `mark_read` needs the conversation type's `:write` scope (`channels:write`, `groups:write`, `im:write`
or `mpim:write`), which is not a default either.

## Access

`access` is `all` (the default), `ask-changes` or `read-only`. It is the ceiling; no option widens it. `allowUntestedHost`
lets the plugin start outside `>=2.4.1 <2.5.0`; leave it off.

## Accounts

`accounts` maps an alias to a profile. An empty object is a valid profile; the only field is `scopes`, the Slack user
scopes that alias's sign-in asks for instead of `oauth.scopes`.
