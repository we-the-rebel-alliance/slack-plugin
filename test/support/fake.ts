/**
 * The two synthetic Slack workspaces the tests and the conformance fixture use: `work` and `personal`.
 *
 * Every person, channel and message is invented. The fake answers the provider's interface the way Slack does: a
 * channel and its thread pages newest first with a cursor, a channel list with a next-page cursor, a search page
 * newest first, and `auth.test` per workspace. Nothing here talks to the network.
 */
import { DEFAULT_SCOPES } from "../../src/defaults.ts"
import { failure, needsSignIn } from "../../src/errors.ts"
import { serverName } from "../../src/accounts.ts"
import type { ChannelOption, ChannelPage, ChannelRead, SearchPage, SlackIdentity, SlackMessage, SlackProvider, ThreadRead, ToolCall } from "../../src/provider/types.ts"

/** The answer's time, fixed so a recorded fixture is deterministic. */
export const AS_OF = "2026-11-20T09:00:00.000Z"

/** One workspace's synthetic data. */
export interface FakeWorkspace {
  readonly identity: SlackIdentity
  readonly channels: readonly ChannelOption[]
  readonly messages: Readonly<Record<string, readonly SlackMessage[]>>
  /** `assistant.search.context` items, newest first. */
  readonly mentions: readonly Readonly<Record<string, unknown>>[]
}

const message = (ts: string, user: string, name: string, text: string, extra: { readonly threadTs?: string; readonly replies?: number } = {}): SlackMessage => ({
  ts,
  user,
  name,
  text,
  ...(extra.threadTs === undefined ? {} : { threadTs: extra.threadTs }),
  ...(extra.replies === undefined ? {} : { replies: extra.replies }),
})

/** The `work` workspace: a research channel with a thread, and a direct message. */
export const WORK: FakeWorkspace = {
  identity: { teamId: "T0AAWORK01", teamName: "Acme", userId: "U0AAANA001", userName: "Ana Silva", host: "acme.slack.com" },
  channels: [
    { id: "C0AAWORK01", label: "research" },
    { id: "D0AAKAI001", label: "Kai Mensah (direct message)" },
  ],
  messages: {
    C0AAWORK01: [
      message("1794996900.000100", "U0AAANA001", "Ana Silva", "The queue migration is on for Thursday. The runbook is in the shared space.", { replies: 1 }),
      message("1794997860.000200", "U0AAKAI001", "Kai Mensah", "Rehearsal passed. I will watch the lag after the switch.", { threadTs: "1794996900.000100" }),
      message("1795075200.000300", "U0AAKAI001", "Kai Mensah", "The lag stayed under a second after the switch."),
    ],
    D0AAKAI001: [message("1795065000.000400", "U0AAKAI001", "Kai Mensah", "No open incidents. Ping me if the queue backs up.")],
  },
  mentions: [
    {
      channel_id: "C0AAWORK01",
      message_ts: "1795081200.000500",
      author_user_id: "U0AAKAI001",
      author_name: "Kai Mensah",
      content: "Ana, the migration notes need your sign-off before Thursday.",
      permalink: "https://acme.slack.com/archives/C0AAWORK01/p1795081200000500",
    },
    {
      channel_id: "C0AAWORK01",
      message_ts: "1795081300.000600",
      author_user_id: "U0AAANA001",
      author_name: "Ana Silva",
      content: "Signed off. Thanks for the rehearsal.",
      permalink: "https://acme.slack.com/archives/C0AAWORK01/p1795081300000600",
    },
  ],
}

