// Lints .github/workflows with actionlint when it is on PATH.
//
// A clean clone installs no actionlint (it is not an npm package), so this stage says so and passes; CI installs
// actionlint 1.7.12 from its release with the published checksum, so every workflow is linted there. A binary that is
// present but refuses the workflows fails this stage.
import { spawnSync } from "node:child_process"

const probe = spawnSync("actionlint", ["--version"], { stdio: "ignore" })
if (probe.error !== undefined) {
  if (probe.error.code !== "ENOENT") throw probe.error
  console.log("actionlint: not on PATH; CI installs actionlint 1.7.12 and lints every workflow there")
  process.exit(0)
}
const lint = spawnSync("actionlint", ["-color"], { stdio: "inherit" })
process.exit(lint.status ?? 1)
