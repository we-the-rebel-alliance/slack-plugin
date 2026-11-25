/**
 * The constants only Slack knows: its default sign-in scopes and the ids a read accepts.
 *
 * The default scopes are the consent-list reads (`channels:read`, `groups:read`, `im:read`, `mpim:read`), public-channel
 * search, the user profile, the private and direct-message search the mentions source uses, and direct-message and
 * group-message history. A private **channel**'s history needs `groups:history`, which is deliberately not a default:
 * the plugin never reads a private channel's history unless a person adds that scope, and `docs/configuration.md` says
 * so beside the channels setting.
 */

/** The loopback redirect the Slack app should list; the plugin's default. */
export const DEFAULT_REDIRECT_URI = "http://localhost:8765/callback"

/** The user scopes every sign-in asks for unless the alias's profile lists its own. */
export const DEFAULT_SCOPES: readonly string[] = [
  "channels:history",
  "channels:read",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "search:read.public",
  "search:read.private",
  "search:read.im",
  "search:read.mpim",
  "users:read",
]

/** The most channels one read and its cursor take: 16 ids with the longest cursors stay within the cursor's 1,024 characters. */
export const MAX_CHANNELS = 16

/** A channel (`C…`), private channel or group (`G…`), direct message (`D…`), or a user whose direct messages to read (`U…`, `W…`). */
export const CHANNEL_ID = /^[CDGUW][A-Z0-9]{8,12}$/
