/**
 * The handlers, driven through the real handler table over the synthetic workspaces.
 *
 * Each test runs the handler a door would run: its own input and a `MethodCall` with a resolved account. An observable
 * answer is asserted, never a call the test invented.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_SCOPES } from "../../src/defaults.ts"
import type { SlackProvider } from "../../src/provider/types.ts"
import { callFor, fakeTable, handlersWith, recordingBus } from "../support/context.ts"
import { createFakeProvider, WORK } from "../support/fake.ts"

const SINCE = "2026-11-17T00:00:00Z"
const WORK_SCOPE = { channels: ["C0AAWORK01", "D0AAKAI001"] }
const WORK_THREAD = "slack-thread:C0AAWORK01:1794996900.000100"
/** A token-shaped fake, assembled at runtime so no file in the repository carries a credential-shaped literal. */
const FAKE_TOKEN = ["9f8e7d6c5b4a39", "281706f5e4d3c2b1a0"].join("")
const PERSONAL_THREAD = "slack-thread:D0BBROWAN1:1794942300.000100"

const run = (method: string, input: Readonly<Record<string, unknown>>, account = "work") => fakeTable()[method]!.run(input, callFor(account))

/** A provider that delegates to the fake, replacing one method. */
function withProvider(change: Partial<SlackProvider>): SlackProvider {
  return { ...createFakeProvider(), ...change }
}

test("events_list lists the confirmed channels oldest first, as contract events", async () => {
  const page = (await run("events_list", { source: "workspace", since: SINCE, scope: WORK_SCOPE })) as {
    source: string
    account: string
    owner: { id: string; label: string }
    events: { external_id: string; occurred_at: string; url: string | null; hash: string; labels: string[] }[]
    cursor: string
    more: boolean
    trust: string
    plugin: string
    asOf: string
  }
  assert.equal(page.source, "workspace")
  assert.equal(page.account, "work")
  assert.equal(page.trust, "untrusted")
  assert.equal(page.plugin, "@we-the-rebel-alliance/slack-plugin")
  assert.equal(page.owner.id, "slack:U0AAANA001")
  assert.deepEqual(page.events.map((event) => event.external_id), ["C0AAWORK01:1794996900.000100", "C0AAWORK01:1794997860.000200", "D0AAKAI001:1795065000.000400", "C0AAWORK01:1795075200.000300"])
  for (const event of page.events) assert.match(event.hash, /^sha256:[0-9a-f]{64}$/)
  assert.match(page.events[0]!.occurred_at, /^2026-11-18T/)
  assert.equal(page.more, false)
  assert.ok(page.cursor.length > 0)
})

test("events_list advances its cursor and refuses a cursor from another account", async () => {
  const table = fakeTable()
  const first = (await table["events_list"]!.run({ source: "workspace", since: SINCE, scope: WORK_SCOPE }, callFor("work"))) as { cursor: string }
  const next = (await table["events_list"]!.run({ source: "workspace", since: SINCE, scope: WORK_SCOPE, cursor: first.cursor }, callFor("work"))) as { events: unknown[]; more: boolean }
  assert.equal(next.events.length, 0)
  assert.equal(next.more, false)
  await assert.rejects(() => table["events_list"]!.run({ source: "workspace", since: SINCE, scope: WORK_SCOPE, cursor: first.cursor }, callFor("personal")), /CURSOR_INVALID:/)
})

test("events_list never skips a same-timestamp event across a page boundary", async () => {
  // Slack's ts is the message id and is unique within a channel, and an event's external id is `<channel>:<ts>`, so two
  // messages at one ts in one channel would share an external id and the contract forbids it. A same-ts tie can only be
  // between channels, and this page cut falls between them: the first page consumes the first channel's event only.
  const tie = "1795000000.000100"
  const provider = withProvider({
    readChannel: async (_alias, input) => {
      if (input.channel_id === "C0AAWORK01") return { messages: [{ ts: tie, user: "U0AAKAI001", name: "Kai Mensah", text: "first in the tie" }] }
      if (input.channel_id === "D0AAKAI001") return { messages: [{ ts: tie, user: "U0AAKAI001", name: "Kai Mensah", text: "second in the tie" }] }
      return { messages: [] }
    },
  })
  const table = handlersWith(provider)
  const read = (input: Readonly<Record<string, unknown>>) =>
    table["events_list"]!.run({ source: "workspace", since: SINCE, scope: WORK_SCOPE, limit: 1, ...input }, callFor("work")) as Promise<{
      events: { external_id: string; occurred_at: string }[]
      cursor: string
      more: boolean
    }>
  const first = await read({})
  assert.deepEqual(first.events.map((event) => event.external_id), ["C0AAWORK01:1795000000.000100"])
  assert.equal(first.more, true)
  const second = await read({ cursor: first.cursor })
  assert.deepEqual(second.events.map((event) => event.external_id), ["D0AAKAI001:1795000000.000100"])
  assert.equal(second.events[0]!.occurred_at, first.events[0]!.occurred_at)
  assert.equal(second.more, false)
  const third = await read({ cursor: second.cursor })
  assert.deepEqual(third.events, [])
})