/** The `personal` workspace: one direct message, and one mention from its other side. */
export const PERSONAL: FakeWorkspace = {
  identity: { teamId: "T0BBPERS01", teamName: "Home", userId: "U0BBANA002", userName: "Ana Silva (personal)", host: "ana-home.slack.com" },
  channels: [{ id: "D0BBROWAN1", label: "Rowan Vale (direct message)" }],
  messages: {
    D0BBROWAN1: [message("1794942300.000100", "U0BBROWAN1", "Rowan Vale", "Are we still walking on Saturday?")],
  },
  mentions: [
    {
      channel_id: "D0BBROWAN1",
      message_ts: "1794942300.000100",
      author_user_id: "U0BBROWAN1",
      author_name: "Rowan Vale",
      content: "Ana, are we still walking on Saturday?",
      permalink: "https://ana-home.slack.com/archives/D0BBROWAN1/p1794942300000100",
    },
  ],
}

/** The two workspaces, by alias. */
export const WORKSPACES: Readonly<Record<string, FakeWorkspace>> = { work: WORK, personal: PERSONAL }

/** One mark_read call the fake saw. */
export interface MarkedRead {
  readonly alias: string
  readonly channel: string
  readonly ts: string
}

/** A fresh fake provider, with the calls it saw and the aliases whose sign-in it refuses. */
export function createFakeProvider(options: { readonly asOf?: string; readonly signedOut?: readonly string[] } = {}): SlackProvider & { readonly marks: MarkedRead[] } {
  const marks: MarkedRead[] = []
  const workspace = (alias: string): FakeWorkspace => {
    if (options.signedOut?.includes(alias)) throw needsSignIn(alias, serverName(alias), "this read")
    const found = WORKSPACES[alias]
    if (found === undefined) throw needsSignIn(alias, serverName(alias), "this read")
    return found
  }
  const page = <T>(items: readonly T[], cursor: string | undefined, limit: number): { items: readonly T[]; next?: string } => {
    const start = cursor === undefined ? 0 : Number(cursor)
    const offset = Number.isInteger(start) && start >= 0 ? start : 0
    const slice = items.slice(offset, offset + limit)
    const next = offset + slice.length < items.length ? String(offset + slice.length) : undefined
    return next === undefined ? { items: slice } : { items: slice, next }
  }
  const descending = (messages: readonly SlackMessage[]): SlackMessage[] => [...messages].sort((a, b) => (a.ts < b.ts ? 1 : -1))
  const find = (alias: string, channel: string): readonly SlackMessage[] => {
    const found = workspace(alias)
    if (!found.channels.some((option) => option.id === channel)) throw failure("INPUT_INVALID", `the account "${alias}" has no conversation ${channel}`, "Confirm a channel this account can read, then read again.")
    return found.messages[channel] ?? []
  }

  return {
    marks,
    asOf: () => options.asOf ?? AS_OF,

    async identity(alias) {
      return workspace(alias).identity
    },

    async grantedScopes(alias) {
      workspace(alias)
      return DEFAULT_SCOPES
    },

    async readChannel(alias, input: ChannelRead, _call: ToolCall): Promise<ChannelPage> {
      const after = input.oldest
      const before = input.latest
      const kept = descending(find(alias, input.channel_id)).filter((item) => (after === undefined || item.ts > after) && (before === undefined || item.ts < before))
      const result = page(kept, input.cursor, input.limit ?? 100)
      return { messages: result.items, ...(result.next === undefined ? {} : { next: result.next }) }
    },

    async readThread(alias, input: ThreadRead, _call: ToolCall): Promise<ChannelPage> {
      const thread = find(alias, input.channel_id).filter((item) => item.ts === input.message_ts || item.threadTs === input.message_ts).sort((a, b) => (a.ts < b.ts ? -1 : 1))
      const result = page(thread, input.cursor, input.limit ?? 100)
      return { messages: result.items, ...(result.next === undefined ? {} : { next: result.next }) }
    },

    async listChannels(alias): Promise<readonly ChannelOption[]> {
      return workspace(alias).channels
    },

    async search(alias, _input: Readonly<Record<string, string>>): Promise<SearchPage> {
      const found = workspace(alias)
      return { messages: found.mentions }
    },

    async mark(alias, input: { readonly channel: string; readonly ts: string }) {
      find(alias, input.channel)
      marks.push({ alias, channel: input.channel, ts: input.ts })
    },
  }
}
