/**
 * `channels_list`, the `slack.workspace` source's bind-time read: the person's conversations as `{ options: [{ id,
 * label }] }`, so a person can confirm the channels a read covers.
 *
 * It reads no content: only ids and names, from the alias's own `slack_list_user_channels`.
 */
import { LIST_OPTIONS_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { failure } from "../errors.ts"
import type { ToolCall } from "../provider/types.ts"
import type { HandlerContext } from "./index.ts"

const INPUT = {
  type: "object",
  properties: { source: { type: "string", description: "The source to list channels for: workspace" } },
  additionalProperties: false,
} as const

/** The channels_list handler. */
export function channelsListHandler(context: HandlerContext): MethodHandler {
  return {
    description: "List the Slack conversations this account may confirm for a read, as ids and names. It reads no message.",
    input: INPUT,
    output: LIST_OPTIONS_SCHEMA,
    async run(input, call) {
      if (input["source"] !== undefined && input["source"] !== "workspace") {
        throw failure("SOURCE_UNKNOWN", `channels_list lists channels for the source "workspace"`, "Leave source out, or pass \"workspace\".")
      }
      const options = await context.provider.listChannels(call.account, call as ToolCall)
      return { options: options.map((option) => ({ id: option.id, ...(option.label === undefined ? {} : { label: option.label }) })) }
    },
  }
}