test("events_list keeps its since filter across every cursor page and repeats no event", async () => {
  // The provider pages two messages at a time, so `C0AAWORK01` has a full first page and a later page with one more;
  // the read asks for one event per page and keeps `since` and the scope on every call, as a consumer does.
  const paged = createFakeProvider()
  const provider = withProvider({
    readChannel: async (alias, input, call) => paged.readChannel(alias, { ...input, limit: 2 }, call),
  })
  const table = handlersWith(provider)
  const run = (input: Readonly<Record<string, unknown>>) => table["events_list"]!.run({ source: "workspace", since: SINCE, scope: WORK_SCOPE, ...input }, callFor("work")) as Promise<{ events: { external_id: string }[]; cursor: string }>
  const matching = (await run({})).events.map((event) => event.external_id)
  assert.deepEqual(matching, ["C0AAWORK01:1794996900.000100", "C0AAWORK01:1794997860.000200", "D0AAKAI001:1795065000.000400", "C0AAWORK01:1795075200.000300"])

  const seen: string[] = []
  let cursor: string | undefined
  for (let page = 0; page < matching.length + 2; page++) {
    const answer = await run({ limit: 1, ...(cursor === undefined ? {} : { cursor }) })
    if (answer.events.length === 0) break
    assert.equal(answer.events.length, 1, "one event per page")
    seen.push(...answer.events.map((event) => event.external_id))
    cursor = answer.cursor
  }
  assert.deepEqual(seen, matching)
  assert.equal(new Set(seen).size, seen.length, "no page repeats an event")
})

test("events_list refuses a message that holds a secret, for good", async () => {
  const provider = withProvider({
    readChannel: async () => ({ messages: [{ ts: "1794996900.000100", user: "U0AAKAI001", text: `the migration key is token: ${FAKE_TOKEN}` }] }),
  })
  const table = handlersWith(provider)
  const page = (await table["events_list"]!.run({ source: "workspace", since: SINCE, scope: { channels: ["C0AAWORK01"] } }, callFor("work"))) as {
    events: unknown[]
    refused: { external_id: string; reason: string }[]
    cursor: string
  }
  assert.equal(page.events.length, 0)
  assert.deepEqual(page.refused.map((entry) => entry.reason), ["secret"])
  assert.ok(page.cursor.length > 0)
})

test("events_list refuses a channel id the account cannot read", async () => {
  await assert.rejects(() => run("events_list", { source: "workspace", since: SINCE, scope: { channels: ["C0ZZZZZZ99"] } }), /INPUT_INVALID:/)
})

test("thread_read answers the listed event's thread, oldest first", async () => {
  const page = (await run("thread_read", { scope: WORK_SCOPE, fields: { thread: WORK_THREAD } })) as { events: { external_id: string }[]; more: boolean }
  assert.deepEqual(page.events.map((event) => event.external_id), ["C0AAWORK01:1794996900.000100", "C0AAWORK01:1794997860.000200"])
  assert.equal(page.more, false)
})

test("thread_read refuses a key this source did not write, and a thread outside the confirmed scope", async () => {
  await assert.rejects(() => run("thread_read", { fields: { thread: "not-a-thread" } }), /INPUT_INVALID:/)
  await assert.rejects(() => run("thread_read", { scope: WORK_SCOPE, fields: { thread: PERSONAL_THREAD } }), /PERMISSION_DENIED:/)
})

test("thread_read answers TOO_LARGE rather than cutting a thread", async () => {
  const long = "a".repeat(4096)
  const provider = withProvider({
    readThread: async () => ({ messages: Array.from({ length: 24 }, (_, index) => ({ ts: `179499${String(7000 + index).padStart(4, "0")}.000100`, user: "U0AAKAI001", text: long })) }),
  })
  const table = handlersWith(provider)
  await assert.rejects(() => table["thread_read"]!.run({ scope: WORK_SCOPE, fields: { thread: WORK_THREAD } }, callFor("work")), /TOO_LARGE:/)
})

test("channels_list answers the account's conversations as options", async () => {
  const answer = (await run("channels_list", { source: "workspace" })) as { options: { id: string; label?: string }[] }
  assert.deepEqual(answer.options, [
    { id: "C0AAWORK01", label: "research" },
    { id: "D0AAKAI001", label: "Kai Mensah (direct message)" },
  ])
})

