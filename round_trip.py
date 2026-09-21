"""VendorIQ tool-use round trip demo.

ONE question, ONE tool, ONE complete round trip. Teaching script only —
not part of the VendorIQ backend. If ANTHROPIC_API_KEY is set, it makes a
real call; otherwise it prints a clearly-labeled simulated transcript.
"""

import json
import os
import sys

import anthropic

MODEL = "claude-opus-5"

# Hardcoded data source — stands in for VendorIQ's vendor-complaints table.
VENDOR_DB = {
    "Bright Path Staffing": {
        "complaint_count": 3,
        "red_flags": ["unpaid_wages", "contract_bait_and_switch"],
        "risk_rating": "high",
    },
    "Clearline Recruiting": {
        "complaint_count": 0,
        "red_flags": [],
        "risk_rating": "low",
    },
    "Vantage Talent Group": {
        "complaint_count": 1,
        "red_flags": ["slow_payment"],
        "risk_rating": "medium",
    },
}

TOOL = {
    "name": "lookup_vendor_track_record",
    "description": (
        "Look up a staffing/hiring vendor's track record in VendorIQ's internal "
        "database by company name. Returns prior complaint count, red-flag "
        "categories, and a risk rating. Call this whenever the user asks about "
        "a specific vendor's trustworthiness or history before assessing risk."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "vendor_name": {
                "type": "string",
                "description": "The vendor's registered business name, exactly as named by the user",
            }
        },
        "required": ["vendor_name"],
    },
}

QUESTION = "Before I sign with them, what's the track record on 'Bright Path Staffing'? Any red flags?"


def lookup_vendor_track_record(vendor_name: str) -> dict:
    """MY function — the only thing that actually touches VendorIQ's data."""
    return VENDOR_DB.get(
        vendor_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )


def header(n: int, label: str) -> None:
    print()
    print(f"[{n}] {label}")
    print("-" * 70)


API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MOCK = API_KEY is None
TAG = " (SIMULATED)" if MOCK else ""

if MOCK:
    print("No ANTHROPIC_API_KEY found -- running in SIMULATED mode.")
    print("Every labeled block below is a hand-written stand-in, not a live call.")
else:
    print(f"ANTHROPIC_API_KEY found -- running a LIVE call against {MODEL}.")

client = None if MOCK else anthropic.Anthropic(api_key=API_KEY)

# --- (1) the request I sent -------------------------------------------------
first_request = {
    "model": MODEL,
    "max_tokens": 1024,
    "tools": [TOOL],
    "messages": [{"role": "user", "content": QUESTION}],
}

header(1, "REQUEST SENT" + TAG)
print(json.dumps(first_request, indent=2))

if MOCK:
    first_response_content = [
        {"type": "text", "text": "Let me check their track record."},
        {
            "type": "tool_use",
            "id": "toolu_01SIMULATED111",
            "name": "lookup_vendor_track_record",
            "input": {"vendor_name": "Bright Path Staffing"},
        },
    ]
    first_stop_reason = "tool_use"
else:
    response = client.messages.create(**first_request)
    first_response_content = response.content
    first_stop_reason = response.stop_reason

# --- (2) the value of stop_reason that came back ----------------------------
header(2, "STOP_REASON" + TAG)
print(first_stop_reason)

if first_stop_reason != "tool_use":
    print("Claude answered without needing the tool -- nothing further to do.")
    sys.exit(0)

# --- (3) the tool_use block, including the arguments the model filled in ---
if MOCK:
    tool_use_block = first_response_content[1]
    tool_id = tool_use_block["id"]
    tool_name = tool_use_block["name"]
    tool_input = tool_use_block["input"]
else:
    tool_use_block = next(b for b in first_response_content if b.type == "tool_use")
    tool_id = tool_use_block.id
    tool_name = tool_use_block.name
    tool_input = tool_use_block.input

header(3, "TOOL_USE BLOCK" + TAG)
print(json.dumps({"id": tool_id, "name": tool_name, "input": tool_input}, indent=2))

# --- (4) the line where MY function executes --------------------------------
header(4, "MY FUNCTION EXECUTES")
result = lookup_vendor_track_record(**tool_input)  # <-- VendorIQ's own code, not Claude's
print(f"lookup_vendor_track_record({tool_input!r}) -> {result}")

# --- (5) the tool_result I send back -----------------------------------------
tool_result = {
    "type": "tool_result",
    "tool_use_id": tool_id,
    "content": json.dumps(result),
}

header(5, "TOOL_RESULT SENT BACK" + TAG)
print(json.dumps(tool_result, indent=2))

# --- (6) the final answer -----------------------------------------------------
if MOCK:
    final_text = (
        "Bright Path Staffing has 3 prior complaints on file, including unpaid "
        "wages and a contract bait-and-switch pattern -- both flagged high risk. "
        "I'd get any offer terms in writing before signing."
    )
else:
    second_response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        tools=[TOOL],
        messages=[
            {"role": "user", "content": QUESTION},
            {"role": "assistant", "content": first_response_content},
            {"role": "user", "content": [tool_result]},
        ],
    )
    final_text = next(b.text for b in second_response.content if b.type == "text")

header(6, "FINAL ANSWER" + TAG)
print(final_text)
print()
