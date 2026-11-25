/**
 * The vendor's MCP tools, called with the caller's own context.
 *
 * The plugin declares Slack's tools as pass-through (`mcp:<tool>` in the manifest): their server owns them, and this
 * module never registers or proxies one. When the plugin's own read needs Slack's content it runs the alias's tool
 * through the host's executor, so the person's rules for `<server>_<tool>` apply to the inner call as they do to a
 * direct one. The MCP server holds the credential; the plugin never sees it here.
 */
import type { Plugin } from "@opencode/plugin"
import { needsSignIn, failure } from "../errors.ts"
import type { ToolCall } from "./types.ts"

/** What one tool answered: its structured output, when it gave one, and its text parts. */
export interface ToolAnswer {
  readonly output?: unknown
  readonly text: string
}

type ToolHost = Pick<Plugin.Context, "tool">
type ListedTool = Awaited<ReturnType<ToolHost["tool"]["list"]>>[number]
type ExecuteContext = Parameters<ListedTool["execute"]>[1]

/** The host's permission refusals, which must reach the person as PERMISSION_DENIED and never as a provider failure. */
const HOST_DENIALS = new Set(["Permission.BlockedError", "Permission.DeclinedError", "Permission.CorrectedError"])

/** The tag an error carries itself, or the one its cause carries. */
function tagOf(error: unknown): string | undefined {
  for (const holder of [error, typeof error === "object" && error !== null ? (error as { readonly error?: unknown }).error : undefined]) {
    const tag = typeof holder === "object" && holder !== null ? (holder as { readonly _tag?: unknown })._tag : undefined
    if (typeof tag === "string") return tag
  }
  return undefined
}

/**
 * Run one of the alias's Slack tools. The account's server name is `<name>` for `default` and `<name>-<alias>`
 * otherwise, so the tool's id is `<server>_<tool>` (`slack-work_slack_read_channel`).
 */
export async function callTool(host: ToolHost, alias: string, server: string, tool: string, input: Readonly<Record<string, unknown>>, call: ToolCall): Promise<ToolAnswer> {
  const id = `${server}_${tool}`
  const executor = (await host.tool.list()).find((entry) => entry.id === id)
  if (executor === undefined) {
    throw needsSignIn(alias, server, tool)
  }
  let result: Awaited<ReturnType<ListedTool["execute"]>>
  try {
    const context: ExecuteContext = {
      sessionID: call.sessionID as ExecuteContext["sessionID"],
      agent: call.agent as ExecuteContext["agent"],
      messageID: call.messageID as ExecuteContext["messageID"],
      id: call.id as ExecuteContext["id"],
      signal: call.signal,
      progress: call.progress,
    }
    result = await executor.execute(input as never, context)
  } catch (error) {
    const tag = tagOf(error)
    if (tag !== undefined && HOST_DENIALS.has(tag)) {
      throw failure("PERMISSION_DENIED", `Slack's ${tool} is not allowed for this session`, "Ask the person to allow it, or use a session whose agent allows it.")
    }
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith(`MCP server "${server}"`)) {
      throw failure("UNAVAILABLE", `OpenCode could not call Slack's ${tool}: the server ${server} is not connected`, `Sign in to the account's server (${server}) and try again.`)
    }
    throw failure("UNAVAILABLE", `Slack's ${tool} failed: ${message.split("\n", 1)[0] ?? "no message"}`, "Try again; if it keeps failing, read the plugin's status.")
  }
  const content = typeof result.content === "string" ? result.content : (result.content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
  // Slack answers some tools as `{ result: <Markdown> }`; the Markdown is the answer, so its lines read as lines.
  const markdown = wrapped(result.output) ?? wrapped(parsed(content))
  if (markdown !== undefined) return { text: markdown }
  return result.output === undefined ? { text: content } : { output: result.output, text: content }
}

/** The Markdown of an answer that is nothing but `{ result: <string> }`. */
function wrapped(value: unknown): string | undefined {
  const keys = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : []
  const result = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { readonly result?: unknown }).result : undefined
  return keys.length === 1 && keys[0] === "result" && typeof result === "string" ? result : undefined
}

function parsed(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}
