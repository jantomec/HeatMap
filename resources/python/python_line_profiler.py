from __future__ import annotations

import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class _ActiveFrame:
    filename: str
    lineno: int
    function_name: str
    started_at_ns: int


class LineProfiler:
    def __init__(self, workspace_root: str) -> None:
        self.workspace_root = Path(workspace_root).resolve()
        self._metrics: Dict[tuple[str, int, str], Dict[str, Any]] = {}
        self._active_by_thread: Dict[int, _ActiveFrame] = {}
        self._previous_trace = None
        get_thread_trace = getattr(threading, "gettrace", None)
        self._previous_thread_trace = get_thread_trace() if callable(get_thread_trace) else None

    def start(self) -> None:
        self._active_by_thread.clear()
        self._metrics.clear()
        self._previous_trace = sys.gettrace()
        sys.settrace(self._trace)
        threading.settrace(self._trace)

    def stop(self) -> None:
        timestamp_ns = time.perf_counter_ns()
        for thread_id in list(self._active_by_thread):
            self._flush_active_frame(thread_id, timestamp_ns)
        sys.settrace(self._previous_trace)
        threading.settrace(self._previous_thread_trace)
        self._active_by_thread.clear()

    def snapshot(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for (filename, lineno, function_name), metric in sorted(self._metrics.items()):
            rows.append(
                {
                    "filename": filename,
                    "lineno": lineno,
                    "functionName": function_name,
                    "callCount": int(metric["callCount"]),
                    "totalTimeMs": round(float(metric["totalTimeNs"]) / 1_000_000.0, 6),
                    "cumulativeTimeMs": round(float(metric["totalTimeNs"]) / 1_000_000.0, 6),
                }
            )

        return rows

    def _trace(self, frame, event: str, arg):  # type: ignore[no-untyped-def]
        thread_id = threading.get_ident()
        timestamp_ns = time.perf_counter_ns()
        self._flush_active_frame(thread_id, timestamp_ns)

        if event == "call":
            self._active_by_thread.pop(thread_id, None)
            return self._trace

        if event == "line":
            self._set_active_frame(thread_id, frame, timestamp_ns, count_hit=True)
            return self._trace

        if event in {"return", "exception"}:
            self._active_by_thread.pop(thread_id, None)
            return self._trace

        self._active_by_thread.pop(thread_id, None)
        return self._trace

    def _set_active_frame(self, thread_id: int, frame, timestamp_ns: int, *, count_hit: bool) -> None:  # type: ignore[no-untyped-def]
        filename = self._normalize_filename(frame.f_code.co_filename)
        if filename is None:
            self._active_by_thread.pop(thread_id, None)
            return

        lineno = int(frame.f_lineno)
        function_name = str(frame.f_code.co_name or "<module>")
        if count_hit:
            metric = self._metrics.setdefault(
                (filename, lineno, function_name),
                {"callCount": 0, "totalTimeNs": 0},
            )
            metric["callCount"] += 1

        self._active_by_thread[thread_id] = _ActiveFrame(
            filename=filename,
            lineno=lineno,
            function_name=function_name,
            started_at_ns=timestamp_ns,
        )

    def _flush_active_frame(self, thread_id: int, timestamp_ns: int) -> None:
        active = self._active_by_thread.get(thread_id)
        if active is None:
            return

        elapsed_ns = max(timestamp_ns - active.started_at_ns, 0)
        metric = self._metrics.setdefault(
            (active.filename, active.lineno, active.function_name),
            {"callCount": 0, "totalTimeNs": 0},
        )
        metric["totalTimeNs"] += elapsed_ns

    def _normalize_filename(self, filename: str) -> Optional[str]:
        if not filename or filename.startswith("<") or filename.startswith("~"):
            return None

        resolved_path = Path(filename).resolve()
        if not resolved_path.exists():
            return None

        try:
            resolved_path.relative_to(self.workspace_root)
        except ValueError:
            return None

        return str(resolved_path)
