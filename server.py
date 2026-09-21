# /// script
# dependencies = ["mcp[cli]<2", "httpx"]
# ///
"""VendorIQ MCP server -- exposes lookup_vendor_track_record as an MCP tool.

Mirrors the tool and hardcoded VENDOR_DB from round_trip.py, wired up as a
real MCP server instead of a manual Claude API round trip.
"""

import asyncio
import json
import os
import sys
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, Optional
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

import httpx
from mcp import types
from mcp.server.fastmcp import Context, FastMCP
from mcp.shared.exceptions import McpError
from pydantic import Field

mcp = FastMCP("vendoriq-kb")


# FastMCP never registers a logging/setLevel handler on its own, so without this the server
# never advertises the `logging` capability and clients silently drop every log notification below.
@mcp._mcp_server.set_logging_level()
async def _accept_log_level(level: str) -> None:
    return None


async def _emit_log(
    ctx: Context,
    level: Literal["debug", "info", "warning", "error"],
    event: str,
    correlation_id: str,
    **fields: Any,
) -> None:
    """Send one structured MCP log notification: a JSON object with a stable event name, never a sentence."""
    await ctx.request_context.session.send_log_message(
        level=level,
        data={"event": event, "correlation_id": correlation_id, **fields},
        logger="vendoriq-kb",
        related_request_id=ctx.request_id,
    )


async def _emit_progress(
    ctx: Context,
    *,
    progress: float,
    total: float | None = None,
    message: str | None = None,
) -> None:
    """Send one progress tick to the client. The ONLY place any tool emits progress from.

    Delegates to `ctx.report_progress`, which reads the progress token off this
    request's own metadata and is a silent no-op if the client didn't attach one --
    so a client that never asked to be tracked sees zero notifications and zero
    behavior change, satisfying that contract in exactly one place rather than every
    call site re-checking it. `total=None` means the total is genuinely unknown;
    callers must say so in `message` rather than let a bare count look like a fraction.
    """
    await ctx.report_progress(progress=progress, total=total, message=message)


async def _emit_progress_while_pending(
    ctx: Context,
    awaitable: Any,
    *,
    message: str,
    interval_seconds: float = 1.0,
) -> Any:
    """Await `awaitable`, emitting one `_emit_progress` tick every `interval_seconds`
    for as long as it's still pending, then return (or raise) exactly what it does.

    For operations with no knowable total up front -- waiting on a client-side model
    completion, for instance -- there is no real fraction to report, so each tick
    carries a genuine elapsed-tick count with `total=None` instead of a guessed
    percentage. The background ticker is always cancelled once `awaitable` settles,
    win or lose; this never changes the result or exception `awaitable` produces.
    """
    ticks = 0

    async def _ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(interval_seconds)
            ticks += 1
            await _emit_progress(
                ctx,
                progress=ticks,
                total=None,
                message=f"{message} ({ticks * interval_seconds:.0f}s elapsed, total unknown)",
            )

    ticker_task = asyncio.create_task(_ticker())
    try:
        return await awaitable
    finally:
        ticker_task.cancel()
        try:
            await ticker_task
        except asyncio.CancelledError:
            pass


async def _declared_roots(ctx: Context) -> list[Path]:
    """Ask the connected client which filesystem roots it currently declares as in-bounds.

    Returns an empty list if the client doesn't support roots at all, or declares none --
    callers must treat that as "nothing is in-bounds," never as "anything goes."
    """
    session = ctx.request_context.session
    if not session.check_client_capability(types.ClientCapabilities(roots=types.RootsCapability())):
        return []
    result = await session.list_roots()
    roots: list[Path] = []
    for root in result.roots:
        parsed = urlparse(str(root.uri))
        roots.append(Path(url2pathname(parsed.path)).resolve())
    return roots


