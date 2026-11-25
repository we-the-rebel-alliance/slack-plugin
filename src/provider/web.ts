/**
 * Slack's Web API, for the three calls Slack's MCP server has no tool for: `auth.test`, `conversations.mark` and
 * `assistant.search.context`.
 *
 * The credential is the alias's own MCP sign-in: OpenCode stores it per server, and `ctx.integration.connection`
 * refreshes it near expiry and resolves it on demand. This module is the only place that reads the access token; it
 * puts it in one Authorization header and never returns, stores, logs or embeds it in an error. A failure names Slack's
 * error code, never the answer.
 */
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { secretKinds } from "@we-the-rebel-alliance/plugin-contract/events"
import { failure, needsSignIn, rateLimited, scopeMissing } from "../errors.ts"
import { SLACK_API_URL } from "./endpoints.ts"

/** The part of the plugin context a Web API call needs: the server list and the connection store. */
export interface WebContext {
  readonly mcp: { list(): Promise<{ readonly data: readonly { readonly name: string; readonly integrationID?: string | undefined }[] }> }
  readonly integration: {
    readonly connection: {
      active(integrationID: string): Promise<unknown>
      resolve(connection: unknown): Promise<unknown>
    }
  }
}

/** The three Web API methods the plugin calls. */
export const SLACK_API_METHODS = ["auth.test", "conversations.mark", "assistant.search.context"] as const
export type SlackApiMethod = (typeof SLACK_API_METHODS)[number]

const TIMEOUT_MS = 10_000
/** Slack's error codes are lower snake case, such as `missing_scope` or `channel_not_found`. */
const SLACK_CODE = /^[a-z][a-z0-9_]{0,63}$/
/** The scope or scopes Slack's `missing_scope` names in `needed`, such as `im:write`. */
const NEEDED = /^[a-z][a-z0-9:._-]{0,63}(?:,[a-z][a-z0-9:._-]{0,63}){0,9}$/
/** Slack's `Retry-After` header on a 429: whole seconds. */
const RETRY_AFTER = /^\d{1,5}$/

/** The sign-ins Slack refuses, which a person fixes in `/connect`. */
const AUTH_ERRORS = new Set(["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive", "invalid_token"])
/** The refusals that mean the input named something Slack cannot use. */
const INPUT_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "message_not_found",
  "invalid_arguments",
  "invalid_arg_name",
  "invalid_array_arg",
  "invalid_charset",
  "invalid_form_data",
  "invalid_post_type",
  "missing_post_type",
  "invalid_ts",
])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A copy of Slack's answer with every string the contract's detector names a credential left out. */
function scrub(value: unknown): unknown {
  if (typeof value === "string") return secretKinds(value).length > 0 ? undefined : value
  if (Array.isArray(value)) return value.map(scrub).filter((item) => item !== undefined)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const kept = scrub(item)
        return kept === undefined ? [] : [[key, kept]]
      }),
    )
  }
  return value
}

/** The alias's active OAuth credential, or undefined when there is none the plugin may use. */
export async function credential(ctx: WebContext, alias: string): Promise<{ readonly token: string; readonly metadata?: Readonly<Record<string, unknown>> } | undefined> {
  const name = accountName("slack", alias)
  let integrationID = name
  try {
    const server = (await ctx.mcp.list()).data.find((entry) => entry.name === name)
    if (typeof server?.integrationID === "string" && server.integrationID !== "") integrationID = server.integrationID
  } catch {
    // The list is an optimisation: the integration id falls back to the server name.
  }
  const connection = await ctx.integration.connection.active(integrationID).catch(() => undefined)
  if (!isRecord(connection) || connection["type"] === "env") return undefined
  const value = await ctx.integration.connection.resolve(connection).catch(() => undefined)
  if (!isRecord(value) || value["type"] !== "oauth" || typeof value["access"] !== "string" || value["access"] === "") return undefined
  return { token: value["access"], ...(isRecord(value["metadata"]) ? { metadata: value["metadata"] } : {}) }
}

/**
 * One request to Slack's Web API as the alias's own sign-in. The answer is Slack's JSON, scrubbed of token-shaped
 * strings; a refusal is a contract code with one next step.
 */
export async function webCall(ctx: WebContext, alias: string, method: SlackApiMethod, params: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
  const server = accountName("slack", alias)
  const found = await credential(ctx, alias)
  if (found === undefined) throw needsSignIn(alias, server, method)

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const stop = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let status: number
  let body: unknown
  let retryAfter: string | null = null
  try {
    const response = await fetch(`${SLACK_API_URL}${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${found.token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      redirect: "error",
      signal: stop,
    })
    status = response.status
    retryAfter = response.headers.get("retry-after")
    body = status === 429 ? undefined : await response.json().catch(() => undefined)
  } catch {
    throw failure("UNAVAILABLE", `Slack's ${method} could not be reached`, "Check the network, then try again.")
  }
  if (status === 429) {
    const wait = retryAfter !== null && RETRY_AFTER.test(retryAfter.trim()) ? Number(retryAfter.trim()) : undefined
    throw rateLimited(method, wait)
  }
  if (!isRecord(body) || typeof body["ok"] !== "boolean") throw failure("UNAVAILABLE", `Slack's ${method} answered something that is not Slack's JSON`, "Try again; if it keeps failing, read the plugin's status.")
  if (body["ok"] === true) return scrub(body) as Record<string, unknown>

  const error = typeof body["error"] === "string" && SLACK_CODE.test(body["error"]) ? body["error"] : "unknown_error"
  if (AUTH_ERRORS.has(error)) throw needsSignIn(alias, server, method)
  if (error === "missing_scope") {
    const needed = typeof body["needed"] === "string" && NEEDED.test(body["needed"]) ? body["needed"] : "the required scope"
    throw scopeMissing(needed)
  }
  if (error === "ratelimited") throw rateLimited(method)
  if (INPUT_ERRORS.has(error)) throw failure("INPUT_INVALID", `Slack's ${method} refused the input (${error})`, "Check the ids and the timestamp, then try again.")
  throw failure("UNAVAILABLE", `Slack's ${method} failed (${error})`, "Try again; if it keeps failing, read the plugin's status.")
}
