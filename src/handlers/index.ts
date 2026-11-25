/**
 * The one handler table `register` wires through every door (contract §9).
 *
 * Every method is the plugin's own read or write. Slack's MCP tools stay the vendor's: the manifest declares them as
 * `mcp:<tool>` and this table has no entry for one, because their server owns them.
 */
import type { AccountProfile } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { HandlerTable } from "@we-the-rebel-alliance/plugin-contract/register"
import type { SlackOptions } from "../options.ts"
import type { SlackProvider } from "../provider/types.ts"
import { channelsListHandler } from "./channels-list.ts"
import { eventsListHandler } from "./events-list.ts"
import { markReadHandler } from "./mark-read.ts"
import { mentionsListHandler } from "./mentions-list.ts"
import { probeHandler } from "./probe.ts"
import { statusHandler } from "./status.ts"
import { threadReadHandler } from "./thread-read.ts"

/** What every handler knows: the manifest, the aliases, the options, the provider and what setup could not do. */
export interface HandlerContext {
  readonly manifest: Manifest
  readonly profiles: readonly AccountProfile[]
  readonly options: SlackOptions
  readonly provider: SlackProvider
  /** The installed package's version, for status. */
  readonly version: string
  /** The OpenCode release the plugin runs on, for status. */
  readonly hostVersion: string
  /** What registering the accounts, or reading the Slack app, could not do. Status reports each one. */
  readonly problems: readonly string[]
}

/** Every handler, by the method name the manifest declares. */
export function createHandlers(context: HandlerContext): HandlerTable {
  return {
    status: statusHandler(context),
    probe: probeHandler(context),
    events_list: eventsListHandler(context),
    thread_read: threadReadHandler(context),
    channels_list: channelsListHandler(context),
    mentions_list: mentionsListHandler(context),
    mark_read: markReadHandler(context),
  }
}
