from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


@dataclass(frozen=True)
class FunctionSpan:
    filename: str
    name: str
    lineno: int
    end_lineno: int


class _FunctionCollector(ast.NodeVisitor):
    def __init__(self) -> None:
        self.nodes: List[ast.AST] = []

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.nodes.append(node)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.nodes.append(node)
        self.generic_visit(node)


def collect_function_spans(file_path: str) -> List[FunctionSpan]:
    resolved_path = str(Path(file_path).resolve())
    source_text = Path(resolved_path).read_text(encoding="utf-8")
    syntax_tree = ast.parse(source_text, filename=resolved_path)
    collector = _FunctionCollector()
    collector.visit(syntax_tree)

    spans: List[FunctionSpan] = []
    for node in collector.nodes:
        lineno = getattr(node, "lineno", None)
        end_lineno = getattr(node, "end_lineno", lineno)

        if isinstance(lineno, int) and isinstance(end_lineno, int):
            spans.append(
                FunctionSpan(
                    filename=resolved_path,
                    name=getattr(node, "name", "<unknown>"),
                    lineno=lineno,
                    end_lineno=end_lineno,
                )
            )

    return spans


def dump_function_spans(file_path: str) -> List[Dict[str, Any]]:
    return [
        {
            "filename": span.filename,
            "name": span.name,
            "lineno": span.lineno,
            "end_lineno": span.end_lineno,
        }
        for span in collect_function_spans(file_path)
    ]


def project_function_stats(
    stats_rows: Iterable[Dict[str, Any]], workspace_root: str | None = None
) -> List[Dict[str, Any]]:
    workspace_path = Path(workspace_root).resolve() if workspace_root else None
    normalized_rows = []
    for row in stats_rows:
        normalized_row = _normalize_stat_row(row, workspace_path)
        if normalized_row is not None:
            normalized_rows.append(normalized_row)

    span_index = _build_span_index(row["filename"] for row in normalized_rows)
    line_metrics_by_file: Dict[str, Dict[int, Dict[str, Any]]] = {}

    for row in normalized_rows:
        file_index = span_index.get(row["filename"])
        if file_index is None:
            continue

        span = file_index.get((row["lineno"], row["functionName"]))
        if span is None:
            continue

        file_metrics = line_metrics_by_file.setdefault(row["filename"], {})
        for line_number in range(span.lineno, span.end_lineno + 1):
            metric = file_metrics.setdefault(
                line_number,
                {
                    "line": line_number,
                    "callCount": 0,
                    "totalTimeMs": 0.0,
                    "cumulativeTimeMs": 0.0,
                    "functionNames": set(),
                    "granularity": "function-projected",
                },
            )
            metric["callCount"] += row["callCount"]
            metric["totalTimeMs"] += row["totalTimeMs"]
            metric["cumulativeTimeMs"] += row["cumulativeTimeMs"]
            metric["functionNames"].add(row["functionName"])

    files: List[Dict[str, Any]] = []
    for file_path, line_metrics in sorted(line_metrics_by_file.items()):
        metrics = []
        for line_number in sorted(line_metrics):
            line_metric = line_metrics[line_number]
            metrics.append(
                {
                    "line": line_metric["line"],
                    "callCount": line_metric["callCount"],
                    "totalTimeMs": round(line_metric["totalTimeMs"], 6),
                    "cumulativeTimeMs": round(line_metric["cumulativeTimeMs"], 6),
                    "functionName": ", ".join(sorted(line_metric["functionNames"])),
                    "granularity": line_metric["granularity"],
                }
            )

        files.append({"path": file_path, "metrics": metrics})

    return files


def project_line_stats(
    stats_rows: Iterable[Dict[str, Any]], workspace_root: str | None = None
) -> List[Dict[str, Any]]:
    workspace_path = Path(workspace_root).resolve() if workspace_root else None
    normalized_rows = []
    for row in stats_rows:
        normalized_row = _normalize_stat_row(row, workspace_path)
        if normalized_row is not None:
            normalized_rows.append(normalized_row)

    line_metrics_by_file: Dict[str, Dict[int, Dict[str, Any]]] = {}
    for row in normalized_rows:
        file_metrics = line_metrics_by_file.setdefault(row["filename"], {})
        metric = file_metrics.setdefault(
            row["lineno"],
            {
                "line": row["lineno"],
                "callCount": 0,
                "totalTimeMs": 0.0,
                "cumulativeTimeMs": 0.0,
                "functionNames": set(),
                "granularity": "line",
            },
        )
        metric["callCount"] += row["callCount"]
        metric["totalTimeMs"] += row["totalTimeMs"]
        metric["cumulativeTimeMs"] += row["cumulativeTimeMs"]
        metric["functionNames"].add(row["functionName"])

    files: List[Dict[str, Any]] = []
    for file_path, line_metrics in sorted(line_metrics_by_file.items()):
        metrics = []
        for line_number in sorted(line_metrics):
            line_metric = line_metrics[line_number]
            metrics.append(
                {
                    "line": line_metric["line"],
                    "callCount": line_metric["callCount"],
                    "totalTimeMs": round(line_metric["totalTimeMs"], 6),
                    "cumulativeTimeMs": round(line_metric["cumulativeTimeMs"], 6),
                    "functionName": ", ".join(sorted(line_metric["functionNames"])),
                    "granularity": line_metric["granularity"],
                }
            )

        files.append({"path": file_path, "metrics": metrics})

    return files


def _build_span_index(file_paths: Iterable[str]) -> Dict[str, Dict[Tuple[int, str], FunctionSpan]]:
    index: Dict[str, Dict[Tuple[int, str], FunctionSpan]] = {}
    for file_path in sorted(set(file_paths)):
        try:
            spans = collect_function_spans(file_path)
        except (OSError, SyntaxError, UnicodeDecodeError):
            continue

        index[file_path] = {(span.lineno, span.name): span for span in spans}

    return index


def _normalize_stat_row(
    row: Dict[str, Any], workspace_path: Path | None
) -> Dict[str, Any] | None:
    filename_value = row.get("filename")
    if not isinstance(filename_value, str):
        return None

    file_path = Path(filename_value).resolve()
    if not file_path.exists():
        return None

    if workspace_path is not None and not _is_relative_to(file_path, workspace_path):
        return None

    lineno = row.get("lineno")
    function_name = row.get("functionName")
    call_count = row.get("callCount")
    total_time_ms = row.get("totalTimeMs")
    cumulative_time_ms = row.get("cumulativeTimeMs")

    if not isinstance(lineno, int) or lineno < 1:
        return None
    if not isinstance(function_name, str) or not function_name:
        return None
    if not isinstance(call_count, int):
        return None
    if not isinstance(total_time_ms, (int, float)):
        return None
    if not isinstance(cumulative_time_ms, (int, float)):
        return None

    return {
        "filename": str(file_path),
        "lineno": lineno,
        "functionName": function_name,
        "callCount": call_count,
        "totalTimeMs": float(total_time_ms),
        "cumulativeTimeMs": float(cumulative_time_ms),
    }


def _is_relative_to(path_value: Path, parent_path: Path) -> bool:
    try:
        path_value.relative_to(parent_path)
        return True
    except ValueError:
        return False
