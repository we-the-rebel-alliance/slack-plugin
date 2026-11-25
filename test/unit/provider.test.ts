/**
 * The provider's mapping: Slack's two answer shapes, `auth.test`, the Web API refusals, the per-alias credential and
 * the MCP tool call. The fetch is a stub, so no test reaches Slack.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { identityOf } from "../../src/provider/slack.ts"
import { channelOptions, channelPage } from "../../src/handlers/messages.ts"
import { callTool } from "../../src/provider/mcp.ts"
import { credential, webCall, type WebContext } from "../../src/provider/web.ts"
import { failure } from "../../src/errors.ts"
import { callFor } from "../support/context.ts"

/** A JWT-shaped fake, assembled at runtime so no file in the repository carries a credential-shaped literal. */
const ACCESS = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0", "c2lnbmF0dXJlLXByb2Jl"].join(".")
const SERVERS = [
  { name: "slack", integrationID: "int-default" },
  { name: "slack-work", integrationID: "int-work" },
]

/** A context with a connection per server, as OpenCode keeps them. */
function webContext(options: { readonly connected?: boolean; readonly scope?: string } = {}): WebContext {
  const connected = options.connected ?? true
  return {
    mcp: { list: async () => ({ data: SERVERS }) },
    integration: {
      connection: {
        active: async (integrationID: string) => (connected ? { type: "credential", id: integrationID } : undefined),
        resolve: async () =>
          connected
            ? { type: "oauth", access: ACCESS, refresh: "refresh", expires: 0, metadata: { scope: options.scope ?? "channels:read users:read" } }
            : undefined,
      },
    },
  }
}

/** Run `work` with `fetch` replaced, restoring it after. */
async function withFetch<T>(stub: typeof globalThis.fetch, work: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await work()
  } finally {
    globalThis.fetch = original
  }
}

test("channelPage reads Slack's JSON messages", () => {
  const page = channelPage({
    output: { messages: [{ ts: "1794996900.000100", user: "U0AAKAI001", text: "hello", thread_ts: "1794996800.000100", reply_count: 2 }], response_metadata: { next_cursor: "next-page" } },
    text: "",
  })
  assert.equal(page.messages.length, 1)
  assert.equal(page.messages[0]!.user, "U0AAKAI001")
  assert.equal(page.messages[0]!.threadTs, "1794996800.000100")
  assert.equal(page.next, "next-page")
})

test("channelPage reads Slack's Markdown messages", () => {
  const text = [
    "### Message 1 of 2",
    "- **From:** Kai Mensah (ID: U0AAKAI001)",
    "- **Message TS:** 1794996900.000100",
    "- **Thread TS:** 1794996800.000100",
    "- **Text:** The migration is on for Thursday.",
    "---",
    'Pagination: next_cursor: "abc123"',
  ].join("\n")
  const page = channelPage({ text })
  assert.equal(page.messages.length, 1)
  assert.equal(page.messages[0]!.user, "U0AAKAI001")
  assert.equal(page.messages[0]!.text, "The migration is on for Thursday.")
  assert.equal(page.next, "abc123")
})

test("channelOptions reads Slack's JSON channel list", () => {
  const listed = channelOptions({ output: { channels: [{ id: "C0AAWORK01", name: "research" }], response_metadata: { next_cursor: "more" } }, text: "" })
  assert.deepEqual(listed.options, [{ id: "C0AAWORK01", label: "research" }])
  assert.equal(listed.next, "more")
})

test("channelOptions reads Slack's Markdown channel layout", () => {
  const text = ["### research", "- **ID:** `C0AAWORK01`", "- **Purpose:** The team's research channel.", "", "---", 'Pagination: next_cursor: "nextpage"'].join("\n")
  assert.deepEqual(channelOptions({ text }), { options: [{ id: "C0AAWORK01", label: "research" }], next: "nextpage" })
})

test("identityOf reads the workspace, the user, the grid and the address", () => {
  assert.deepEqual(identityOf({ team_id: "T0AAWORK01", team: "Acme", user_id: "U0AAANA001", user: "Ana Silva", url: "https://acme.slack.com/" }, "work"), {
    teamId: "T0AAWORK01",
    userId: "U0AAANA001",
    teamName: "Acme",
    userName: "Ana Silva",
    host: "acme.slack.com",
  })
  assert.deepEqual(identityOf({ team_id: "T0AAWORK01", user_id: "U0AAANA001", enterprise_id: "E0AAENT001" }, "work").enterpriseId, "E0AAENT001")
  assert.throws(() => identityOf({ team_id: "nope" }, "work"), /UNAVAILABLE:/)
})

test("webCall resolves the alias's own credential and never returns the token", async () => {
  let seen: { url: string; authorization: string } | undefined
  const stub = (async (url: string, init: RequestInit) => {
    seen = { url, authorization: (init.headers as Record<string, string>)["authorization"]! }
    return { status: 200, headers: { get: () => null }, json: async () => ({ ok: true, team_id: "T0AAWORK01", echo: ACCESS }) }
  }) as unknown as typeof globalThis.fetch
  const body = await withFetch(stub, () => webCall(webContext(), "work", "auth.test", {}))
  assert.equal(seen?.url, "https://slack.com/api/auth.test")
  assert.equal(seen?.authorization, `Bearer ${ACCESS}`)
  assert.equal(body["echo"], undefined, "a token-shaped value is scrubbed from the answer")
})

