# Slack plugin for OpenCode

Reads and acts on Slack from OpenCode: search messages, read a channel, a thread or a person, list conversations, create
and update canvases and lists, send and schedule messages, and mark a conversation read. It signs in to several Slack
workspaces at once, one per account alias, and every method takes the alias it should use.

Slack's own MCP tools are passed through as they are: their server holds the sign-in and the plugin never proxies one.
The plugin's own reads and its one write use the same account's sign-in.

## Install

```sh
opencode plugin add github:we-the-rebel-alliance/slack-plugin#v0.0.0
```

`v0.0.0` is the first release on plugin-contract v0. It supports OpenCode `>=2.4.1 <2.5.0`; on another release the plugin
refuses to start with `HOST_UNTESTED` unless `allowUntestedHost` is set.

## Sign in

1. Create a Slack app for the plugin from the manifest in `docs/slack-app-manifest.json`, with the redirect URL
   `http://localhost:8765/callback`, or use an app you already have. Its PKCE setting must be on if you do not paste a
   client secret.
2. In OpenCode, run `/connect` and choose **Slack app client ID**. Paste the app's client ID. This entry is global: every
   alias signs in through the same app.
3. Restart OpenCode. The plugin registers one Slack MCP server per alias — `slack` for `default`, `slack-work` for
   `work` — with that app's client ID.
4. Run `/connect` again and sign in to each server, one workspace each.

If you would rather keep the client ID in configuration, set `oauth.client_id` instead of step 2; see
[docs/configuration.md](docs/configuration.md).

## Accounts

Each alias is one Slack workspace with its own sign-in, its own cursors and its own status line:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/slack-plugin#v0.0.0",
      "options": { "accounts": { "work": {}, "personal": {} } }
    }
  ]
}
```

With one alias it may be left out of a call; with more than one, a call without `account` is `ACCOUNT_REQUIRED` and its
next step lists the aliases. See [docs/accounts.md](docs/accounts.md).

## Access

`access` is the ceiling for every agent:

| Level | Reads | Changes |
|---|---|---|
| `all` (default) | run | run |
| `ask-changes` | run | ask first |
| `read-only` | run | never run |

Three reads are narrower than the rest: `mentions_list`, and Slack's private-search and file-read tools, are off at
`ask-changes` and `read-only`. They are the reads that reach private content or another person's file, so the plugin's
table says `effect: deny` for them. Writes are confirmed by an OpenCode ask, or by a host-signed action grant when an app
calls over RPC; an allow rule alone is not a confirmation.

## What it reads and does

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `probe` | read | optional | `auth.test` |
| `events_list` | read | optional | `auth.test`, `slack_read_user_profile`, `slack_read_channel`, `slack_read_thread` |
| `thread_read` | read | optional | `auth.test`, `slack_read_thread` |
| `channels_list` | read | optional | `slack_list_user_channels` |
| `mentions_list` | read | optional | `auth.test`, `slack_read_user_profile`, `assistant.search.context` |
| `mark_read` | write | optional | `conversations.mark` |
| `mcp:slack_add_list_record` | write | optional | — |
| `mcp:slack_add_reaction` | write | optional | — |
| `mcp:slack_complete_file_upload` | send | optional | — |
| `mcp:slack_create_canvas` | write | optional | — |
| `mcp:slack_create_conversation` | share | optional | — |
| `mcp:slack_create_list` | write | optional | — |
| `mcp:slack_get_file_upload_url` | write | optional | — |
| `mcp:slack_get_reactions` | read | optional | — |
| `mcp:slack_list_channel_members` | read | optional | — |
| `mcp:slack_list_user_channels` | read | optional | — |
| `mcp:slack_read_canvas` | read | optional | — |
| `mcp:slack_read_channel` | read | optional | — |
| `mcp:slack_read_file` | read | optional | — |
| `mcp:slack_read_list` | read | optional | — |
| `mcp:slack_read_thread` | read | optional | — |
| `mcp:slack_read_user_profile` | read | optional | — |
| `mcp:slack_schedule_message` | send | optional | — |
| `mcp:slack_search_channels` | read | optional | — |
| `mcp:slack_search_emojis` | read | optional | — |
| `mcp:slack_search_public` | read | optional | — |
| `mcp:slack_search_public_and_private` | read | optional | — |
| `mcp:slack_search_users` | read | optional | — |
| `mcp:slack_send_message` | send | optional | — |
| `mcp:slack_send_message_draft` | send | optional | — |
| `mcp:slack_update_canvas` | write | optional | — |
| `mcp:slack_update_list` | write | optional | — |
| `mcp:slack_update_list_record` | write | optional | — |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|
| `slack.workspace` | events | `message` | `events_list` | free |
| `slack.mentions` | events | `message` | `mentions_list` | free |

### Actions

None.

### Bus events

`rpc.slack.changed`
<!-- /generated:capabilities -->

## Errors

Every failure reads `CODE: What happened. Next step: What to do.` The contract's codes and the plugin's own next steps:

<!-- generated:errors -->
| Code | Meaning |
|---|---|
| `NEEDS_SIGN_IN` | the account is not signed in |
| `SCOPE_MISSING` | the call needs a scope the person has not confirmed |
| `ACCOUNT_REQUIRED` | the plugin serves several accounts and the call names none |
| `ACCOUNT_UNKNOWN` | the call names an alias the plugin does not serve |
| `ACCOUNT_MISMATCH` | the item belongs to another account |
| `CURSOR_INVALID` | the cursor is malformed, or belongs to another source, account or scope |
| `CURSOR_EXPIRED` | the provider no longer keeps the history the cursor names |
| `RATE_LIMITED` | the provider asked the plugin to slow down |
| `BUDGET_EXCEEDED` | the read would cost more than the person allows |
| `SOURCE_DISABLED` | the person turned this source or action off |
| `TOO_LARGE` | the answer is larger than the source's maxBytes |
| `INPUT_INVALID` | the input does not match the method's schema |
| `SOURCE_UNKNOWN` | the plugin declares no such source |
| `SCHEMA_VIOLATION` | an answer does not keep the contract's shape |
| `PERMISSION_DENIED` | the person's grant does not cover the call |
| `PLAN_INVALID` | the plan is missing, or belongs to another method |
| `PLAN_USED` | the plan was already used by an earlier commit |
| `GRANT_INVALID` | the action grant did not verify, or was already spent |
| `HOST_UNTESTED` | OpenCode is outside the plugin's tested range |
| `OPTIONS_INVALID` | the plugin's options do not match their schema |
| `UNAVAILABLE` | the provider could not be reached |
<!-- /generated:errors -->

## Docs

- [docs/capabilities.md](docs/capabilities.md) — each source, method and event.
- [docs/accounts.md](docs/accounts.md) — the MCP mechanism, profiles and sign-in.
- [docs/configuration.md](docs/configuration.md) — every option and its default.
- [docs/automations.md](docs/automations.md) — a timer recipe for each source.
- [docs/architecture.md](docs/architecture.md) — the layers, the provider client and the OpenCode APIs used.
- [docs/security.md](docs/security.md) — what leaves the machine, scopes, redaction and confirmation.
- [skills/slack-search/SKILL.md](skills/slack-search/SKILL.md) — the workflow an agent follows.

## License

MIT.
