"""Normalize Concierge Plyworks edit intents. No Anthropic import — safe to unit-test."""

from typing import Any, Dict, List, Optional

KNOWN_DESIGNS = ("shelf", "table", "stool", "bench")
KNOWN_ACTIONS = ("add", "rotate", "delete", "load_design")
KNOWN_KINDS = ("h", "v")
KNOWN_AXES = ("x", "y", "z")
BOARD_SNAPSHOT_KEYS = ("id", "name", "w", "h", "d", "x", "y", "z", "material")


def _as_design(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    design = str(raw).strip().lower()
    if not design or design in ("null", "none"):
        return None
    return design if design in KNOWN_DESIGNS else None


def compact_plyworks_boards(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = item.get("id")
        if isinstance(ident, bool) or not isinstance(ident, (int, float)):
            continue
        board: Dict[str, Any] = {"id": int(ident)}
        for key in BOARD_SNAPSHOT_KEYS:
            if key == "id" or key not in item:
                continue
            board[key] = item[key]
        out.append(board)
    return out


def _normalize_target(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    target: Dict[str, Any] = {}
    ident = raw.get("id")
    if not isinstance(ident, bool) and isinstance(ident, (int, float)):
        target["id"] = int(ident)
    name = raw.get("name")
    if isinstance(name, str) and name.strip():
        target["name"] = name.strip()
    return target or None


def _normalize_one_op(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    action = str(raw.get("action") or "").strip().lower()
    if action not in KNOWN_ACTIONS:
        return None
    if action == "add":
        kind = str(raw.get("kind") or "").strip().lower()
        if kind not in KNOWN_KINDS:
            return None
        return {"action": "add", "kind": kind}
    if action == "rotate":
        axis = str(raw.get("axis") or "").strip().lower()
        if axis not in KNOWN_AXES:
            return None
        op: Dict[str, Any] = {"action": "rotate", "axis": axis}
        target = _normalize_target(raw.get("target"))
        if target:
            op["target"] = target
        return op
    if action == "delete":
        op: Dict[str, Any] = {"action": "delete"}
        target = _normalize_target(raw.get("target"))
        if target:
            op["target"] = target
        return op
    design = _as_design(raw.get("design"))
    if not design:
        return None
    return {"action": "load_design", "design": design}


def normalize_plyworks_ops(raw: Any) -> Optional[List[Dict[str, Any]]]:
    if raw is None or not isinstance(raw, list):
        return None
    out: List[Dict[str, Any]] = []
    for item in raw:
        op = _normalize_one_op(item)
        if op:
            out.append(op)
    return out or None