async def _resolve_within_roots(
    ctx: Context,
    candidate: Path,
    *,
    correlation_id: str,
    tool: str,
) -> Path | None:
    """The single containment gate every filesystem-touching tool in this server must
    call before reading or writing anything on disk. Returns the resolved path if
    `candidate` is allowed, else None.

    The ORDER is the whole control: resolve first, compare second. A plain string
    prefix check on the raw path (e.g. str(candidate).startswith(str(root))) is NOT
    enough, for two independent reasons -- it can't see through a ".." segment that
    hasn't been collapsed yet (e.g. "/allowed/../secret" string-prefixes under
    "/allowed" but resolves to "/secret"), and it can't see through a symlink that
    lives inside an allowed root but whose target points somewhere outside it (the
    raw path never even mentions the real destination). Only the fully-resolved real
    path -- ".." collapsed, symlinks followed -- is safe to compare, so both sides
    are resolved before any comparison happens.

    Fail-closed and self-logging: a client that declares zero roots (no `roots`
    capability, or the capability with an empty list) is denied by default, same as
    a client whose roots exist but don't cover this path -- "no roots" must never be
    read as "no restriction." Every denial emits exactly one "roots.denied" warning
    (stable event name, always carrying `requested_path`), with `reason` telling the
    two cases apart, and this function never raises for a denial -- callers turn a
    None return into their own error result.
    """
    resolved = candidate.resolve()
    declared_roots = await _declared_roots(ctx)

    if not declared_roots:
        await _emit_log(
            ctx,
            "warning",
            "roots.denied",
            correlation_id,
            tool=tool,
            requested_path=str(candidate),
            reason="no_roots_declared",
        )
        return None

    for root in declared_roots:
        # normcase makes this case-insensitive on Windows (NTFS ignores case by
        # default); it's a no-op on case-sensitive filesystems.
        resolved_cmp = Path(os.path.normcase(str(resolved)))
        root_cmp = Path(os.path.normcase(str(root)))
        if resolved_cmp.is_relative_to(root_cmp):
            return resolved

    await _emit_log(
        ctx,
        "warning",
        "roots.denied",
        correlation_id,
        tool=tool,
        requested_path=str(candidate),
        reason="outside_declared_roots",
        declared_root_count=len(declared_roots),
    )
    return None


# --- Vendor Background Check API (external compliance/risk-event feed) --------------
#
# No credential, host, or connection string for this ever appears in source: both are
# read from the environment at call time inside check_vendor_compliance_events below.
# VENDOR_BGCHECK_BASE_URL currently points at a local stand-in
# (scripts/mock_vendor_background_check_api.py) during development -- pointing it at
# a real provider later requires an env change only, no code change here.
VENDOR_BGCHECK_BASE_URL_ENV_VAR = "VENDOR_BGCHECK_BASE_URL"
VENDOR_BGCHECK_API_KEY_ENV_VAR = "VENDOR_BGCHECK_API_KEY"
VENDOR_BGCHECK_TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """One pooled, reused httpx client for this process's whole lifetime.

    A fresh httpx.AsyncClient per call would open (and, for a real HTTPS provider,
    TLS-handshake) a brand new TCP connection every single time; the specific failure
    this avoids under repeated calls is socket/file-descriptor exhaustion from never
    reusing keep-alive connections. This is a single shared client, not a map keyed by
    client/session id -- per docs/TRANSPORT_DECISION.md this process serves exactly
    one client for its whole lifetime, so "pooled" here means reused across that one
    client's repeated tool calls, not shared across processes or connections.
    """
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient()
    return _http_client


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
async def lookup_vendor_track_record(ctx: Context, vendor_name: str) -> dict:
    """Look up a staffing/hiring vendor's track record in VendorIQ's internal database.

    Args:
        vendor_name: The vendor's registered business name, exactly as named by the user.
    """
    correlation_id = str(uuid.uuid4())
    await _emit_log(
        ctx, "info", "tool.started", correlation_id, tool="lookup_vendor_track_record", vendor_name=vendor_name
    )
    return VENDOR_DB.get(
        vendor_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )


