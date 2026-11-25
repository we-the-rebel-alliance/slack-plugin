/**
 * The two provider endpoints, named once (plugin standard §4 rule 12). Nothing else in the plugin writes them.
 */

/** Slack's hosted MCP server. Every account alias gets one server at this URL, with its own OAuth sign-in. */
export const MCP_SERVER_URL = "https://mcp.slack.com/mcp"

/** Slack's Web API, for the three calls Slack's MCP server has no tool for. */
export const SLACK_API_URL = "https://slack.com/api/"
