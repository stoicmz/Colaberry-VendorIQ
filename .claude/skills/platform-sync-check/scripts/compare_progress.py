#!/usr/bin/env python3
"""Read-only: compare local .colaberry files against GitHub's copies.

Prints each progress.json difference tagged PLATFORM-OWNED or YOURS, and
whether plan.json still matches the platform's fingerprint in manifest.json.
Never writes a file or changes git state. Ownership rules follow
docs/DATA_CONTRACT.md; see references/ownership-rules.md.

Exit codes: 0 = no progress.json differences, 1 = differences found,
2 = could not check. The plan.json line is a warning and never changes it.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

GIT_TIMEOUT_SECONDS = 30  # CLAUDE.md: no unbounded waits on external calls
YOURS_STORY_FIELDS = {"files_touched", "tests_added", "notes", "updated_at"}
YOURS_CRITERION_FIELDS = {"passed", "evidence"}
PROGRESS = ".colaberry/progress.json"
PLAN = ".colaberry/plan.json"
MANIFEST = ".colaberry/manifest.json"


def run_git(args, cwd=None):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                            timeout=GIT_TIMEOUT_SECONDS)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout


def short(value, limit=80):
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit - 3] + "..."


def compare_progress(local, remote):
    diffs = []
    for key in sorted((set(local) | set(remote)) - {"stories"}):
        if local.get(key) != remote.get(key):
            diffs.append(f"{key} [PLATFORM-OWNED]: yours={short(local.get(key))} "
                         f"github={short(remote.get(key))}")

    local_by_id = {s["id"]: s for s in local.get("stories", [])}
    remote_by_id = {s["id"]: s for s in remote.get("stories", [])}
    for sid in sorted(local_by_id.keys() - remote_by_id.keys()):
        diffs.append(f"{sid} [PLATFORM-OWNED]: only in your copy - hand-added, "
                     "the platform will discard it")
    for sid in sorted(remote_by_id.keys() - local_by_id.keys()):
        diffs.append(f"{sid} [PLATFORM-OWNED]: only on GitHub - from a sync you don't have")

    for sid in sorted(local_by_id.keys() & remote_by_id.keys()):
        mine, theirs = local_by_id[sid], remote_by_id[sid]
        for key in sorted((set(mine) | set(theirs)) - {"criteria"}):
            if mine.get(key) != theirs.get(key):
                owner = "YOURS" if key in YOURS_STORY_FIELDS else "PLATFORM-OWNED"
                diffs.append(f"{sid}.{key} [{owner}]: yours={short(mine.get(key))} "
                             f"github={short(theirs.get(key))}")
        my_criteria, their_criteria = mine.get("criteria", []), theirs.get("criteria", [])
        if len(my_criteria) != len(their_criteria):
            diffs.append(f"{sid}.criteria [PLATFORM-OWNED]: yours has {len(my_criteria)}, "
                         f"github has {len(their_criteria)}")
        for i, (a, b) in enumerate(zip(my_criteria, their_criteria)):
            for key in sorted(set(a) | set(b)):
                if a.get(key) != b.get(key):
                    owner = "YOURS" if key in YOURS_CRITERION_FIELDS else "PLATFORM-OWNED"
                    diffs.append(f"{sid}.criteria[{i}].{key} [{owner}]: "
                                 f"yours={short(a.get(key))} github={short(b.get(key))}")
    return diffs


def plan_fingerprint(manifest):
    # The per-file hash of what the platform last wrote, not the top-level
    # plan_sha256 (a hash of the plan itself, which never matches the file).
    for entry in manifest.get("files", []):
        if entry.get("path") == PLAN:
            return entry.get("sha256")
    return None


def check_plan(local_bytes, fingerprint):
    # Absent is a normal state: deleting plan.json is how you hand it back to
    # the platform, which writes a fresh copy on its next publish.
    if local_bytes is None:
        return ("absent — the platform will write a fresh copy on its next publish "
                "(a warning, not a conflict)")
    if not fingerprint:
        return ("manifest.json has no fingerprint for plan.json, so whether the "
                "platform manages it can't be told")
    lf = local_bytes.replace(b"\r\n", b"\n")
    variants = {"as stored": local_bytes, "LF line endings": lf,
                "CRLF line endings": lf.replace(b"\n", b"\r\n")}
    for label, data in variants.items():
        if hashlib.sha256(data).hexdigest() == fingerprint:
            return f"matches the platform's fingerprint ({label}): the platform manages it"
    return ("doesn't match the platform's fingerprint, so the platform isn't updating "
            "it (hand-edit or hashing difference; can't be told from here)")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--branch", default="main")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # em-dashes in the data

    root = Path(run_git(["rev-parse", "--show-toplevel"]).decode("utf-8").strip())

    def remote(path):
        return run_git(["show", f"origin/{args.branch}:{path}"], cwd=root)

    local_progress = json.loads((root / PROGRESS).read_text(encoding="utf-8"))
    remote_progress = json.loads(remote(PROGRESS).decode("utf-8"))
    remote_manifest = json.loads(remote(MANIFEST).decode("utf-8"))

    diffs = compare_progress(local_progress, remote_progress)
    plan_path = root / PLAN
    plan_bytes = plan_path.read_bytes() if plan_path.exists() else None
    plan_status = check_plan(plan_bytes, plan_fingerprint(remote_manifest))

    print(f"Compared against origin/{args.branch} "
          f"(platform data as of {remote_manifest.get('generated_at')})")
    print(f"progress.json: {len(diffs)} difference(s)")
    for line in diffs:
        print(f"  - {line}")
    print(f"plan.json: {plan_status}")
    return 1 if diffs else 0  # plan.json is a warning only; see ownership-rules.md


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as err:
        print(f"ERROR: could not complete the check: {err}", file=sys.stderr)
        sys.exit(2)
