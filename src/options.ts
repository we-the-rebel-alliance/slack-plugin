/**
 * The plugin's own options, checked once at setup.
 *
 * `access`, `accounts` and `allowUntestedHost` are the contract's: the register applies the first, `accounts` reads
 * the second and `assertHost` the third. This module reads what only Slack knows: the app's OAuth settings and the
 * channel ids a read may use when a call names none. A bad value refuses setup with `OPTIONS_INVALID` and a next step.
 */
import { DEFAULT_REDIRECT_URI, DEFAULT_SCOPES, MAX_CHANNELS, CHANNEL_ID } from "./defaults.ts"

/** The Slack app every alias signs in with. */
export interface OAuthOptions {
  /** The app's client ID; `/connect`'s "Slack app client ID" entry sets it otherwise. */
  readonly clientId?: string
  /** Only for an app without PKCE. */
  readonly clientSecret?: string
  readonly redirectUri: string
  /** The local port a proxy forwards an `https:` redirect to. */
  readonly callbackPort?: number
  /** The user scopes a sign-in asks for unless the alias's profile lists its own. */
  readonly scopes: readonly string[]
  /** An authorization-server metadata document to read instead of Slack's. */
  readonly authServerMetadataUrl?: string
}

/** The options the plugin reads itself. */
export interface SlackOptions {
  readonly oauth: OAuthOptions
  /** The channel and direct-message ids a read uses when its call names none. */
  readonly channels: readonly string[]
}

const NO_SPACES = /^\S+$/
const SCOPE = /^[a-z][a-z0-9:._-]{0,63}$/
/** Longer than any metadata address a host serves, and short enough to refuse a pasted document. */
const MAX_METADATA_URL_LENGTH = 2048
const TOP_KEYS = ["oauth", "allowUntestedHost", "access", "accounts", "events"]
const OAUTH_KEYS = ["client_id", "redirect_uri", "callback_port", "scopes", "client_secret", "auth_server_metadata_url"]
const EVENTS_KEYS = ["channels"]

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A refusal in the contract's form; setup throws it, so a bad option leaves nothing half-registered. */
function invalid(field: string, message: string, next: string): Error {
  return new Error(`OPTIONS_INVALID: options.${field} ${message}. Next step: ${next}`)
}

/**
 * A loopback `http:` redirect, where OpenCode listens on the URL's own port, or an `https:` one that a proxy forwards
 * to OpenCode's listener on `callback_port`. Both need a path, which the listener matches.
 */
function redirectProblem(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "must be a valid URL"
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "must use http: or https:"
  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "must use the host localhost or 127.0.0.1 with http:"
  if (url.protocol === "http:" && url.port === "") return "must include an explicit port with http:"
  if (url.username !== "" || url.password !== "") return "must not include credentials"
  if (value.includes("?") || value.includes("#")) return "must not include a query or fragment"
  if (url.pathname === "/") return "must include a path, such as /callback"
  return undefined
}

/** An `https:` address with a host, and no user name, password or fragment. The query is the server's own. */
function metadataUrlProblem(value: string): string | undefined {
  if (value.length > MAX_METADATA_URL_LENGTH) return `must be at most ${MAX_METADATA_URL_LENGTH} characters`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "must be a valid URL"
  }
  if (url.protocol !== "https:") return "must use https:"
  if (url.username !== "" || url.password !== "") return "must not include credentials"
  if (value.includes("#")) return "must not include a fragment"
  return undefined
}

const isPort = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535

/** The user scopes a list names, or the problem with it. */
export function scopeListProblem(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return "must be a non-empty list of scope names"
  if (!value.every((scope): scope is string => typeof scope === "string" && NO_SPACES.test(scope) && SCOPE.test(scope))) return "must list Slack user scopes such as channels:read"
  if (new Set(value).size !== value.length) return "must not list a scope twice"
  return undefined
}

