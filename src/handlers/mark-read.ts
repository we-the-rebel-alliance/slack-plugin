/**
 * `mark_read`: mark one Slack conversation read up to a message, with `conversations.mark`.
 *
 * It is the plugin's one write (class `write`, contract §6). Slack's MCP server has no tool for it, so it uses the
 * alias's own Web API credential. After the write succeeds it nudges every app through the bus with `changed` for the
 * workspace capability (contract §10); the nudge is best effort — the write already happened, and an app's next read is
 * the truth.
 */
import type { MethodHandler, MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { failure } from "../errors.ts"
import type { HandlerContext } from "./index.ts"

/** The capability the write changes: the workspace feed a mark-read affects. */
export const MARKED_CAPABILITY = "slack.workspace"

/** A channel (`C…`, `G…`) or direct message (`D…`). */
const CONVERSATION_ID = /^[CDG][A-Z0-9]{8,12}$/
/** Slack's ts: whole seconds, a dot and microseconds. */
const TS = /^\d{9,11}\.\d{6}$/

const INPUT = {
  type: "object",
  properties: {
    channel_id: { type: "string", pattern: CONVERSATION_ID.source, description: "A channel (C…, G…) or direct message (D…)" },
    ts: { type: "string", pattern: TS.source, description: "The message ts to mark read up to" },
  },
  required: ["channel_id", "ts"],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: "object",
  properties: {
    channel_id: { type: "string" },
    ts: { type: "string" },
    marked_read: { type: "boolean" },
  },
  required: ["channel_id", "ts", "marked_read"],
  additionalProperties: false,
} as const

/** The mark_read handler. */
export function markReadHandler(context: HandlerContext): MethodHandler {
  return {
    description: "Mark a Slack conversation read for the signed-in user up to a message ts. Needs the conversation type's :write scope.",
    input: INPUT,
    output: OUTPUT,
    async run(input, call: MethodCall) {
      const channel = input["channel_id"]
      const ts = input["ts"]
      if (typeof channel !== "string" || !CONVERSATION_ID.test(channel)) {
        throw failure("INPUT_INVALID", "mark_read's channel_id is not a conversation id", "Pass a channel id such as C0123ABCD45 or a direct message id such as D0123ABCD45.")
      }
      if (typeof ts !== "string" || !TS.test(ts)) {
        throw failure("INPUT_INVALID", "mark_read's ts is not a Slack message ts", "Pass a ts such as 1700000000.000100.")
      }
      await context.provider.mark(call.account, { channel, ts }, call.signal)
      await call.bus.emit("changed", { capability: MARKED_CAPABILITY, account: call.account, reason: "write" })
      return { channel_id: channel, ts, marked_read: true }
    },
  }
}
