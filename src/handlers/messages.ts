/**
 * Slack's answers, read into the contract's events (contract §7).
 *
 * Slack's MCP tools answer in two shapes: structured JSON (`messages: [{ ts, user, text, … }]`, a channel list under
 * `channels`) and Markdown. The parser reads the JSON first and the labelled Markdown lines second. It reads only the
 * fields an event needs; a message's own formatting is never interpreted.
 */
import { EVENT_LIMITS, makeEvent, type SourceEvent } from "@we-the-rebel-alliance/plugin-contract/events"
import type { ChannelOption, ChannelPage, SlackMessage } from "../provider/types.ts"

/** At most `max` characters, ending in `…` when cut, never splitting a surrogate pair. */
export function cut(value: string, max: number): string {
  if (value.length <= max) return value
  let end = max - 1
  const code = value.charCodeAt(end - 1)
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) end--
  return `${value.slice(0, end)}…`
}

/** Slack's ts: whole seconds, a dot and microseconds. */
const TS = /^(\d{9,11})\.(\d{1,6})$/
const USER_ID = /\b([UWB][A-Z0-9]{6,})\b/

type Data = Readonly<Record<string, unknown>>

/** A Slack ts as microseconds since the epoch. */
export function micros(ts: string): bigint {
  const match = TS.exec(ts)
  const seconds = match?.[1]
  const fraction = match?.[2]
  if (seconds === undefined || fraction === undefined) throw new Error(`not a Slack ts: ${JSON.stringify(ts.slice(0, 20))}`)
  return BigInt(seconds) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
}

/** Microseconds as a Slack ts. */
export function tsOf(value: bigint): string {
  return `${value / 1_000_000n}.${String(value % 1_000_000n).padStart(6, "0")}`
}

/** Whether a value is a Slack timestamp. */
export const isTs = (value: unknown): value is string => typeof value === "string" && TS.test(value)

const isRecord = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value)
const record = (value: unknown): Data => (isRecord(value) ? value : {})
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined)
const plain = (value: string) => value.replace(/\*\*/g, "").replace(/^`|`$/g, "").trim()

/** The conversation kind a channel id names, for an event's labels. */
export const kindOfChannel = (channel: string): "channel" | "group" | "dm" => (/^C/.test(channel) ? "channel" : /^G/.test(channel) ? "group" : "dm")

/** A labelled line: `From: …`, `- **Message TS:** …`. */
const FIELD = /^\s*(?:[-*]\s+)?(?:\*\*)?([A-Za-z][A-Za-z _]{0,30}?)(?:\*\*)?\s*:(?:\*\*)?\s?(.*)$/
/** A line that only separates messages: `=== THREAD PARENT MESSAGE ===`, `--- Reply 2 of 5 ---`, a heading, a rule. */
const SEPARATOR = /^\s*(?:={3,}.*|-{3,}.*|#{1,6}\s.*|\*{3,}|_{3,})$/
/** A pagination line, which belongs to no message. */
const PAGINATION = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:next[ _]?cursor|cursor|pagination(?:[ _]info)?|has[ _]more)(?:\*\*)?\s*:/i
const NEXT_CURSOR = /(?:next[ _]?cursor|cursor)\W{0,3}[:=][\s*"'`]*([A-Za-z0-9+/=_-]{6,})/i

type Key = "author" | "ts" | "thread" | "replies" | "permalink" | "text" | "ignored" | "after"
const KEYS: Readonly<Record<string, Key>> = {
  from: "author",
  user: "author",
  author: "author",
  sender: "author",
  postedby: "author",
  messagets: "ts",
  ts: "ts",
  timestamp: "ts",
  threadts: "thread",
  parentts: "thread",
  threadparentts: "thread",
  replycount: "replies",
  replies: "replies",
  permalink: "permalink",
  link: "permalink",
  text: "text",
  message: "text",
  time: "ignored",
  date: "ignored",
  channel: "ignored",
  postedat: "ignored",
  type: "ignored",
  reactions: "after",
  files: "after",
  attachments: "after",
  contextbefore: "after",
  contextafter: "after",
}

/** What a labelled line holds, or undefined for any other line. */
function keyOf(line: string): Key | undefined {
  const field = FIELD.exec(line)
  return field === null ? undefined : KEYS[field[1]!.toLowerCase().replace(/[\s_]+/g, "")]
}

/** `[label](url)`, `<url>` or a bare URL, as the URL. */
const linkOf = (value: string) => /https:\/\/[^\s)>\]|]+/.exec(value)?.[0]

/** The author of `From: Ama Mensah (ID: U0123)`, `From: <@U0123>` or `From: U0123`. */
function authorOf(value: string): { user?: string; name?: string } {
  const user = USER_ID.exec(value)?.[1]
  const name = plain(value.replace(/<@[^>]*>/g, "").replace(/\s*\([^()]*\)\s*$/, "")).replace(/\s+/g, " ")
  return { ...(user === undefined ? {} : { user }), ...(name === "" || name === user ? {} : { name }) }
}

