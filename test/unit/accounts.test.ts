/**
 * The account wiring: the Slack-app client ID, one server per alias with that alias's scopes, and no server without a
 * client ID. Nothing here needs a real host: two transforms and a connection store are enough.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { APP_INTEGRATION_ID, registerAppIntegration, registerSlackAccounts, resolveClient, scopesOf, serverConfig, serverName } from "../../src/accounts.ts"
import { DEFAULT_SCOPES } from "../../src/defaults.ts"
import { manifest } from "../../src/manifest.ts"
import { readOptions } from "../../src/options.ts"

const OPTIONS = readOptions({ accounts: { work: {}, personal: { scopes: ["channels:read"] } }, oauth: { client_id: "1234.5678", scopes: ["channels:read", "users:read"] } })

test("one server per alias, named from the plugin's name", () => {
  assert.equal(serverName("default"), "slack")
  assert.equal(serverName("work"), "slack-work")
  assert.equal(accountName("slack", "personal"), "slack-personal")
})

test("a server carries the app's client ID, the alias's scopes and the plugin's redirect", () => {
  const server = serverConfig(OPTIONS, undefined) as { type: string; url: string; oauth: Record<string, unknown> }
  assert.equal(server.type, "remote")
  assert.equal(server.url, "https://mcp.slack.com/mcp")
  assert.equal(server.oauth["client_id"], "1234.5678")
  assert.equal(server.oauth["redirect_uri"], "http://localhost:8765/callback")
  assert.equal(server.oauth["scope"], "channels:read users:read")
  assert.deepEqual(scopesOf({ scopes: ["channels:read"] }, DEFAULT_SCOPES), ["channels:read"])
  assert.deepEqual(scopesOf(undefined, DEFAULT_SCOPES), DEFAULT_SCOPES)
})

test("the Slack app integration is registered with a client-ID key method", async () => {
  const seen: { updated?: string; method?: Record<string, unknown> } = {}
  const integration = {
    transform: async (callback: (editor: unknown) => void) => {
      callback({
        update: (id: string) => {
          seen.updated = id
        },
        method: {
          update: (registration: Record<string, unknown>) => {
            seen.method = registration
          },
        },
      })
    },
  }
  await registerAppIntegration(integration as never)
  assert.equal(seen.updated, APP_INTEGRATION_ID)
  assert.equal(seen.method?.["integrationID"], APP_INTEGRATION_ID)
  assert.equal((seen.method?.["method"] as { type: string }).type, "key")
})

test("resolveClient reads options first, then the /connect entry", async () => {
  const fromOptions = await resolveClient({ connection: { active: async () => undefined, resolve: async () => undefined } } as never, OPTIONS)
  assert.equal(fromOptions.client?.id, "1234.5678")
  const integration = {
    connection: {
      active: async (id: string) => (id === APP_INTEGRATION_ID ? { type: "credential", id } : undefined),
      resolve: async () => ({ type: "key", key: "9999.0000", metadata: { client_secret: "secret" } }),
      status: async () => undefined,
    },
  }
  const fromConnect = await resolveClient(integration as never, readOptions({}))
  assert.deepEqual(fromConnect, { client: { id: "9999.0000", secret: "secret" } })
})

test("no client ID means no server, and status names it", async () => {
  const problems: string[] = []
  const ctx = {
    options: { accounts: { work: {}, personal: {} } },
    integration: { transform: async () => undefined },
    mcp: {
      transform: async () => {
        problems.push("registered")
      },
    },
  }
  const registration = await registerSlackAccounts(ctx as never, manifest, OPTIONS, { problem: "no Slack app client ID is set" })
  assert.deepEqual(problems, [])
  assert.deepEqual(registration.accounts, [])
  assert.deepEqual(registration.problems, ["no Slack app client ID is set"])
})

test("registering with a client ID asks for one server per alias", async () => {
  const registered: string[] = []
  const ctx = {
    options: { accounts: { work: {}, personal: {} } },
    integration: { transform: async () => undefined },
    mcp: {
      transform: async (callback: (editor: { set(name: string): void }) => void) => {
        callback({ set: (name: string) => void registered.push(name) })
      },
    },
  }
  const registration = await registerSlackAccounts(ctx as never, manifest, OPTIONS, { client: { id: "1234.5678" } })
  assert.deepEqual(registered.sort(), ["slack-personal", "slack-work"])
  assert.deepEqual(registration.accounts.map((account) => account.alias), ["work", "personal"])
  assert.deepEqual(registration.problems, [])
})
