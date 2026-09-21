# /// script
# dependencies = ["mcp[cli]<2"]
# ///
"""VendorIQ MCP server -- exposes lookup_vendor_track_record as an MCP tool.

Mirrors the tool and hardcoded VENDOR_DB from round_trip.py, wired up as a
real MCP server instead of a manual Claude API round trip.
"""

import json
from datetime import date
from pathlib import Path
from typing import Annotated, Literal, Optional
from urllib.parse import unquote

from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("vendoriq-kb")

INTERACTIONS_FILE = Path(__file__).parent / "interactions.json"
EXTRACTION_PROMPT_FILE = Path(__file__).parent / "prompts" / "extract-interaction-record" / "v1.0.0.md"

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


@mcp.tool()
def lookup_vendor_track_record(vendor_name: Annotated[str, Field(min_length=1, max_length=200)]) -> dict:
    """Look up a staffing/hiring vendor's track record in VendorIQ's internal database.

    Args:
        vendor_name: The vendor's registered business name, exactly as named by the user.
    """
    return VENDOR_DB.get(
        vendor_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )


@mcp.tool()
def submit_interaction_record(
    recruiter_name: Annotated[str, Field(min_length=1, max_length=200)],
    interaction_date: Annotated[str, Field(min_length=10, max_length=10, pattern=r"^\d{4}-\d{2}-\d{2}$")],
    confirmed_by_user: bool,
    interaction_type: Literal["email", "call", "message", "interview", "offer", "rejection", "other"] = "other",
    recruiter_email: Annotated[Optional[str], Field(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")] = None,
    recruiter_company: Annotated[Optional[str], Field(min_length=1, max_length=200)] = None,
    channel: Annotated[Optional[str], Field(min_length=1, max_length=100)] = None,
    notes: Annotated[Optional[str], Field(min_length=1, max_length=2000)] = None,
) -> dict:
    """Save a recruiter interaction the job seeker just told you about — a call, email,
    message, interview, offer, or rejection they logged and confirmed is accurate.

    Use this right after the job seeker has reviewed the extracted details and said
    something like "yes, save it" or "that's right, log it." Never call this with
    details you inferred but the job seeker hasn't actually confirmed — if they
    haven't confirmed yet, ask them first instead of calling this tool.

    Do not use this to check a vendor's history or reputation — that's
    lookup_vendor_track_record, not this one.
    """
    if not confirmed_by_user:
        return {
            "status": "not_saved",
            "reason": "not_confirmed",
            "record": None,
            "message": (
                "Nothing was saved because confirmed_by_user was false. "
                "Ask the job seeker to confirm the details are correct, then call this again with confirmed_by_user=true."
            ),
        }

    try:
        parsed_date = date.fromisoformat(interaction_date)
    except ValueError:
        return {
            "status": "not_saved",
            "reason": "invalid_date",
            "record": None,
            "message": f"'{interaction_date}' is not a real calendar date in YYYY-MM-DD form. Nothing was saved.",
        }

    record = {
        "recruiter_name": recruiter_name.strip(),
        "recruiter_email": recruiter_email.strip().lower() if recruiter_email else None,
        "recruiter_company": recruiter_company.strip() if recruiter_company else None,
        "interaction_date": parsed_date.isoformat(),
        "interaction_type": interaction_type,
        "channel": channel.strip() if channel else None,
        "notes": notes.strip() if notes else None,
        "confirmed_by_user": True,
    }

    try:
        existing = json.loads(INTERACTIONS_FILE.read_text(encoding="utf-8")) if INTERACTIONS_FILE.exists() else []
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "status": "not_saved",
            "reason": "storage_unreadable",
            "record": None,
            "message": f"Could not read the existing interaction log ({exc.__class__.__name__}). Nothing was saved.",
        }

    existing.append(record)
    INTERACTIONS_FILE.write_text(json.dumps(existing, indent=2), encoding="utf-8")

    total_for_recruiter = sum(
        1 for r in existing if r.get("recruiter_name", "").lower() == record["recruiter_name"].lower()
    )

    return {
        "status": "saved",
        "reason": None,
        "record": record,
        "total_interactions_for_recruiter": total_for_recruiter,
        "message": f"Saved a {interaction_type} interaction with {record['recruiter_name']} on {record['interaction_date']}.",
    }


@mcp.resource("vendoriq://vendors", mime_type="application/json")
def list_vendors() -> list[dict]:
    """Lightweight index of every vendor VendorIQ has a track record for."""
    return [
        {
            "vendor_name": name,
            "risk_rating": info["risk_rating"],
            "complaint_count": info["complaint_count"],
        }
        for name, info in VENDOR_DB.items()
    ]


@mcp.resource("vendoriq://vendor/{vendor_name}/profile", mime_type="application/json")
def get_vendor_profile(vendor_name: str) -> dict:
    """One vendor's full profile: its track record plus the job seeker's own logged interactions with it."""
    # URI path segments arrive percent-encoded (e.g. "Vantage%20Talent%20Group") and are
    # never auto-decoded by the SDK's template matcher, so decode before using this for lookups.
    vendor_name = unquote(vendor_name).strip()

    vendor_by_lower_name = {name.lower(): name for name in VENDOR_DB}
    canonical_name = vendor_by_lower_name.get(vendor_name.lower(), vendor_name)
    track_record = VENDOR_DB.get(
        canonical_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )

    try:
        logged = json.loads(INTERACTIONS_FILE.read_text(encoding="utf-8")) if INTERACTIONS_FILE.exists() else []
    except (OSError, json.JSONDecodeError):
        logged = []

    matching_interactions = [
        r for r in logged if (r.get("recruiter_company") or "").lower() == canonical_name.lower()
    ]

    return {
        "vendor_name": canonical_name,
        "track_record": track_record,
        "logged_interactions": matching_interactions,
        "logged_interaction_count": len(matching_interactions),
    }


@mcp.prompt(
    name="extract-interaction-record",
    description=(
        "Turn one raw recruiter message into a structured VendorIQ interaction record -- "
        "only what the message explicitly states, never scored or judged. Use this when a "
        "job seeker pastes in a recruiter email, voicemail transcript, or LinkedIn message "
        "and wants it turned into a loggable record before saving it."
    ),
)
def extract_interaction_record(message_text: str, received_at: str) -> str:
    body = EXTRACTION_PROMPT_FILE.read_text(encoding="utf-8")
    if body.startswith("---"):
        end = body.find("---", 3)
        if end != -1:
            body = body[end + 3 :].lstrip("\n")
    return body.replace("{{message_text}}", message_text).replace("{{received_at}}", received_at)


if __name__ == "__main__":
    mcp.run()
