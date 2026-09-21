# Transport Decision: VendorIQ MCP Server (server.py)

Status: **Decided 2026-09-03** (Session `CC-20260903-v8qz`). Authored at the user's direction after being asked for by name but not yet existing in this repo. This documents the transport and state model `server.py` runs under and makes it binding going forward — future changes to either must update this document, not just the code.

## Decision

**Transport: STDIO.**
**State model: single-user, one OS process per connection. No shared in-memory session store.**

## Why STDIO

- `.mcp.json` already registers this server as `{"command": "uv", "args": ["run", "<path>\\server.py"]}`. The client (Claude Desktop, Claude Code, MCP Inspector) spawns `server.py` as its own child process and talks to it over that process's stdin/stdout. There is no listening port, no URL, nothing for a second client to connect to.
- `server.py`'s `if __name__ == "__main__": mcp.run()` call passes no `transport` argument. `FastMCP.run()`'s signature is `def run(self, transport: Literal["stdio", "sse", "streamable-http"] = "stdio", ...)` (confirmed against the installed `mcp[cli]<2` package), so the code has always meant stdio. This document makes that explicit rather than changing it.
- This server's actual usage (one person running Claude Desktop/Code/Inspector locally against their own `interactions.json`) has no multi-tenant requirement. Stateless HTTP exists in the MCP spec specifically to let one server process safely serve many independent clients — there is exactly one client here, so that machinery is overhead with no corresponding benefit.

## State model

Each client connection gets its own OS process (spawned fresh by `uv run server.py`), its own Python interpreter, its own memory. `VENDOR_DB` and any other module-level data exist only for that one process's lifetime and are never shared across connections, because there is only ever one connection per process to begin with.

**No in-memory session map, connection registry, or per-client keyed dict may be added to this file.** STDIO transport is inherently 1 process : 1 client; a session map would imply multiple clients sharing one process, which never happens here and would be solving a problem this transport doesn't have.

## Failure this avoids

If a shared session/connection map were added anyway (e.g. while porting toward HTTP later, or added "just in case"), the failure mode is silent cross-client bleed: two people each running their own client against a *hypothetical* shared server process could read or overwrite each other's in-flight tool state, correlation IDs, or `interactions.json` writes (which use a plain read-modify-write with no file locking) — because the code would assume "one process, one client" while the deployment no longer guaranteed that. Keeping the state model STDIO-only and per-process is what makes the missing file-locking and missing session isolation safe *by construction*, not by luck.

## Requirements this decision imposes on the code

1. `server.py` must call `mcp.run()` with `transport="stdio"` (explicit or via its documented default) — never `"sse"` or `"streamable-http"`.
2. No module-level or otherwise shared dict/store keyed by client id, session id, or connection may exist anywhere in this file.
3. The single-user assumption must be stated as a comment at the point `mcp.run()` is invoked, so nobody "scales" this by adding concurrency or a session store without re-reading this document first.
4. On startup, before `mcp.run()` blocks, the process must log — to **stderr only**, since stdout is the JSON-RPC wire for stdio transport and must never carry anything else — which transport and state model it's running, so this is verifiable from process logs alone without reading the source.

## Out of scope

This document does not evaluate or recommend a stateless HTTP transport for this server. If a real multi-user requirement appears later, that needs its own decision (and its own document) — it is not a natural evolution of this one. Per requirement 2 above, adding HTTP later means re-litigating the whole state model, not swapping a function argument.
