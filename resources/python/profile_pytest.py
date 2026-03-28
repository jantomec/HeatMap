from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List

from python_line_profiler import LineProfiler
from python_mapping import project_line_stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Profile a pytest target for HeatMap.")
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("pytest_args", nargs=argparse.REMAINDER)
    return parser.parse_args()


class ProfilerPlugin:
    def __init__(self, target_nodeid: str) -> None:
        self.target_nodeid = target_nodeid
        self.profiler: LineProfiler | None = None
        self.executed_target = False
        self.target_metadata: Dict[str, Any] = {
            "id": target_nodeid,
            "label": target_nodeid,
            "filePath": "",
        }

    def attach_profiler(self, profiler: LineProfiler) -> None:
        self.profiler = profiler

    def pytest_runtest_setup(self, item: Any) -> None:
        if item.nodeid != self.target_nodeid:
            return

        self.executed_target = True
        file_path, line_number, _ = item.location
        root_path = Path(getattr(item.config, "rootpath", Path.cwd())).resolve()
        absolute_path = _resolve_location(root_path, file_path)
        self.target_metadata = {
            "id": item.nodeid,
            "label": getattr(item, "name", item.nodeid),
            "filePath": str(absolute_path),
            "line": int(line_number) + 1,
        }
        if self.profiler is not None:
            self.profiler.start()

    def pytest_runtest_teardown(self, item: Any, nextitem: Any) -> None:
        if item.nodeid == self.target_nodeid and self.executed_target and self.profiler is not None:
            self.profiler.stop()


def main() -> int:
    arguments = parse_args()
    workspace_path = prepare_workspace(arguments.workspace)

    try:
        import pytest
    except ImportError:
        print("pytest is not installed for the selected interpreter.", file=sys.stderr)
        return 2

    line_profiler = LineProfiler(str(workspace_path))
    profiler = ProfilerPlugin(arguments.target)
    profiler.attach_profiler(line_profiler)
    captured_stdout = io.StringIO()

    with contextlib.redirect_stdout(captured_stdout):
        exit_code = pytest.main(
            [*normalize_pytest_args(arguments.pytest_args), "-q", arguments.target],
            plugins=[profiler],
        )

    if exit_code != 0:
        captured_output = captured_stdout.getvalue().strip()
        if captured_output:
            print(captured_output, file=sys.stderr)
        return int(exit_code)

    if not profiler.executed_target:
        print(f'HeatMap could not find the selected pytest target "{arguments.target}".', file=sys.stderr)
        return 3

    profile_rows = line_profiler.snapshot()
    projected_files = project_line_stats(profile_rows, workspace_root=str(workspace_path))
    payload = {
        "target": profiler.target_metadata,
        "files": projected_files,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(payload))
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
