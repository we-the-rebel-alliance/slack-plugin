# Security policy

## Reporting a vulnerability

Report it privately through this repository's **Security** tab → **Report a vulnerability**, or by email to the
maintainers listed in `CODEOWNERS` if the advisory form is not available. Do not open a public issue for a
vulnerability. The maintainers aim to answer within five working days, and credit a reporter who asks to be named.

Please include what you did, what happened, what you expected, the version you ran and the OpenCode release. Never paste
a real Slack token, a client secret or another person's content; redact it first.

## Supported versions

The repository is at `0.0.x`. Only the latest release on `master` is supported; a fix ships as a new patch release.

## What the plugin holds

No secret is stored in this repository, in a fixture, in a log or in status. The Slack sign-in belongs to Slack's MCP
server and OpenCode's credential store; the plugin reads an access token in `src/provider/web.ts` only while it makes a
Web API call. See [docs/security.md](docs/security.md).
