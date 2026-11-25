# Automations

A person or an app drives reads on its own schedule. The plugin stores nothing and keeps no cursor: the caller keeps the
cursor in its automation's state, passes it back, and re-reads what the bus says changed. This page gives one recipe per
source.

<!-- generated:automations -->
| Source | Method | Provider floor | Suggested | Signals |
|---|---|---|---|---|
| `slack.workspace` | `tools.slack.events_list` | — | 2 min | `bus` |
| `slack.mentions` | `tools.slack.mentions_list` | — | 5 min | — |
<!-- /generated:automations -->

## The workspace feed

An OpenCode automation on a timer runs a Code Mode program with no model. It keeps the cursor in its own state, applies
the page, and advances the cursor once the page is accepted:

```js
// input.state is this automation's own: { cursor?: string }
const page = await tools.slack.events_list({
  account: "work",
  source: "workspace",
  scope: { channels: ["C0123ABCD45", "D0123ABCD45"] },
  ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
})

// Apply page.events, then page.refused. A refused event is final; the cursor moves past it.
state.cursor = page.cursor

return { state }
```

Without a cursor the read starts 24 hours back. The suggested cadence is every 2 minutes; Slack's history is cheap and
the page lists only what is new after the cursor. `more: false` is not "done": the next run lists what arrived since.

## The mentions feed

The same program with `source: "mentions"` and no scope:

```js
const page = await tools.slack.mentions_list({
  account: "work",
  ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
})
state.cursor = page.cursor
return { state }
```

The suggested cadence is every 5 minutes: the search reads the user's own mentions, and `mentions_list` is `effect: deny`,
so it is denied at every level until a later allow rule names it for the automation's agent.

## After a write

`mark_read` emits `rpc.slack.changed` with `{ capability: "slack.workspace", account, reason: "write" }`. An app that
receives it re-reads `slack.workspace` for that account through RPC; the event carries no content. A missed nudge costs a
re-read, never data.

## App-driven reads

An app that binds a source reads it through the contract's `read` module with a grant, one consumer, one account and one
scope. It keeps the cursor in the same transaction as the events it accepts; a refused event is already past it.
empty. The plugin never sees the app's cursor store.
