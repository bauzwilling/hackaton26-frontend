import unittest

from plyworks_ops import compact_plyworks_boards, normalize_plyworks_ops


class CompactBoardsTest(unittest.TestCase):
    def test_keeps_known_keys_and_int_id(self):
        boards = compact_plyworks_boards(
            [
                {"id": 7, "name": "Back", "w": 800, "extra": "drop"},
                {"name": "no-id"},
                "skip",
            ]
        )
        self.assertEqual(
            boards,
            [{"id": 7, "name": "Back", "w": 800}],
        )

    def test_rejects_bool_id(self):
        self.assertEqual(compact_plyworks_boards([{"id": True, "name": "x"}]), [])


class NormalizeOpsTest(unittest.TestCase):
    def test_add_rotate_delete_load(self):
        ops = normalize_plyworks_ops(
            [
                {"action": "add", "kind": "h"},
                {"action": "rotate", "axis": "y", "target": {"name": "Back"}},
                {"action": "delete", "target": {"id": 2}},
                {"action": "load_design", "design": "table"},
            ]
        )
        self.assertEqual(
            ops,
            [
                {"action": "add", "kind": "h"},
                {"action": "rotate", "axis": "y", "target": {"name": "Back"}},
                {"action": "delete", "target": {"id": 2}},
                {"action": "load_design", "design": "table"},
            ],
        )

    def test_drops_unknown_and_incomplete(self):
        self.assertIsNone(
            normalize_plyworks_ops(
                [
                    {"action": "explode"},
                    {"action": "add"},
                    {"action": "rotate", "axis": "w"},
                    {"action": "load_design", "design": "sofa"},
                ]
            )
        )

    def test_null_and_non_list(self):
        self.assertIsNone(normalize_plyworks_ops(None))
        self.assertIsNone(normalize_plyworks_ops({"action": "add", "kind": "h"}))


class PromptFileTest(unittest.TestCase):
    def test_has_plyworks_placeholders(self):
        from pathlib import Path

        text = (Path(__file__).resolve().parents[1] / "prompts" / "concierge.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("{plyworks_boards}", text)
        self.assertIn("plyworksOps", text)
        self.assertIn('{"action":"add","kind":"h"}', text)


if __name__ == "__main__":
    unittest.main()