@mcp.tool()
async def submit_interaction_record(
    ctx: Context,
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
    correlation_id = str(uuid.uuid4())
    await _emit_log(
        ctx, "info", "tool.started", correlation_id, tool="submit_interaction_record", interaction_type=interaction_type
    )

    if not confirmed_by_user:
        await _emit_log(
            ctx, "warning", "access.denied", correlation_id, tool="submit_interaction_record", reason="not_confirmed"
        )
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
    except ValueError as exc:
        await _emit_log(
            ctx,
            "error",
            "error.caught",
            correlation_id,
            tool="submit_interaction_record",
            error_class=exc.__class__.__name__,
            stage="date_parsing",
        )
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

    resolved_interactions_file = await _resolve_within_roots(
        ctx, INTERACTIONS_FILE, correlation_id=correlation_id, tool="submit_interaction_record"
    )
    if resolved_interactions_file is None:
        return {
            "status": "not_saved",
            "reason": "path_outside_roots",
            "record": None,
            "message": "The interaction log's storage path is outside the client's declared filesystem roots. Nothing was saved.",
        }

    read_started_at = time.perf_counter()
    await _emit_log(
        ctx, "info", "external_call.started", correlation_id, tool="submit_interaction_record", target="interactions_file_read"
    )
    try:
        existing = (
            json.loads(resolved_interactions_file.read_text(encoding="utf-8")) if resolved_interactions_file.exists() else []
        )
    except (OSError, json.JSONDecodeError) as exc:
        await _emit_log(
            ctx,
            "info",
            "external_call.finished",
            correlation_id,
            tool="submit_interaction_record",
            target="interactions_file_read",
            duration_ms=round((time.perf_counter() - read_started_at) * 1000, 2),
            outcome="failure",
        )
        await _emit_log(
            ctx,
            "error",
            "error.caught",
            correlation_id,
            tool="submit_interaction_record",
            error_class=exc.__class__.__name__,
            stage="interactions_file_read",
        )
        return {
            "status": "not_saved",
            "reason": "storage_unreadable",
            "record": None,
            "message": f"Could not read the existing interaction log ({exc.__class__.__name__}). Nothing was saved.",
        }
    await _emit_log(
        ctx,
        "info",
        "external_call.finished",
        correlation_id,
        tool="submit_interaction_record",
        target="interactions_file_read",
        duration_ms=round((time.perf_counter() - read_started_at) * 1000, 2),
        outcome="success",
        record_count=len(existing),
    )

    existing.append(record)

    write_started_at = time.perf_counter()
    await _emit_log(
        ctx, "info", "external_call.started", correlation_id, tool="submit_interaction_record", target="interactions_file_write"
    )
    try:
        resolved_interactions_file.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    except OSError as exc:
        await _emit_log(
            ctx,
            "info",
            "external_call.finished",
            correlation_id,
            tool="submit_interaction_record",
            target="interactions_file_write",
            duration_ms=round((time.perf_counter() - write_started_at) * 1000, 2),
            outcome="failure",
        )
        await _emit_log(
            ctx,
            "error",
            "error.caught",
            correlation_id,
            tool="submit_interaction_record",
            error_class=exc.__class__.__name__,
            stage="interactions_file_write",
        )
        raise
    await _emit_log(
        ctx,
        "info",
        "external_call.finished",
        correlation_id,
        tool="submit_interaction_record",
        target="interactions_file_write",
        duration_ms=round((time.perf_counter() - write_started_at) * 1000, 2),
        outcome="success",
        record_count=len(existing),
    )

    total_records = len(existing)
    total_for_recruiter = 0
    for i, r in enumerate(existing, start=1):
        if r.get("recruiter_name", "").lower() == record["recruiter_name"].lower():
            total_for_recruiter += 1
        # Real, known total (total_records) -- every record gets counted whether or not it matches.
        await _emit_progress(
            ctx,
            progress=i,
            total=total_records,
            message=f"Scanning interaction {i}/{total_records}: {r.get('recruiter_name', 'unknown')} ({r.get('interaction_date', 'unknown')})",
        )

    return {
        "status": "saved",
        "reason": None,
        "record": record,
        "total_interactions_for_recruiter": total_for_recruiter,
        "message": f"Saved a {interaction_type} interaction with {record['recruiter_name']} on {record['interaction_date']}.",
    }


ASSESS_VENDOR_RISK_SYSTEM_PROMPT = (
    "You are VendorIQ's risk analyst. Given a staffing vendor's complaint history and a "
    "job seeker's own logged interactions with them, write a short risk assessment: one "
    "risk-level word (low/medium/high/unknown), 2-3 sentences of reasoning grounded ONLY "
    "in the evidence given, and one concrete recommended next step for the job seeker. "
    "Do not invent facts that are not present in the evidence."
)
ASSESS_VENDOR_RISK_MAX_TOKENS = 400


def _degraded_vendor_assessment(evidence: dict, *, reason: str) -> dict:
    """Deterministic fallback used when sampling isn't available or fails.

    Built entirely from the evidence already fetched, so the tool still returns
    something a job seeker can act on -- never an empty or crashed result.
    """
    track_record = evidence["track_record"]
    complaint_count = track_record.get("complaint_count", 0)
    red_flags = track_record.get("red_flags", [])
    risk_rating = track_record.get("risk_rating", "unknown")
    logged_count = len(evidence["logged_interactions"])

    summary = (
        f"Automated reasoning was unavailable ({reason}), so this is a raw-data summary, not "
        f"an analyzed assessment. On file: {complaint_count} complaint(s), red flags: "
        f"{', '.join(red_flags) if red_flags else 'none recorded'}, risk rating: {risk_rating}. "
        f"You have {logged_count} logged interaction(s) with this vendor on file. Review the "
        "evidence yourself and treat any red flags above as reasons for extra caution."
    )

    return {
        "vendor_name": evidence["vendor_name"],
        "evidence": evidence,
        "assessment": summary,
        "degraded": True,
        "degraded_reason": reason,
    }


@mcp.tool()
async def assess_vendor_risk(ctx: Context, vendor_name: str) -> dict:
    """Reason about whether a staffing/hiring vendor is safe for a job seeker to deal
    with, combining VendorIQ's track record with any interactions the job seeker has
    personally logged with that vendor.

    Unlike lookup_vendor_track_record (which returns raw data only), this tool asks
    the connected client's LLM to weigh the evidence and produce a plain-language risk
    assessment plus a recommended next step. Use this when the job seeker asks
    something like "should I trust this vendor?" or "is this recruiter legit?" rather
    than just "what's on file."

    Args:
        vendor_name: The vendor's registered business name, exactly as named by the user.
    """
    correlation_id = str(uuid.uuid4())
    await _emit_log(
        ctx, "info", "tool.started", correlation_id, tool="assess_vendor_risk", vendor_name=vendor_name
    )

    # --- Gather the real evidence ourselves first. No model call anywhere in this part. ---
    vendor_by_lower_name = {name.lower(): name for name in VENDOR_DB}
    canonical_name = vendor_by_lower_name.get(vendor_name.strip().lower(), vendor_name.strip())
    track_record = VENDOR_DB.get(
        canonical_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )

    logged_interactions: list[dict] = []
    resolved_interactions_file = await _resolve_within_roots(
        ctx, INTERACTIONS_FILE, correlation_id=correlation_id, tool="assess_vendor_risk"
    )
    if resolved_interactions_file is not None:
        try:
            existing = (
                json.loads(resolved_interactions_file.read_text(encoding="utf-8"))
                if resolved_interactions_file.exists()
                else []
            )
            logged_interactions = [
                r for r in existing if (r.get("recruiter_company") or "").lower() == canonical_name.lower()
            ]
        except (OSError, json.JSONDecodeError) as exc:
            await _emit_log(
                ctx,
                "warning",
                "error.caught",
                correlation_id,
                tool="assess_vendor_risk",
                error_class=exc.__class__.__name__,
                stage="interactions_file_read",
            )

    evidence = {
        "vendor_name": canonical_name,
        "track_record": track_record,
        "logged_interactions": logged_interactions,
    }

    # --- Hand the evidence to the client's model for reasoning, via MCP sampling. ---
    # This server never holds a model name or an API key: both belong to whatever
    # client (Claude Desktop, Inspector, etc.) answers this sampling request.
    if not ctx.session.check_client_capability(types.ClientCapabilities(sampling=types.SamplingCapability())):
        await _emit_log(
            ctx,
            "warning",
            "sampling.unavailable",
            correlation_id,
            tool="assess_vendor_risk",
            reason="client_no_sampling_capability",
        )
        return _degraded_vendor_assessment(evidence, reason="client_no_sampling_capability")

    user_message = (
        f"Evidence for vendor '{canonical_name}':\n{json.dumps(evidence, indent=2)}\n\n"
        "Assess this vendor's risk to a job seeker."
    )

    sampling_started_at = time.perf_counter()
    await _emit_log(
        ctx,
        "info",
        "sampling.started",
        correlation_id,
        tool="assess_vendor_risk",
        max_tokens=ASSESS_VENDOR_RISK_MAX_TOKENS,
    )
    try:
        result = await _emit_progress_while_pending(
            ctx,
            ctx.session.create_message(  # <-- the sampling request leaves the server here
                messages=[
                    types.SamplingMessage(role="user", content=types.TextContent(type="text", text=user_message))
                ],
                system_prompt=ASSESS_VENDOR_RISK_SYSTEM_PROMPT,
                max_tokens=ASSESS_VENDOR_RISK_MAX_TOKENS,
                related_request_id=ctx.request_id,
            ),
            # Total is genuinely unknown -- we can't know how long the client's model
            # call will take -- so this ticks a real elapsed-second count instead.
            message="Waiting on the client's model to complete the vendor risk assessment",
        )
    except McpError as exc:
        # The client understood the request and explicitly declined it (e.g. the user
        # rejected the sampling prompt, or the client enforces a sampling policy).
        duration_ms = round((time.perf_counter() - sampling_started_at) * 1000, 2)
        await _emit_log(
            ctx,
            "warning",
            "sampling.finished",
            correlation_id,
            tool="assess_vendor_risk",
            duration_ms=duration_ms,
            outcome="refused",
            error_class=exc.__class__.__name__,
        )
        return _degraded_vendor_assessment(evidence, reason="client_refused_sampling")
    except Exception as exc:
        # Anything else -- transport drop, timeout, malformed response -- must not crash the tool.
        duration_ms = round((time.perf_counter() - sampling_started_at) * 1000, 2)
        await _emit_log(
            ctx,
            "warning",
            "sampling.finished",
            correlation_id,
            tool="assess_vendor_risk",
            duration_ms=duration_ms,
            outcome="failure",
            error_class=exc.__class__.__name__,
        )
        return _degraded_vendor_assessment(evidence, reason="sampling_failed")

    duration_ms = round((time.perf_counter() - sampling_started_at) * 1000, 2)
    await _emit_log(
        ctx,
        "info",
        "sampling.finished",
        correlation_id,
        tool="assess_vendor_risk",
        duration_ms=duration_ms,
        outcome="success",
        model=result.model,
        stop_reason=result.stopReason,
    )

    assessment_text = (
        result.content.text if isinstance(result.content, types.TextContent) else str(result.content)
    )

    return {
        "vendor_name": canonical_name,
        "evidence": evidence,
        "assessment": assessment_text,
        "degraded": False,
    }


def _bgcheck_error_result(message: str) -> types.CallToolResult:
    """The MCP error-result contract for this tool: isError=True, never a raised
    exception. `message` must already be safe to hand back to the caller -- callers
    of this helper are responsible for never passing a raw exception string, a host,
    or a credential into it."""
    return types.CallToolResult(content=[types.TextContent(type="text", text=message)], isError=True)


@mcp.tool()
async def check_vendor_compliance_events(ctx: Context, vendor_name: str) -> dict:
    """Look up a vendor's recent compliance or misconduct events on the external
    Vendor Background Check API -- a real network call to a separate compliance/
    risk-event feed, distinct from VendorIQ's own internal VENDOR_DB.

    Answers: what recent compliance or misconduct events does this vendor have on
    record. A vendor simply not tracked by this feed returns an empty events list,
    never an error -- "no record here" and "the feed is down" are never conflated.

    Args:
        vendor_name: The vendor's registered business name, exactly as named by the user.
    """
    correlation_id = str(uuid.uuid4())
    await _emit_log(
        ctx, "info", "tool.started", correlation_id, tool="check_vendor_compliance_events", vendor_name=vendor_name
    )

    base_url = os.environ.get(VENDOR_BGCHECK_BASE_URL_ENV_VAR)
    api_key = os.environ.get(VENDOR_BGCHECK_API_KEY_ENV_VAR)
    if not base_url or not api_key:
        # Naming the *env var* is fine -- an operator needs that to fix it. Naming its
        # *value* never happens on this branch (there isn't one to name: it's missing).
        missing = [
            name
            for name, value in (
                (VENDOR_BGCHECK_BASE_URL_ENV_VAR, base_url),
                (VENDOR_BGCHECK_API_KEY_ENV_VAR, api_key),
            )
            if not value
        ]
        await _emit_log(
            ctx,
            "warning",
            "config.missing",
            correlation_id,
            tool="check_vendor_compliance_events",
            missing_env_vars=missing,
        )
        return _bgcheck_error_result(
            "The Vendor Background Check API is not configured on this server "
            f"({' and '.join(missing)} must be set). Nothing was looked up."
        )

    client = _get_http_client()
    # stream=True keeps the connection checked out of the pool until this tool
    # explicitly releases it below -- a plain client.get() would already have
    # returned the connection to the pool by the time it comes back, which would
    # make a "release in finally" here a no-op rather than doing real work.
    request = client.build_request(
        "GET",
        f"{base_url}/v1/compliance-events",
        # Bound query parameter: httpx encodes this itself. vendor_name (model-supplied)
        # is NEVER f-string-concatenated into the URL path or query string by hand.
        params={"vendor_name": vendor_name},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=VENDOR_BGCHECK_TIMEOUT,
    )

    started_at = time.perf_counter()
    await _emit_log(
        ctx,
        "info",
        "external_call.started",
        correlation_id,
        tool="check_vendor_compliance_events",
        target="vendor_bgcheck_api",
    )

    response: httpx.Response | None = None
    try:
        response = await _emit_progress_while_pending(
            ctx,
            client.send(request, stream=True),
            message="Waiting on the Vendor Background Check API",
        )
        await response.aread()
    except httpx.TimeoutException:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        await _emit_log(
            ctx,
            "error",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="timeout",
            # Hardcoded, not exc.__class__.__name__: httpx raises specific subclasses
            # (ConnectTimeout/ReadTimeout/...) but every timeout is logged and reported
            # under one stable class name so a dashboard/alert can match on it reliably.
            error_class="TimeoutError",
        )
        return _bgcheck_error_result(
            "The Vendor Background Check API did not respond in time. Nothing was looked up; try again."
        )
    except httpx.RequestError as exc:
        # Connection refused, DNS failure, TLS error, etc. str(exc) on these can embed
        # the host/URL -- so only the exception's *class name* is ever logged or
        # returned, never str(exc), which is exactly where a host would leak.
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        await _emit_log(
            ctx,
            "error",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="failure",
            error_class=exc.__class__.__name__,
        )
        return _bgcheck_error_result(
            "Could not reach the Vendor Background Check API. Nothing was looked up; try again later."
        )
    finally:
        # Returns the connection to the pool. Without this, an exception raised
        # between `send()` succeeding and normal completion (e.g. during `.aread()`,
        # or anywhere below before a clean return) would leak that connection instead
        # of returning it -- this is what actually prevents that, not a formality.
        if response is not None:
            await response.aclose()

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)

    if response.status_code == 401:
        await _emit_log(
            ctx,
            "warning",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="unauthorized",
            error_class="HTTPStatusError",
        )
        return _bgcheck_error_result(
            "Authentication with the Vendor Background Check API failed. Nothing was looked up."
        )

    if response.status_code == 404:
        await _emit_log(
            ctx,
            "info",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="not_tracked",
        )
        return {
            "vendor_name": vendor_name,
            "events": [],
            "source": "vendor_background_check_api",
            "note": "This vendor is not tracked by the Background Check feed (not the same as a confirmed clean record).",
        }

    if response.status_code >= 400:
        await _emit_log(
            ctx,
            "error",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="failure",
            error_class="HTTPStatusError",
            status_code=response.status_code,
        )
        return _bgcheck_error_result(
            "The Vendor Background Check API returned an unexpected error. Nothing was looked up."
        )

    try:
        payload = json.loads(response.content)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        await _emit_log(
            ctx,
            "error",
            "external_call.finished",
            correlation_id,
            tool="check_vendor_compliance_events",
            target="vendor_bgcheck_api",
            duration_ms=duration_ms,
            outcome="failure",
            error_class=exc.__class__.__name__,
        )
        return _bgcheck_error_result(
            "The Vendor Background Check API returned a response that could not be parsed."
        )

    await _emit_log(
        ctx,
        "info",
        "external_call.finished",
        correlation_id,
        tool="check_vendor_compliance_events",
        target="vendor_bgcheck_api",
        duration_ms=duration_ms,
        outcome="success",
        event_count=len(payload.get("events", [])),
    )

    return {
        "vendor_name": payload.get("vendor_name", vendor_name),
        "events": payload.get("events", []),
        "source": "vendor_background_check_api",
        "as_of": payload.get("as_of"),
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
async def get_vendor_profile(vendor_name: str, ctx: Context) -> dict:
    """One vendor's full profile: its track record plus the job seeker's own logged interactions with it."""
    # URI path segments arrive percent-encoded (e.g. "Vantage%20Talent%20Group") and are
    # never auto-decoded by the SDK's template matcher, so decode before using this for lookups.
    vendor_name = unquote(vendor_name).strip()
    correlation_id = str(uuid.uuid4())

    vendor_by_lower_name = {name.lower(): name for name in VENDOR_DB}
    canonical_name = vendor_by_lower_name.get(vendor_name.lower(), vendor_name)
    track_record = VENDOR_DB.get(
        canonical_name,
        {"complaint_count": 0, "red_flags": [], "risk_rating": "unknown", "note": "no record on file"},
    )

    resolved_interactions_file = await _resolve_within_roots(
        ctx, INTERACTIONS_FILE, correlation_id=correlation_id, tool="get_vendor_profile"
    )
    if resolved_interactions_file is None:
        return {
            "vendor_name": canonical_name,
            "track_record": track_record,
            "logged_interactions": [],
            "logged_interaction_count": 0,
            "error": "path_outside_roots",
        }

    try:
        logged = (
            json.loads(resolved_interactions_file.read_text(encoding="utf-8")) if resolved_interactions_file.exists() else []
        )
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
async def extract_interaction_record(message_text: str, received_at: str, ctx: Context) -> str:
    correlation_id = str(uuid.uuid4())
    resolved_prompt_file = await _resolve_within_roots(
        ctx, EXTRACTION_PROMPT_FILE, correlation_id=correlation_id, tool="extract_interaction_record"
    )
    if resolved_prompt_file is None:
        return "Error: the extraction prompt template is outside the client's declared filesystem roots and could not be read."

    body = resolved_prompt_file.read_text(encoding="utf-8")
    if body.startswith("---"):
        end = body.find("---", 3)
        if end != -1:
            body = body[end + 3 :].lstrip("\n")
    return body.replace("{{message_text}}", message_text).replace("{{received_at}}", received_at)


if __name__ == "__main__":
    # STDIO transport, single-user: docs/TRANSPORT_DECISION.md. `uv run server.py` is
    # spawned fresh per client connection (Claude Desktop, Claude Code, the Inspector),
    # so this process only ever serves the one client that started it. Do NOT add a
    # session/connection map keyed by client id anywhere in this file -- there is no
    # second client to key it by, and adding one would only be dead code today or a
    # real cross-client bug if this is ever ported to a shared transport without first
    # re-reading and updating that decision document.
    #
    # Written to stderr, not stdout: stdout is the JSON-RPC wire for stdio transport,
    # so anything else printed there would corrupt the protocol stream mid-message.
    print(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "info",
                "service": "vendoriq-kb",
                "event": "server.startup",
                "transport": "stdio",
                "state_model": "single-user, one process per connection, no shared session store",
            }
        ),
        file=sys.stderr,
        flush=True,
    )
    mcp.run(transport="stdio")
