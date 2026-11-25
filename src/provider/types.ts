/**
 * What a handler asks the provider for, independent of how it is answered. The real provider reads Slack through the
 * account's MCP server and its three Web API calls; the tests answer the same interface with recorded synthetic data.
 */
import type { SourceError } from "@we-the-rebel-alliance/plugin-contract/events"

/** Whose sign-in answered: the workspace, its owner and the ids a probe reports. */
export interface SlackIdentity {
  /** The workspace id, `T…`, or an Enterprise Grid org's `E…` id. */
  readonly teamId: string
  /** The workspace's name, when Slack gives one. */
  readonly teamName?: string
  /** The Enterprise Grid organization, `E…`; absent outside a grid. */
  readonly enterpriseId?: string
  /** The grid organization's name, when Slack gives one. */
  readonly enterpriseName?: string
  /** The signed-in user, `U…` or `W…`. */
  readonly userId: string
  /** The user's name, when Slack gives one. */
  readonly userName?: string
  /** The workspace's address, such as `example.slack.com`, when Slack gives one. */
  readonly host?: string
}

/** One message as Slack's answers give it. */
export interface SlackMessage {
  readonly ts: string
  readonly user?: string
  readonly name?: string
  readonly text: string
  readonly threadTs?: string
  readonly replies?: number
  readonly permalink?: string
}

/** One page of a channel or thread read: its messages, and the cursor of the next page when Slack sends one. */
export interface ChannelPage {
  readonly messages: readonly SlackMessage[]
  readonly next?: string
}

/** One conversation a person may confirm as a scope value. */
export interface ChannelOption {
  readonly id: string
  readonly label?: string
}

/** One page of `assistant.search.context`: Slack's own result items, and the next page's cursor. */
export interface SearchPage {
  readonly messages: readonly unknown[]
  readonly next?: string
}

/** The call a handler runs in, as the MCP tool executor needs it. */
export interface ToolCall {
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly signal: AbortSignal
  progress(update?: Readonly<Record<string, unknown>>): Promise<void>
}

/** The input of one channel read, as Slack's `slack_read_channel` tool takes it. */
export interface ChannelRead {
  readonly channel_id: string
  readonly oldest?: string
  readonly latest?: string
  readonly cursor?: string
  readonly limit?: number
}

/** The input of one thread read, as Slack's `slack_read_thread` tool takes it. */
export interface ThreadRead {
  readonly channel_id: string
  readonly message_ts: string
  readonly cursor?: string
  readonly limit?: number
}

/**
 * One account's Slack reads and writes. Every method takes the account alias; the provider resolves that alias's own
 * MCP server and credential, so two workspaces never share a token.
 */
export interface SlackProvider {
  /** When the answer was read, UTC ISO. */
  asOf(): string
  /** `auth.test`: the workspace and user the alias is signed in as. Never reads content. */
  identity(alias: string, signal?: AbortSignal): Promise<SlackIdentity>
  /** The scopes Slack granted the alias's sign-in, when OpenCode stored them with the credential. */
  grantedScopes(alias: string): Promise<readonly string[] | undefined>
  /** `slack_read_channel`, through the alias's own MCP server. */
  readChannel(alias: string, input: ChannelRead, call: ToolCall): Promise<ChannelPage>
  /** `slack_read_thread`, through the alias's own MCP server. */
  readThread(alias: string, input: ThreadRead, call: ToolCall): Promise<ChannelPage>
  /** `slack_list_user_channels`, through the alias's own MCP server. */
  listChannels(alias: string, call: ToolCall): Promise<readonly ChannelOption[]>
  /** `assistant.search.context`, as the alias's own sign-in. */
  search(alias: string, input: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<SearchPage>
  /** `conversations.mark`, as the alias's own sign-in. The plugin's one write. */
  mark(alias: string, input: { readonly channel: string; readonly ts: string }, signal?: AbortSignal): Promise<void>
}

/** A provider failure in the contract's form; the register maps it to `CODE` and a next step. */
export type SlackFailure = SourceError
