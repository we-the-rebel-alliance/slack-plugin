#!/usr/bin/env node
// The workflows are parsed as workflows, not as YAML: `actionlint` catches a `${{ }}` that only exists in one context,
// which makes GitHub reject the whole file and run nothing. CI installs it before the check, so it is on PATH there;
// elsewhere it runs when it is on PATH and prints a visible notice when it is not.
import { spawnSync } from "node:child_process"

const probe = spawnSync("actionlint", ["-version"], { encoding: "utf8" })
if (probe.error?.code === "ENOENT") {
  console.log("actionlint is not on PATH, so the workflow check is skipped here; CI installs it before the check.")
  process.exit(0)
}
const run = spawnSync("actionlint", ["-color"], { stdio: "inherit" })
process.exit(run.status ?? 1)
