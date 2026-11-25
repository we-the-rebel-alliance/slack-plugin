/**
 * `thread_read`, the `slack.workspace` source's detail read: the thread one listed event belongs to.
 *
 * Its input is the event's own `thread` field (contract §7: a detail takes only the fields it declares, never the
 * event's prose). It answers a page of that thread's messages, oldest first.
 */
import { encodeBoundCursor } from "@we-the-rebel-alliance/plugin-contract/cursor"
import { PAGE_SCHEMA, eventsListResult, screenEvents, type PageExtras, type RefusedEvent } from "@we-the-rebel-alliance/plugin-contract/events"
import { findSource, maxBytesOf } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { failure } from "../errors.ts"
import type { SlackMessage, ToolCall } from "../provider/types.ts"
import type { HandlerContext } from "./index.ts"
import { bindingOf, canonicalScopeOf, PLUGIN_PACKAGE, scopeChannels, WORKSPACE_SOURCE } from "./events-list.ts"
import { messageEvent, micros, threadOf } from "./messages.ts"

/** The most pages one thread read takes, and the messages per page. */
const THREAD_PAGES = 3
const THREAD_PAGE_SIZE = 100

const INPUT = {
  type: "object",
  properties: {
    scope: {
      type: "object",
      properties: { channels: { type: "array", items: { type: "string" } } },
      additionalProperties: false,
    },
    fields: {
      type: "object",
      properties: { thread: { type: "string", description: "The listed event's own thread field" } },
      required: ["thread"],
      additionalProperties: false,
    },
  },
  required: ["fields"],
  additionalProperties: false,
} as const

/** The thread_read handler. */
export function threadReadHandler(context: HandlerContext): MethodHandler {
  return {
    description: "Read the Slack thread a listed event belongs to, from the event's own thread field, as a page of messages oldest first.",
    input: INPUT,
    output: PAGE_SCHEMA,
    async run(input, call) {
      const fields = typeof input["fields"] === "object" && input["fields"] !== null ? (input["fields"] as Record<string, unknown>) : {}
      const thread = threadOf(fields["thread"])
      if (thread === undefined) {
        throw failure("INPUT_INVALID", "thread_read's fields.thread is not a thread key this source wrote", "Pass the listed event's own thread field, such as slack-thread:C0123ABCD45:1700000000.000100.")
      }
      const scope = typeof input["scope"] === "object" && input["scope"] !== null ? canonicalScopeOf(input["scope"] as Record<string, string | string[]>) : undefined
      const confirmed = scopeChannels(scope)
      if (confirmed !== undefined && confirmed.length > 0 && !confirmed.includes(thread.channel)) {
        throw failure("PERMISSION_DENIED", `the thread is in ${thread.channel}, which the grant's scope does not confirm`, "Confirm that channel for this source, or read only threads of the confirmed channels.")
      }
      const identity = await context.provider.identity(call.account, call.signal)
      const found = new Map<string, SlackMessage>()
      let next: string | undefined
      let more = false
      for (let page = 0; page < THREAD_PAGES; page++) {
        const answer = await context.provider.readThread(call.account, { channel_id: thread.channel, message_ts: thread.ts, limit: THREAD_PAGE_SIZE, ...(next === undefined ? {} : { cursor: next }) }, call as ToolCall)
        for (const message of answer.messages) found.set(message.ts, { ...message, threadTs: message.threadTs ?? thread.ts })
        next = answer.next
        more = next !== undefined
        if (!more) break
      }
      const events = [...found.values()].sort((a, b) => (micros(a.ts) < micros(b.ts) ? -1 : 1)).map((message) => messageEvent(WORKSPACE_SOURCE, call.account, thread.channel, message, identity.host))
      const screened = screenEvents(events)
      const refused: RefusedEvent[] = screened.refused
      const threadScope = { channels: [thread.channel] }
      const cursor = encodeBoundCursor(bindingOf(`${WORKSPACE_SOURCE}.thread`, call.account, threadScope), { t: thread.ts })
      const extras: PageExtras = { plugin: PLUGIN_PACKAGE, asOf: context.provider.asOf(), scope: threadScope, ...(refused.length === 0 ? {} : { refused }) }
      const page = eventsListResult({ source: WORKSPACE_SOURCE, account: call.account, owner: { id: `slack:${identity.userId}`, label: identity.userName ?? identity.userId } }, screened.events, cursor, more, extras)
      // A detail read is not trimmed: a page over the source's limit is refused, so the thread is whole or not at all.
      const source = findSource(context.manifest, "slack.workspace")
      const maxBytes = source === undefined ? 65536 : maxBytesOf(source)
      const bytes = Buffer.byteLength(JSON.stringify(page), "utf8")
      if (bytes > maxBytes) {
        throw failure("TOO_LARGE", `the thread's detail page is ${bytes} bytes, over the ${maxBytes}-byte limit of slack.workspace`, "Read the channel's messages with events_list, or read the thread in a client that takes a larger thread.")
      }
      return page
    },
  }
}
