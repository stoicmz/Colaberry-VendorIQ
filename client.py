# /// script
# dependencies = ["mcp[cli]<2"]
# ///
"""Minimal MCP client for the VendorIQ server -- connects over stdio, runs the
initialize handshake, lists what the server advertises, then exercises one
tool and one resource end to end.
"""

import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import AnyUrl

SERVER_PARAMS = StdioServerParameters(command="uv", args=["run", "server.py"])


async def main() -> None:
    step = "launching server subprocess"
    try:
        async with stdio_client(SERVER_PARAMS) as (read, write):
            async with ClientSession(read, write) as session:
                step = "initialize handshake"
                # This must happen before any other request: initialize is where
                # client and server agree on a protocol version and exchange
                # capabilities. Every other call below assumes that negotiation
                # already completed -- a server is entitled to reject anything
                # sent before its handshake finishes.
                init_result = await session.initialize()
                print(f"Server name: {init_result.serverInfo.name}")
                print(f"Protocol version: {init_result.protocolVersion}")

                step = "listing tools"
                tools = await session.list_tools()
                print("Tools:", ", ".join(t.name for t in tools.tools))

                step = "listing resources"
                resources = await session.list_resources()
                templates = await session.list_resource_templates()
                resource_names = [r.name for r in resources.resources]
                template_names = [t.name for t in templates.resourceTemplates]
                print("Resources:", ", ".join(resource_names + template_names))

                step = "listing prompts"
                prompts = await session.list_prompts()
                print("Prompts:", ", ".join(p.name for p in prompts.prompts))

                step = "calling submit_interaction_record"
                tool_result = await session.call_tool(
                    "submit_interaction_record",
                    {
                        "recruiter_name": "Devon Ruiz",
                        "interaction_date": "2026-08-10",
                        "interaction_type": "interview",
                        "recruiter_company": "Clearline Recruiting",
                        "confirmed_by_user": True,
                    },
                )
                # structuredContent is None on this SDK build for a plain dict-returning
                # tool; the actual payload is JSON-encoded inside content[0].text instead.
                tool_payload = json.loads(tool_result.content[0].text)
                print("Tool result:", tool_payload)

                step = "reading vendoriq://vendors resource"
                resource_result = await session.read_resource(AnyUrl("vendoriq://vendors"))
                content = resource_result.contents[0]
                first_line = content.text.splitlines()[0]
                print(f"Resource first line: {first_line}")
                print(f"Resource MIME type: {content.mimeType}")

    except Exception as exc:
        print(f"FAILED during step: {step}")
        print(f"{exc.__class__.__name__}: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
