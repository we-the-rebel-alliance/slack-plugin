# What the plugin reads and does

The manifest in `package.json` is the source of truth; this page adds what each entry is for.

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | `auth.test` |
| `probe` | read | optional | `auth.test`, `slack_read_user_profile` |
| `events_list` | read | optional | `auth.test`, `slack_read_channel` |
| `thread_read` | read | optional | `auth.test`, `slack_read_thread` |
| `channels_list` | read | optional | `slack_list_user_channels` |
| `mentions_list` | read | optional | `auth.test`, `assistant.search.context` |
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

## The two sources

`slack.workspace` is the messages around a person: the channels and direct messages a call confirms, read with the
account's own `slack_read_channel` tool. Its scope key is `channels`; `channels_list` suggests the values a person can
confirm. A `G…` id that is a private channel needs `groups:history`, which is not a default scope. The source's detail
read is `thread_read`, from a listed event's own `thread` field.

`slack.mentions` is the messages that mention the signed-in user, found with `assistant.search.context` as that user. It
has no scope: the search is the person's own mentions, and nothing narrower is available.

Both sources are private and free. A message that holds a secret is refused for good (`refused[]`) and the cursor moves
past it.

## The plugin's own reads

| Method | Reads | Notes |
|---|---|---|
| `status` | nothing | The versions, each alias's state and owner, the agents the access rules miss. |
| `probe` | `auth.test` (the profile read is declared for the inventory, not called) | The account and owner, with `orgs` naming the workspace and, on a grid, the organization. No content. |
| `events_list` | the workspace source | Oldest first; the cursor is bound to the account and scope. |
| `thread_read` | a listed event's thread | The source's detail read. A thread over the source's limit is `TOO_LARGE`, never cut. |
| `channels_list` | the account's conversations | Ids and names only, for a scope a person confirms. |
| `mentions_list` | `assistant.search.context` | The user's mentions, oldest first. `effect: deny` keeps it off at every level unless a later allow rule names it. |
| `mark_read` | nothing; writes | `conversations.mark` for one conversation. Emits `changed` for `slack.workspace` after the write. |

## Slack's tools, passed through

The 27 `mcp:slack_*` entries are Slack's own tools. Their server holds the tool and its sign-in; the plugin declares each
one so access can be decided per alias and per tool, and never registers or proxies one. The classes follow what the tool
does: `slack_complete_file_upload` is `send` (with a channel it shares the file there), `slack_create_conversation` is
`share` (it can grant up to 1000 people membership), the three `slack_send_*` tools are `send`, and the rest are `read` or
`write` as their names and effects say.

## The three narrow reads

`mentions_list`, `slack_search_public_and_private` and `slack_read_file` reach private content or another person's file.
The plugin's table gives them `effect: deny`, so they are denied at every level, `all` included: raising `access` does
not run one, and a later allow rule for one agent or tool is the only way to. That is narrower than asking at
`ask-changes`, and it is the choice the plugin makes on purpose.

## The bus

The plugin emits `rpc.slack.changed` with `{ capability, account, reason }` after `mark_read` writes. It carries no
content: an app re-reads `slack.workspace` for that account.
