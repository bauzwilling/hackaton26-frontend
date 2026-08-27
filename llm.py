"""Anthropic Claude helper for the File → Factory concierge.

WAITING MODEL: Claude reads the user's text here. Our own structuring model replaces it.
WAITING BFF: this helper stands in for the BFF that will own routing. Keep the model call
confined to this module so swapping the provider stays a one-file change.

See docs/model-integration.md.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from anthropic import Anthropic

import config

KNOWN_APPS = ("boxouts", "simpleparts", "plyworks", "projects", "orbit", "admin")


def load_prompt_from_file(filename: str, marker: str) -> str:
    """Load a triple-quoted prompt string from a prompts/*.md file."""
    prompt_path = Path(__file__).parent / "prompts" / filename
    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read()

    start_token = f'{marker} = """'
    if start_token not in content:
        raise ValueError(f"Could not find {marker} in {filename}")

    start = content.index(start_token) + len(start_token)
    end = content.rindex('"""')
    return content[start:end]


def strip_json_fences(response_text: str) -> str:
    response_text = re.sub(r"^```(?:json)?\s*\n?", "", response_text)
    response_text = re.sub(r"\n?```$", "", response_text)
    return response_text.strip()


def call_claude_json(client: Anthropic, prompt: str) -> Dict[str, Any]:
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    block = message.content[0]
    text = getattr(block, "text", None) or str(block)
    response_text = strip_json_fences(text)
    return json.loads(response_text)


def _normalize_app(raw: Any, available_apps: List[str], restricted_apps: List[str] | None = None) -> Optional[str]:
    if raw is None:
        return None
    app = str(raw).strip().lower()
    if not app or app in ("null", "none"):
        return None
    known = {a for a in list(available_apps) + list(restricted_apps or []) if a in KNOWN_APPS}
    return app if app in known else None


def route_message(
    user_message: str,
    history: List[Dict[str, str]] | None = None,
    available_apps: List[str] | None = None,
    restricted_apps: List[str] | None = None,
) -> Dict[str, Any]:
    client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
    template = load_prompt_from_file("concierge.md", "CONCIERGE_PROMPT")
    apps = [a for a in (available_apps or []) if a in KNOWN_APPS]
    restricted = [a for a in (restricted_apps or []) if a in KNOWN_APPS]
    turns = []
    for turn in history or []:
        role = str(turn.get("role") or "")
        content = str(turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": content})
    prompt = (
        template.replace("{user_message}", user_message)
        .replace("{history}", json.dumps(turns[-16:]))
        .replace("{available_apps}", json.dumps(apps))
        .replace("{restricted_apps}", json.dumps(restricted))
    )
    data = call_claude_json(client, prompt)
    reply = str(data.get("reply") or "").strip()
    if not reply:
        raise ValueError("Claude returned an empty reply")
    return {"reply": reply, "app": _normalize_app(data.get("app"), apps, restricted)}