/** One message from a block of labelled lines, or undefined when the block has no ts (a heading, an empty block). */
function blockMessage(lines: readonly string[]): SlackMessage | undefined {
  let ts: string | undefined
  let who: { user?: string; name?: string } = {}
  let threadTs: string | undefined
  let replies: number | undefined
  let permalink: string | undefined
  let after = false
  const body: string[] = []
  for (const line of lines) {
    const field = FIELD.exec(line)
    const key = keyOf(line)
    if (field === null || key === undefined) {
      if (!after) body.push(line)
      continue
    }
    const value = plain(field[2] ?? "")
    if (key === "author" && who.user === undefined && who.name === undefined) who = authorOf(value)
    else if (key === "ts" && ts === undefined && isTs(value)) ts = value
    else if (key === "thread" && isTs(value)) threadTs = value
    else if (key === "replies" && /^\d+$/.test(value)) replies = Number(value)
    else if (key === "permalink") permalink = linkOf(field[2] ?? "") ?? permalink
    else if (key === "text" && value !== "") body.push(field[2]!.trim())
    else if (key === "after") after = true
  }
  if (ts === undefined) return undefined
  const fromLink = permalink === undefined ? undefined : /[?&]thread_ts=(\d{9,11}\.\d{1,6})/.exec(permalink)?.[1]
  const thread = threadTs ?? fromLink
  return {
    ts,
    ...who,
    text: body.join("\n").trim(),
    ...(thread === undefined ? {} : { threadTs: thread }),
    ...(replies === undefined ? {} : { replies }),
    ...(permalink === undefined ? {} : { permalink }),
  }
}

/** The messages in Slack's Markdown text: blocks split at separator lines, and at a second author line. */
export function textMessages(content: string): SlackMessage[] {
  const blocks: string[][] = [[]]
  for (const line of content.split(/\r?\n/)) {
    if (PAGINATION.test(line)) continue
    if (SEPARATOR.test(line)) {
      blocks.push([])
      continue
    }
    const current = blocks.at(-1)!
    // A second author, or an author after a ts, starts the next message.
    if (keyOf(line) === "author" && current.some((seen) => keyOf(seen) === "author" || keyOf(seen) === "ts")) blocks.push([line])
    else current.push(line)
  }
  return blocks.flatMap((block) => blockMessage(block) ?? [])
}

/** A message from Slack's Web API shape, `{ ts, user, text, thread_ts, reply_count, permalink }`. */
function objectMessage(item: unknown): SlackMessage | undefined {
  const data = record(item)
  const ts = text(data["ts"]) ?? text(data["message_ts"])
  if (ts === undefined || !isTs(ts)) return undefined
  const user = text(data["user"]) ?? text(data["user_id"]) ?? text(data["bot_id"])
  const profile = record(data["user_profile"])
  const name = text(data["user_name"]) ?? text(data["username"]) ?? text(profile["real_name"]) ?? text(profile["display_name"])
  const threadTs = text(data["thread_ts"])
  const replies = data["reply_count"]
  const permalink = text(data["permalink"])
  return {
    ts,
    ...(user !== undefined && USER_ID.test(user) ? { user } : {}),
    ...(name === undefined ? {} : { name }),
    text: text(data["text"]) ?? "",
    ...(threadTs !== undefined && isTs(threadTs) ? { threadTs } : {}),
    ...(typeof replies === "number" && Number.isInteger(replies) ? { replies } : {}),
    ...(permalink?.startsWith("https://") ? { permalink } : {}),
  }
}

const parsed = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

/** One page of `slack_read_channel` or `slack_read_thread`: its messages, and the cursor of the next page, if any. */
export function channelPage(answer: { readonly output?: unknown; readonly text: string }): ChannelPage {
  const output = answer.output === undefined || typeof answer.output === "string" ? parsed(answer.output ?? answer.text) : answer.output
  const data = record(output)
  const meta = record(data["response_metadata"])
  const pagination = [text(meta["next_cursor"]), text(data["next_cursor"]), typeof data["pagination_info"] === "string" ? data["pagination_info"] : undefined]
  let next = pagination[0] ?? pagination[1] ?? NEXT_CURSOR.exec(pagination[2] ?? "")?.[1]
  let messages: SlackMessage[]
  if (Array.isArray(data["messages"])) messages = data["messages"].flatMap((item) => objectMessage(item) ?? [])
  else {
    const content = typeof data["messages"] === "string" ? data["messages"] : answer.text
    messages = textMessages(content)
    if (next === undefined && pagination[2] === undefined) next = content.split(/\r?\n/).filter((line) => PAGINATION.test(line)).map((line) => NEXT_CURSOR.exec(line)?.[1]).find(Boolean)
  }
  if (data["has_more"] === false) next = undefined
  return next === undefined ? { messages } : { messages, next }
}

/** The message's permalink: Slack's own, or one built from the workspace's address for a conversation id. */
function permalinkOf(channel: string, message: SlackMessage, host: string | undefined): string | null {
  if (message.permalink !== undefined) return message.permalink
  if (host === undefined || !/^[CDG]/.test(channel)) return null
  const reply = message.threadTs !== undefined && message.threadTs !== message.ts
  return `https://${host}/archives/${channel}/p${message.ts.replace(".", "")}${reply ? `?thread_ts=${message.threadTs}&cid=${channel}` : ""}`
}

