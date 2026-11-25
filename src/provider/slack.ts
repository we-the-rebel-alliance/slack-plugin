/**
 * The real Slack provider: the alias's own MCP server for its reads, and its own credential for the three Web API
 * calls. Every method takes the alias, so a call for `work` can only reach `slack-work`.
 */
import type { Plugin } from "@opencode/plugin"
import { serverName } from "../accounts.ts"
import { failure } from "../errors.ts"
import { channelOptions, channelPage } from "../handlers/messages.ts"
import { callTool } from "./mcp.ts"
import { credential, webCall } from "./web.ts"
import type { ChannelPage, ChannelRead, ChannelOption, SearchPage, SlackIdentity, SlackProvider, ThreadRead, ToolCall } from "./types.ts"

const TEAM_ID = /^[TE][A-Z0-9]{2,20}$/
const USER_ID = /^[UW][A-Z0-9]{2,20}$/
const ENTERPRISE_ID = /^E[A-Z0-9]{2,20}$/
/** A name `auth.test` gives: one line, without control characters. */
const NAME = /^[^\u0000-\u001f\u007f]{1,200}$/
/** A workspace's address in `auth.test`'s `url`: `https://<name>.slack.com/` or an Enterprise Grid one. */
const WORKSPACE_URL = /^https:\/\/([a-z0-9][a-z0-9-]*\.(?:enterprise\.)?slack\.com)\/?$/i
const SCOPE = /^[a-z][a-z0-9:._-]{0,63}$/
const CHANNEL_TYPES = "public_channel,private_channel,mpim,im"
/** The most pages one channel-list read follows, and the most options it answers (a suggest caps at 64). */
const LIST_PAGES = 5
const MAX_OPTIONS = 64

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined)

/** The account and owner in an `auth.test` answer, or a refusal when Slack named none. */
export function identityOf(body: Readonly<Record<string, unknown>>, alias: string): SlackIdentity {
  const teamId = body["team_id"]
  const userId = body["user_id"]
  if (typeof teamId !== "string" || !TEAM_ID.test(teamId) || typeof userId !== "string" || !USER_ID.test(userId)) {
    throw failure("UNAVAILABLE", `Slack's auth.test named no workspace and user for the account "${alias}"`, "Sign in again, then read status.")
  }
  const enterprise = body["enterprise_id"]
  const enterpriseId = typeof enterprise === "string" && ENTERPRISE_ID.test(enterprise) ? enterprise : undefined
  const teamName = typeof body["team"] === "string" && NAME.test(body["team"].trim()) ? body["team"].trim() : undefined
  const userName = typeof body["user"] === "string" && NAME.test(body["user"].trim()) ? body["user"].trim() : undefined
  const host = typeof body["url"] === "string" ? WORKSPACE_URL.exec(body["url"])?.[1]?.toLowerCase() : undefined
  return {
    teamId,
    userId,
    ...(teamName === undefined ? {} : { teamName }),
    ...(enterpriseId === undefined ? {} : { enterpriseId }),
    ...(userName === undefined ? {} : { userName }),
    ...(host === undefined ? {} : { host }),
  }
}

/** A fresh provider over one plugin context. */
export function createSlackProvider(ctx: Pick<Plugin.Context, "tool" | "mcp" | "integration">): SlackProvider {
  const server = (alias: string) => serverName(alias)
  return {
    asOf: () => new Date().toISOString(),

    async identity(alias, signal) {
      return identityOf(await webCall(ctx, alias, "auth.test", {}, signal), alias)
    },

    async grantedScopes(alias) {
      const found = await credential(ctx, alias).catch(() => undefined)
      const scope = found?.metadata?.["scope"]
      if (typeof scope !== "string" || scope.trim() === "") return undefined
      return scope.trim().split(/[\s,]+/).filter((item) => SCOPE.test(item))
    },

    async readChannel(alias, input: ChannelRead, call: ToolCall): Promise<ChannelPage> {
      const answer = await callTool(ctx, alias, server(alias), "slack_read_channel", { ...input, limit: input.limit ?? 100 }, call)
      return channelPage(answer)
    },

    async readThread(alias, input: ThreadRead, call: ToolCall): Promise<ChannelPage> {
      const answer = await callTool(ctx, alias, server(alias), "slack_read_thread", { ...input, limit: input.limit ?? 100 }, call)
      return channelPage(answer)
    },

    async listChannels(alias, call: ToolCall): Promise<readonly ChannelOption[]> {
      const seen = new Map<string, ChannelOption>()
      const used = new Set<string>()
      let cursor: string | undefined
      for (let page = 0; page < LIST_PAGES && seen.size < MAX_OPTIONS; page++) {
        const listed = channelOptions(await callTool(ctx, alias, server(alias), "slack_list_user_channels", { types: CHANNEL_TYPES, limit: 200, ...(cursor === undefined ? {} : { cursor }) }, call))
        for (const option of listed.options) if (!seen.has(option.id) && seen.size < MAX_OPTIONS) seen.set(option.id, option)
        // A cursor already used would read the same page again: stop.
        if (listed.next === undefined || used.has(listed.next)) break
        cursor = listed.next
        used.add(cursor)
      }
      return [...seen.values()]
    },

    async search(alias, input: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<SearchPage> {
      const body = await webCall(ctx, alias, "assistant.search.context", input, signal)
      const results = isRecord(body["results"]) ? body["results"] : {}
      const messages = Array.isArray(results["messages"]) ? results["messages"] : []
      const metadata = isRecord(body["response_metadata"]) ? body["response_metadata"] : {}
      const next = text(metadata["next_cursor"])
      return next === undefined ? { messages } : { messages, next }
    },

    async mark(alias, input: { readonly channel: string; readonly ts: string }, signal?: AbortSignal): Promise<void> {
      await webCall(ctx, alias, "conversations.mark", { channel: input.channel, ts: input.ts }, signal)
    },
  }
}

