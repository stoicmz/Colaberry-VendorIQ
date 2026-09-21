#!/usr/bin/env bash
set -euo pipefail

# 1. Read the JSON payload the harness pipes on stdin.
#    jq is not installed on this machine; node is (and is already this project's
#    runtime dependency via backend/package.json), so it parses the envelope instead.
command="$(node -e '
  let data = "";
  process.stdin.on("data", (chunk) => { data += chunk; });
  process.stdin.on("end", () => {
    let cmd = "";
    try {
      const payload = JSON.parse(data);
      cmd = (payload.tool_input && payload.tool_input.command) || "";
    } catch (e) {
      cmd = "";
    }
    process.stdout.write(cmd);
  });
')"

# 2. Decide. Block a forced push or a root wipe; explain why on stderr; exit 2 to veto.
case "$command" in
  *"git push --force"*|*"rm -rf /"*)
    echo "commit-guard: blocked — '$command' matches a forbidden pattern (git push --force / rm -rf /)" >&2
    exit 2
    ;;
esac

# 3. Otherwise exit 0: proceed.
exit 0