test("mentions_list lists the user's mentions and leaves out the user's own message", async () => {
  const page = (await run("mentions_list", { source: "mentions", since: SINCE })) as { events: { external_id: string; actors: { id: string }[] }[]; more: boolean }
  assert.deepEqual(page.events.map((event) => event.external_id), ["C0AAWORK01:1795081200.000500"])
  assert.equal(page.events[0]!.actors[0]!.id, "slack:U0AAKAI001")
  assert.equal(page.more, false)
})

test("mentions_list refuses a cursor from another account", async () => {
  const work = (await run("mentions_list", { source: "mentions", since: SINCE })) as { cursor: string }
  await assert.rejects(() => run("mentions_list", { source: "mentions", since: SINCE, cursor: work.cursor }, "personal"), /CURSOR_INVALID:/)
})

test("mark_read writes, then nudges the workspace capability", async () => {
  const provider = createFakeProvider()
  const { bus, emitted } = recordingBus()
  const table = handlersWith(provider)
  const answer = await table["mark_read"]!.run({ channel_id: "C0AAWORK01", ts: "1794996900.000100" }, callFor("work", { bus }))
  assert.deepEqual(answer, { channel_id: "C0AAWORK01", ts: "1794996900.000100", marked_read: true })
  assert.deepEqual(provider.marks, [{ alias: "work", channel: "C0AAWORK01", ts: "1794996900.000100" }])
  assert.deepEqual(emitted, [{ event: "changed", data: { capability: "slack.workspace", account: "work", reason: "write" } }])
})

test("mark_read does not nudge when the write fails", async () => {
  const { bus, emitted } = recordingBus()
  const table = fakeTable()
  await assert.rejects(() => table["mark_read"]!.run({ channel_id: "C0ZZZZZZ99", ts: "1794996900.000100" }, callFor("work", { bus })), /INPUT_INVALID:/)
  assert.deepEqual(emitted, [])
})

test("status lists both aliases with their owners", async () => {
  const answer = (await fakeTable()["status"]!.run({}, callFor("default"))) as {
    state: string
    accounts: { alias: string; state: string; owner?: { id: string; orgs: { id: string }[] } }[]
    unguardedAgents: string[]
  }
  assert.equal(answer.state, "ready")
  assert.deepEqual(answer.accounts.map((entry) => [entry.alias, entry.state]), [["work", "ready"], ["personal", "ready"]])
  assert.deepEqual(answer.accounts[0]!.owner?.orgs.map((org) => org.id), ["slack-team:T0AAWORK01"])
})

test("status says needs_sign_in for an alias with no sign-in", async () => {
  const table = handlersWith(createFakeProvider({ signedOut: ["work"] }))
  const answer = (await table["status"]!.run({}, callFor("default"))) as { state: string; accounts: { alias: string; state: string }[] }
  assert.equal(answer.state, "needs_sign_in")
  assert.deepEqual(answer.accounts.map((entry) => [entry.alias, entry.state]), [["work", "needs_sign_in"], ["personal", "ready"]])
})

test("status reports an unreadable agent list as error, never zero", async () => {
  const answer = (await fakeTable()["status"]!.run({}, callFor("default", { unguarded: async () => ({ ok: false as const, error: "the agent list could not be read" }) }))) as {
    state: string
    unguardedAgents: string[]
    nextStep: string
  }
  assert.equal(answer.state, "error")
  assert.deepEqual(answer.unguardedAgents, [])
  assert.match(answer.nextStep, /agent list could not be read/)
})

test("probe answers the owner and the workspace, with the sign-in's scopes, and no content", async () => {
  const answer = (await run("probe", { source: "workspace" })) as {
    source: string
    account: string
    owner: { id: string; label: string; orgs: { id: string; label: string }[] }
    scopes: string[]
    trust: string
  }
  assert.equal(answer.source, "workspace")
  assert.equal(answer.account, "work")
  assert.equal(answer.owner.id, "slack:U0AAANA001")
  assert.deepEqual(answer.owner.orgs, [{ id: "slack-team:T0AAWORK01", label: "Acme" }])
  assert.deepEqual(answer.scopes, DEFAULT_SCOPES)
  assert.equal(answer.trust, "untrusted")
})

test("probe names the enterprise organization on a grid", async () => {
  const grid = { ...WORK.identity, enterpriseId: "E0AAENT001", enterpriseName: "Acme Grid" }
  const table = handlersWith(withProvider({ identity: async () => grid }))
  const answer = (await table["probe"]!.run({ source: "mentions" }, callFor("work"))) as { source: string; owner: { orgs: { id: string; label: string }[] } }
  assert.equal(answer.source, "mentions")
  assert.deepEqual(answer.owner.orgs, [
    { id: "slack-team:T0AAWORK01", label: "Acme" },
    { id: "slack-enterprise:E0AAENT001", label: "Acme Grid" },
  ])
})