/** Read and check the plugin's own options; a problem is an `OPTIONS_INVALID` error with a next step. */
export function readOptions(raw: unknown): SlackOptions {
  const options = raw ?? {}
  if (!isRecord(options)) throw invalid("", "is not an object", "Set the plugin's options to an object, or remove them.")
  const unknown = Object.keys(options).find((key) => !TOP_KEYS.includes(key))
  if (unknown !== undefined) throw invalid(unknown, "is not an option this plugin declares", `Remove it. The plugin's options are ${TOP_KEYS.join(", ")}.`)

  const oauth = options["oauth"] ?? {}
  if (!isRecord(oauth)) throw invalid("oauth", "is not an object", 'Set oauth to an object such as { "client_id": "…" }.')
  const unknownOAuth = Object.keys(oauth).find((key) => !OAUTH_KEYS.includes(key))
  if (unknownOAuth !== undefined) throw invalid(`oauth.${unknownOAuth}`, "is not an oauth option", `Remove it. Supported oauth options are ${OAUTH_KEYS.join(", ")}.`)

  const clientId = oauth["client_id"]
  if (clientId !== undefined && (typeof clientId !== "string" || !NO_SPACES.test(clientId))) {
    throw invalid("oauth.client_id", "must be a non-empty string without spaces", "Copy the client ID from the Basic Information page of the Slack app.")
  }
  const redirectUri = oauth["redirect_uri"] ?? DEFAULT_REDIRECT_URI
  const redirectError = typeof redirectUri === "string" ? redirectProblem(redirectUri) : "must be a string"
  if (typeof redirectUri !== "string" || redirectError !== undefined) {
    throw invalid("oauth.redirect_uri", redirectError ?? "must be a string", `Use a URL registered on the Slack app, such as ${DEFAULT_REDIRECT_URI}.`)
  }
  const hosted = new URL(redirectUri).protocol === "https:"
  const callbackPort = oauth["callback_port"]
  if (callbackPort !== undefined && !isPort(callbackPort)) throw invalid("oauth.callback_port", "must be a whole number from 1 to 65535", "Set it to the local port that receives the forwarded callback.")
  if (callbackPort !== undefined && !hosted) throw invalid("oauth.callback_port", "applies only to an https: oauth.redirect_uri", "Remove it: with a loopback redirect, OpenCode listens on that URL's port.")
  if (callbackPort === undefined && hosted) throw invalid("oauth.callback_port", "must be set with an https: oauth.redirect_uri", "Set it to the local port your proxy forwards the redirect to.")

  const scopes = oauth["scopes"] ?? DEFAULT_SCOPES
  const scopesProblem = scopeListProblem(scopes)
  if (scopesProblem !== undefined) throw invalid("oauth.scopes", scopesProblem, `List Slack user scopes, for example ${JSON.stringify(DEFAULT_SCOPES)}.`)

  const clientSecret = oauth["client_secret"]
  if (clientSecret !== undefined && (typeof clientSecret !== "string" || clientSecret === "")) {
    throw invalid("oauth.client_secret", "must be a non-empty string", "Set it to {env:SLACK_CLIENT_SECRET} and export that variable, or remove it to use PKCE.")
  }
  const metadataUrl = oauth["auth_server_metadata_url"]
  const metadataProblem = metadataUrl === undefined ? undefined : typeof metadataUrl === "string" ? metadataUrlProblem(metadataUrl) : "must be a string"
  if (metadataProblem !== undefined) {
    throw invalid("oauth.auth_server_metadata_url", metadataProblem, "Set it to the https: address of your host's own OAuth metadata document, or remove it to use Slack's.")
  }

  const events = options["events"] ?? {}
  if (!isRecord(events)) throw invalid("events", "is not an object", 'Set events to an object such as { "channels": ["C…"] }.')
  const unknownEvents = Object.keys(events).find((key) => !EVENTS_KEYS.includes(key))
  if (unknownEvents !== undefined) throw invalid(`events.${unknownEvents}`, "is not an events option", `Remove it. Supported events options are ${EVENTS_KEYS.join(", ")}.`)
  const channels = events["channels"] ?? []
  if (!Array.isArray(channels) || !channels.every((id) => typeof id === "string" && CHANNEL_ID.test(id))) {
    throw invalid("events.channels", "must be a list of channel and direct-message ids", "List ids such as C0123ABCD45, or leave the option out and pass scope.channels with each read.")
  }
  if (new Set(channels).size !== channels.length) throw invalid("events.channels", "lists an id twice", "Remove the duplicate id.")
  if (channels.length > MAX_CHANNELS) throw invalid("events.channels", `lists more than ${MAX_CHANNELS} ids`, `Keep the ${MAX_CHANNELS} channels and direct messages that matter most.`)

  return {
    oauth: {
      ...(clientId === undefined ? {} : { clientId }),
      redirectUri,
      ...(callbackPort === undefined ? {} : { callbackPort }),
      scopes: [...(scopes as readonly string[])],
      ...(clientSecret === undefined ? {} : { clientSecret }),
      ...(metadataUrl === undefined ? {} : { authServerMetadataUrl: metadataUrl as string }),
    },
    channels: [...(channels as readonly string[])],
  }
}
