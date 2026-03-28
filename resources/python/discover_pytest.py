from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover pytest targets for HeatMap.")
    parser.add_argument("--workspace", required=True)
    parser.add_argument("pytest_args", nargs=argparse.REMAINDER)
    return parser.parse_args()


class CollectorPlugin:
    def __init__(self) -> None:
        self.targets: List[dict[str, Any]] = []

    def pytest_collection_finish(self, session: Any) -> None:
        root_path = Path(getattr(session.config, "rootpath", Path.cwd())).resolve()
        collected_targets: List[dict[str, Any]] = []
        for item in session.items:
            file_path, line_number, _ = item.location
            absolute_path = _resolve_location(root_path, file_path)
            collected_targets.append(
                {
                    "id": item.nodeid,
                    "label": getattr(item, "name", item.nodeid),
                    "filePath": str(absolute_path),
                    "line": int(line_number) + 1,
                }
            )

        self.targets = collected_targets


def main() -> int:
    arguments = parse_args()
    workspace_path = prepare_workspace(arguments.workspace)

    try:
        import pytest
    except ImportError:
        print("pytest is not installed for the selected interpreter.", file=sys.stderr)
        return 2

    collector = CollectorPlugin()
    captured_stdout = io.StringIO()

    with contextlib.redirect_stdout(captured_stdout):
        exit_code = pytest.main(
            ["--collect-only", "-q", *normalize_pytest_args(arguments.pytest_args)],
            plugins=[collector],
        )

    if exit_code not in (0, 5):
        captured_output = captured_stdout.getvalue().strip()
        if captured_output:
            print(captured_output, file=sys.stderr)
        return int(exit_code)

    print(json.dumps({"targets": collector.targets}))
    return 0


def normalize_pytest_args(pytest_args: List[str]) -> List[str]:
    if pytest_args and pytest_args[0] == "--":
        return pytest_args[1:]

    return pytest_args


def prepare_workspace(workspace_path: str) -> Path:
    resolved_workspace = Path(workspace_path).resolve()
    os.chdir(resolved_workspace)
    workspace_entry = str(resolved_workspace)
    if workspace_entry not in sys.path:
        sys.path.insert(0, workspace_entry)

    return resolved_workspace


def _resolve_location(root_path: Path, file_path: str) -> Path:
    candidate = Path(file_path)
    if candidate.is_absolute():
        return candidate.resolve()

    return (root_path / candidate).resolve()


if __name__ == "__main__":
    sys.exit(main())