/**
 * One event for one message of `channel`: `external_id` is the channel and the message ts, the thread is a stable
 * `slack-thread:<channel>:<ts>` key, and the labels name the conversation kind and the thread position.
 */
export function messageEvent(source: string, account: string, channel: string, message: SlackMessage, host?: string): SourceEvent {
  const parent = (message.replies ?? 0) > 0 ? message.ts : undefined
  const thread = message.threadTs ?? parent
  const reply = message.threadTs !== undefined && message.threadTs !== message.ts
  const first = message.text.split("\n").find((line) => line.trim() !== "")?.trim() ?? ""
  return makeEvent({
    source,
    account,
    external_id: `${channel}:${message.ts}`,
    kind: "message",
    occurred_at: Number(micros(message.ts) / 1000n),
    thread: thread === undefined ? null : `slack-thread:${channel}:${thread}`,
    actors: message.user === undefined ? [] : [{ role: "from", id: `slack:${message.user}`, ...(message.name === undefined ? {} : { name: cut(message.name, EVENT_LIMITS.actorName) }) }],
    title: first === "" ? `Message in ${channel}` : cut(first, 120),
    text: message.text,
    url: permalinkOf(channel, message, host),
    labels: [kindOfChannel(channel), `channel:${channel}`, ...(reply ? ["thread-reply"] : []), ...(parent !== undefined && !reply ? ["thread-parent"] : [])],
  })
}

/** A thread key as the workspace source writes it: `slack-thread:<channel>:<ts>`. */
export const THREAD_KEY = /^slack-thread:([CDG][A-Z0-9]{8,12}):(\d{9,11}\.\d{1,6})$/

/** The channel and ts a thread key names, or undefined for a key this source did not write. */
export function threadOf(key: unknown): { channel: string; ts: string } | undefined {
  const match = typeof key === "string" ? THREAD_KEY.exec(key) : null
  return match === null ? undefined : { channel: match[1]!, ts: match[2]! }
}

/** A conversation id Slack's answers and the manifest's scope accept. */
export const CONVERSATION_ID = /^[CDG][A-Z0-9]{8,12}$/

/** A conversation id or a user id whose direct messages the source reads. */
export const CHANNEL_ID = /^[CDGUW][A-Z0-9]{8,12}$/

const LISTED_ID = /\b([CDG][A-Z0-9]{8,12})\b/
/** Slack's Markdown channel list: a `### <name>` heading, then its own `- **ID:**` line. */
function channelLayout(content: string): { options: ChannelOption[]; next?: string } {
  const lines = content.split(/\r?\n/)
  const options: ChannelOption[] = []
  lines.forEach((line, index) => {
    const heading = /^###[ \t]+(.+?)\s*$/.exec(line)
    if (heading === null || (index > 0 && lines[index - 1]!.trim() !== "")) return
    const id = /^- \*\*ID:\*\*[ \t]*`?([CDG][A-Z0-9]{8,12})`?\s*$/.exec(lines[index + 1] ?? "")?.[1]
    const name = heading[1]!.replace(/^#+/, "").trim().replace(/\s+/g, " ").slice(0, 120)
    if (id !== undefined) options.push({ id, ...(name === "" ? {} : { label: name }) })
  })
  let end = lines.length - 1
  while (end >= 0 && lines[end]!.trim() === "") end--
  const last = end < 0 ? "" : lines[end]!.trimEnd()
  const next = /^Pagination:/.test(last) && lines[end - 1]?.trim() === "---" ? (/"([A-Za-z0-9+/=_-]{6,})"\s*$/.exec(last)?.[1] ?? NEXT_CURSOR.exec(last)?.[1]) : undefined
  return next === undefined ? { options } : { options, next }
}

/**
 * The conversations in one `slack_list_user_channels` answer, and its next page's cursor: Slack's JSON when it gives
 * it (`channels: [{ id, name }]`), else each line of its Markdown that holds a conversation id, labelled with the
 * `#name` or `Name:` the same line gives.
 */
export function channelOptions(answer: { readonly output?: unknown; readonly text: string }): { options: ChannelOption[]; next?: string } {
  const output = answer.output === undefined || typeof answer.output === "string" ? parsed(answer.output ?? answer.text) : answer.output
  const data = record(output)
  const meta = record(data["response_metadata"])
  const label = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : undefined)
  if (Array.isArray(data["channels"])) {
    const options = data["channels"].flatMap((item): ChannelOption[] => {
      const entry = record(item)
      const id = typeof entry["id"] === "string" && LISTED_ID.test(entry["id"]) ? entry["id"] : undefined
      const name = label(entry["name"])
      return id === undefined ? [] : [{ id, ...(name === undefined ? {} : { label: name }) }]
    })
    const next = label(meta["next_cursor"]) ?? label(data["next_cursor"])
    return next === undefined ? { options } : { options, next }
  }
  return channelLayout(answer.text)
}
