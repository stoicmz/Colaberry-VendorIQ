#!/usr/bin/env python3
"""
score_prompt.py

WHAT THIS FILE DOES (plain English):
This script grades a prompt against a set of test cases you already wrote
down and confirmed. For each test case it:
  1. Fills the case's "input" values into the prompt.
  2. Sends the filled-in prompt to Claude.
  3. Compares Claude's answer to the "expected" answer for that case.
It then prints a score (what fraction of cases matched) plus details on
any case that failed, so you can see exactly what went wrong.

HOW TO RUN IT:
  python scripts/score_prompt.py <path-to-prompt-file> <path-to-eval.jsonl>

Example:
  python scripts/score_prompt.py prompts/extract-interaction-record/prompt.txt prompts/extract-interaction-record/eval.jsonl
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# These two packages don't come with Python by default. If they aren't
# installed, tell the user how to fix that in plain English instead of
# letting Python crash with a confusing "ModuleNotFoundError".
try:
    from dotenv import load_dotenv
except ImportError:
    print("Missing package 'python-dotenv'. Fix: run  pip install python-dotenv")
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("Missing package 'anthropic'. Fix: run  pip install anthropic")
    sys.exit(1)


# The model used to answer each test case. You can override this without
# editing the script by setting a CLAUDE_MODEL value in your .env file.
DEFAULT_MODEL = "claude-sonnet-5"

# When comparing two numbers, they count as "matching" if they're within
# this distance of each other, instead of needing to be exactly equal.
NUMBER_TOLERANCE = 0.01


def strip_frontmatter(prompt_text):
    """
    Prompt files start with a YAML header block (between two '---' lines)
    recording things like name, version, and status. That header is
    documentation for humans, not instructions for Claude, so it's removed
    before the prompt is ever sent.
    """
    match = re.match(r"^---\s*\n.*?\n---\s*\n", prompt_text, re.DOTALL)
    if match:
        return prompt_text[match.end():].lstrip("\n")
    return prompt_text


def fill_template(prompt_text, input_values):
    """
    Takes the prompt's text and one test case's "input" object, and swaps
    every {{field_name}} placeholder in the prompt for the matching value.
    Example: if the prompt contains {{message_text}}, and the input has
    "message_text": "hello", the placeholder becomes "hello".
    """
    filled = prompt_text
    for key, value in input_values.items():
        placeholder = "{{" + key + "}}"
        filled = filled.replace(placeholder, str(value))
    return filled


def extract_json_object(reply_text):
    """
    Claude is asked to answer with a JSON object, but it might wrap that
    object in extra words (like "Sure, here you go: { ... }"). This pulls
    the JSON object out of whatever text came back, ignoring the wording
    around it. Returns None if no valid JSON object could be found.
    """
    # First, try treating the whole reply as JSON.
    try:
        return json.loads(reply_text)
    except json.JSONDecodeError:
        pass

    # If that failed, look for the first { ... } block anywhere in the text.
    match = re.search(r"\{.*\}", reply_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return None


def values_match(expected_value, actual_value):
    """
    Compares one field between "expected" and what Claude actually returned,
    following the project's comparison rules:
      - if expected is missing/null, actual must also be missing/null
      - text is compared ignoring case and extra surrounding whitespace
      - numbers are allowed a small tolerance instead of an exact match
      - everything else (true/false, etc.) must match exactly
    """
    if expected_value is None:
        return actual_value is None

    if isinstance(expected_value, bool) or isinstance(actual_value, bool):
        return expected_value == actual_value

    if isinstance(expected_value, (int, float)):
        if not isinstance(actual_value, (int, float)):
            return False
        return abs(expected_value - actual_value) <= NUMBER_TOLERANCE

    if isinstance(expected_value, str):
        if not isinstance(actual_value, str):
            return False
        return expected_value.strip().lower() == actual_value.strip().lower()

    return expected_value == actual_value


def compare_case(expected, actual):
    """
    A test case only counts as a "match" if EVERY field named in "expected"
    matches. Any extra fields Claude's answer includes that aren't in
    "expected" are ignored on purpose, per the project's grading rules.
    Returns (did_it_match, list_of_field_level_mismatches).
    """
    mismatches = []
    for field, expected_value in expected.items():
        actual_value = actual.get(field) if isinstance(actual, dict) else None
        if not values_match(expected_value, actual_value):
            mismatches.append((field, expected_value, actual_value))
    return (len(mismatches) == 0, mismatches)


def load_api_key():
    """
    Reads ANTHROPIC_API_KEY out of a .env file in the project root. If it's
    missing, this stops the script early with a plain-English fix, instead
    of letting the request fail later with a technical error.
    """
    load_dotenv()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(
            "No API key found.\n"
            "Fix: create a file named '.env' in the project's root folder "
            "with this one line inside it:\n"
            "  ANTHROPIC_API_KEY=your-key-here\n"
            "You can get a key at https://console.anthropic.com/"
        )
        sys.exit(1)
    return api_key


def main():
    parser = argparse.ArgumentParser(
        description="Score a prompt against a set of confirmed test cases."
    )
    parser.add_argument("prompt_path", help="Path to the prompt text file")
    parser.add_argument("eval_path", help="Path to the eval.jsonl file")
    args = parser.parse_args()

    prompt_file = Path(args.prompt_path)
    eval_file = Path(args.eval_path)

    # Check the files exist BEFORE touching the API key or the internet,
    # since a missing file has nothing to do with either of those.
    if not prompt_file.exists():
        print(
            f"No prompt file found at: {prompt_file}\n"
            "Fix: write the prompt and save it at that path, then run this again."
        )
        sys.exit(1)

    if not eval_file.exists():
        print(f"No eval file found at: {eval_file}")
        sys.exit(1)

    prompt_text = strip_frontmatter(prompt_file.read_text(encoding="utf-8"))

    # Read the test cases. Each line in the file is one test case, written
    # as its own small JSON object.
    cases = []
    with eval_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))

    if not cases:
        print(f"The eval file at {eval_file} has no test cases in it.")
        sys.exit(1)

    api_key = load_api_key()
    model = os.environ.get("CLAUDE_MODEL", DEFAULT_MODEL)
    client = anthropic.Anthropic(api_key=api_key)

    passed = 0
    failures = []  # each entry: (case_number, expected, actual)

    for case_number, case in enumerate(cases, start=1):
        filled_prompt = fill_template(prompt_text, case["input"])

        try:
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": filled_prompt}],
            )
        except anthropic.AuthenticationError:
            print(
                "Your API key was rejected.\n"
                "Fix: open your .env file and make sure ANTHROPIC_API_KEY is set "
                "to a valid, current key from https://console.anthropic.com/"
            )
            sys.exit(1)
        except anthropic.APIConnectionError:
            print("Could not reach Anthropic's servers. Check your internet connection and try again.")
            sys.exit(1)
        except anthropic.APIStatusError as error:
            print(f"Anthropic's API returned an error: {error}")
            sys.exit(1)

        reply_text = response.content[0].text if response.content else ""
        actual = extract_json_object(reply_text)
        expected = case.get("expected", {})

        if actual is None:
            failures.append((case_number, expected, f"(no readable JSON in reply: {reply_text[:200]!r})"))
            continue

        is_match, _mismatches = compare_case(expected, actual)
        if is_match:
            passed += 1
        else:
            failures.append((case_number, expected, actual))

    score = passed / len(cases)

    print()
    print(f"Score: {score:.2f}  ({passed}/{len(cases)} cases matched)")
    print(f"Model: {model}")
    print(f"Cases run: {len(cases)}")

    if failures:
        print()
        print("Failed cases:")
        for case_number, expected, actual in failures:
            print(f"  Case {case_number}:")
            print(f"    expected: {expected}")
            print(f"    actual:   {actual}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Last-resort safety net: never show a raw stack trace to a
        # non-programmer. Say what kind of problem it was instead.
        print(f"Something went wrong ({type(error).__name__}): {error}")
        sys.exit(1)
