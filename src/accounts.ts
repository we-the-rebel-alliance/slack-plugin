/**
 * The plugin's accounts: one Slack workspace per alias, held by the `mcp` mechanism (contract §5).
 *
 * Each alias gets one vendor MCP server at Slack's endpoint, named `slack` for `default` and `slack-<alias>` otherwise;
 * OpenCode keys each server's OAuth separately, so two workspaces never share a token. One Slack app signs them all in:
 * its client ID lives in the global `slack-app` integration, or in `options.oauth.client_id`.
 *
 * Without a client ID no server is registered: the servers are registered once at setup, so a person who pastes the ID
 * later restarts OpenCode. Status names the missing ID and the next step.
 */
import type { Plugin } from "@opencode/plugin"
import { accountName, registerAccounts, type AccountProfile, type AccountsRegistration } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { scopeListProblem, type SlackOptions } from "./options.ts"
import { MCP_SERVER_URL } from "./provider/endpoints.ts"

/** The one global integration that stores the Slack app's client ID. */
export const APP_INTEGRATION_ID = "slack-app"
/** The name `/connect` shows for that entry. */
export const APP_NAME = "Slack app client ID"

/** What the plugin knows about the Slack app: its client ID, its secret for an app without PKCE, or why it has none. */
export interface ClientState {
  readonly client?: { readonly id: string; readonly secret?: string }
  /** A problem for status: no client ID, or one Slack cannot use. */
  readonly problem?: string
}

const NO_SPACES = /^\S+$/
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** The MCP server an alias signs in to: `slack` for `default`, `slack-<alias>` otherwise. */
export function serverName(alias: string): string {
  return accountName("slack", alias)
}

/**
 * Register "Slack app client ID" in `/connect`: a key method whose key is the client ID, with an optional client secret
 * for an app without PKCE. Both are kept in OpenCode's credential store, never in the plugin.
 */
export async function registerAppIntegration(integration: Pick<Plugin.Context["integration"], "transform">): Promise<unknown> {
  return integration.transform((editor) => {
    editor.update(APP_INTEGRATION_ID, (draft) => {
      draft.name = APP_NAME
    })
    editor.method.update({
      integrationID: APP_INTEGRATION_ID,
      method: {
        type: "key",
        label: APP_NAME,
        form: [
          {
            key: "client_secret",
            type: "string",
            title: "Client secret",
            description: "Only for a Slack app without PKCE. Leave it out for an app made from the plugin's manifest.",
            required: false,
          },
        ],
      },
    })
  })
}

/** The Slack app's client ID: `options.oauth.client_id` first, then the `/connect` entry. */
export async function resolveClient(integration: Pick<Plugin.Context["integration"], "connection">, options: SlackOptions): Promise<ClientState> {
  const configured = options.oauth.clientId
  if (configured !== undefined) return { client: { id: configured, ...(options.oauth.clientSecret === undefined ? {} : { secret: options.oauth.clientSecret }) } }
  const connection = await integration.connection.active(APP_INTEGRATION_ID).catch(() => undefined)
  const stored = connection === undefined ? undefined : await integration.connection.resolve(connection).catch(() => undefined)
  if (connection === undefined || !isRecord(stored) || stored["type"] !== "key") {
    return { problem: "no Slack app client ID is set: paste one in /connect under \"Slack app client ID\", or set options.oauth.client_id" }
  }
  const id = typeof stored["key"] === "string" ? stored["key"].trim() : ""
  if (id === "" || !NO_SPACES.test(id)) {
    await integration.connection
      .status({ integrationID: APP_INTEGRATION_ID, connection, status: { status: "needs_auth", message: "This is not a Slack client ID: it is empty or has spaces." } })
      .catch(() => undefined)
    return { problem: "the saved Slack app client ID is not a client ID: it is empty or has spaces" }
  }
  const metadata = isRecord(stored["metadata"]) ? stored["metadata"] : {}
  const secret = typeof metadata["client_secret"] === "string" ? metadata["client_secret"].trim() : ""
  return { client: { id, ...(secret === "" ? {} : { secret }) } }
}

/** The scopes one alias's sign-in asks for: its profile's list, or the plugin's. */
export function scopesOf(profile: Readonly<Record<string, unknown>> | undefined, fallback: readonly string[]): readonly string[] {
  const listed = profile?.["scopes"]
  if (listed === undefined) return fallback
  const problem = scopeListProblem(listed)
  if (problem !== undefined) throw new Error(`options.accounts.scopes ${problem}`)
  return listed as readonly string[]
}

/**
 * One alias's server: Slack's MCP endpoint with that alias's OAuth, the plugin's redirect and the alias's scopes. It is
 * named once, here, and an alias's server keeps its own sign-in.
 */
export function serverConfig(options: SlackOptions, profile: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  const oauth: Record<string, unknown> = {
    ...(options.oauth.clientId === undefined ? {} : { client_id: options.oauth.clientId }),
    ...(options.oauth.clientSecret === undefined ? {} : { client_secret: options.oauth.clientSecret }),
    redirect_uri: options.oauth.redirectUri,
    ...(options.oauth.callbackPort === undefined ? {} : { callback_port: options.oauth.callbackPort }),
    scope: scopesOf(profile, options.oauth.scopes).join(" "),
    ...(options.oauth.authServerMetadataUrl === undefined ? {} : { auth_server_metadata_url: options.oauth.authServerMetadataUrl }),
  }
  return { type: "remote", url: MCP_SERVER_URL, oauth }
}

/**
 * Register one Slack server per alias. Without a client ID nothing is registered: a server with no OAuth client cannot
 * sign in, and status names the missing ID instead. What registering could not do is kept for status.
 */
export async function registerSlackAccounts(ctx: Pick<Plugin.Context, "integration" | "mcp" | "options">, manifest: Manifest, options: SlackOptions, client: ClientState): Promise<AccountsRegistration> {
  if (client.client === undefined) {
    return { mechanism: "mcp", accounts: [], problems: [client.problem ?? "no Slack app client ID is set"] }
  }
  const { id, secret } = client.client
  const settings = {
    ...options,
    oauth: { ...options.oauth, clientId: id, ...(secret === undefined ? {} : { clientSecret: secret }) },
  }
  const registration = await registerAccounts(ctx, {
    manifest,
    options: { accounts: accountProfiles(ctx) },
    server: (account: AccountProfile) => serverConfig(settings, account.profile),
  })
  return registration
}

/** The `accounts` option as it was configured: `registerAccounts` reads the aliases and profiles from it. */
function accountProfiles(ctx: Pick<Plugin.Context, "options">): Readonly<Record<string, unknown>> {
  const raw = ctx.options?.["accounts"]
  return isRecord(raw) ? raw : {}
}