test("webCall answers NEEDS_SIGN_IN without a sign-in", async () => {
  await assert.rejects(() => webCall(webContext({ connected: false }), "work", "auth.test", {}), /NEEDS_SIGN_IN:/)
})

test("webCall maps Slack's refusals to contract codes, never echoing the token", async () => {
  const cases: { body: unknown; status?: number; headers?: Record<string, string>; code: string }[] = [
    { body: { ok: false, error: "invalid_auth" }, code: "NEEDS_SIGN_IN" },
    { body: { ok: false, error: "missing_scope", needed: "groups:history" }, code: "SCOPE_MISSING" },
    { body: { ok: false, error: "channel_not_found" }, code: "INPUT_INVALID" },
    { body: { ok: false, error: "ratelimited" }, code: "RATE_LIMITED" },
    { body: undefined, status: 429, headers: { "retry-after": "7" }, code: "RATE_LIMITED" },
    { body: { ok: false, error: "fatal_error" }, code: "UNAVAILABLE" },
  ]
  for (const item of cases) {
    const stub = (async () => ({
      status: item.status ?? 200,
      headers: { get: (name: string) => item.headers?.[name.toLowerCase()] ?? null },
      json: async () => item.body,
    })) as unknown as typeof globalThis.fetch
    try {
      await withFetch(stub, () => webCall(webContext(), "work", "conversations.mark", { channel: "C0AAWORK01", ts: "1794996900.000100" }))
      assert.fail(`expected ${item.code}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      assert.match(message, new RegExp(`^${item.code}: `), item.code)
      assert.equal(message.includes(ACCESS), false, "the token never appears in a refusal")
    }
  }
})

test("webCall maps a network failure to UNAVAILABLE", async () => {
  const stub = (async () => {
    throw new Error("connect ECONNREFUSED")
  }) as unknown as typeof globalThis.fetch
  await assert.rejects(() => withFetch(stub, () => webCall(webContext(), "work", "auth.test", {})), /UNAVAILABLE:/)
})

test("webCall keeps a 429's Retry-After", async () => {
  const stub = (async () => ({ status: 429, headers: { get: () => "7" }, json: async () => undefined })) as unknown as typeof globalThis.fetch
  try {
    await withFetch(stub, () => webCall(webContext(), "work", "auth.test", {}))
    assert.fail("expected RATE_LIMITED")
  } catch (error) {
    assert.equal((error as { retryAfterSec?: number }).retryAfterSec, 7)
  }
})

test("credential reads the alias's own server, and falls back to its name", async () => {
  const found = await credential(webContext(), "work")
  assert.equal(found?.token, ACCESS)
  assert.deepEqual(found?.metadata, { scope: "channels:read users:read" })
  const unnamed: WebContext = { mcp: { list: async () => ({ data: [] }) }, integration: { connection: { active: async () => ({ type: "credential", id: "slack-work" }), resolve: async () => ({ type: "oauth", access: ACCESS }) } } }
  assert.equal((await credential(unnamed, "work"))?.token, ACCESS)
})

test("callTool runs the alias's own Slack tool with the caller's context", async () => {
  const seen: { id?: string; input?: unknown } = {}
  const host = {
    tool: {
      list: async () => [
        {
          id: "slack-work_slack_read_channel",
          execute: async (input: unknown) => {
            seen.input = input
            return { output: { messages: [{ ts: "1794996900.000100", text: "hello" }] }, content: [{ type: "text", text: "hello" }] }
          },
        },
      ],
    },
  }
  const answer = await callTool(host as never, "work", "slack-work", "slack_read_channel", { channel_id: "C0AAWORK01" }, callFor("work"))
  assert.deepEqual((answer.output as { messages: unknown[] }).messages.length, 1)
  assert.deepEqual(seen.input, { channel_id: "C0AAWORK01" })
})

test("callTool refuses cleanly when the alias's server lists no tool", async () => {
  const host = { tool: { list: async () => [] } }
  await assert.rejects(() => callTool(host as never, "work", "slack-work", "slack_read_channel", {}, callFor("work")), /NEEDS_SIGN_IN:/)
})

test("callTool keeps a host permission refusal as PERMISSION_DENIED", async () => {
  const host = {
    tool: {
      list: async () => [
        {
          id: "slack-work_slack_read_channel",
          execute: async () => {
            throw Object.assign(new Error("blocked"), { _tag: "Permission.BlockedError" })
          },
        },
      ],
    },
  }
  await assert.rejects(() => callTool(host as never, "work", "slack-work", "slack_read_channel", {}, callFor("work")), /PERMISSION_DENIED:/)
})

test("a provider failure is the contract's failure", () => {
  assert.throws(() => {
    throw failure("TOO_LARGE", "a page over the limit", "Read less.")
  }, /TOO_LARGE: a page over the limit\. Next step: Read less\./)
})
