from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class DemandEstimate:
    daily_sales: tuple[int, ...]
    smoothed_sales: tuple[float, ...]
    recent_average: float
    trend_multiplier: float
    volatility_index: float
    recommended_daily_units: float


def expand_daily_sales(base_pattern: Sequence[int], weeks: int, burst_every: int = 5) -> list[int]:
    if weeks < 1:
        raise ValueError("weeks must be at least 1")
    if len(base_pattern) == 0:
        raise ValueError("base_pattern must not be empty")

    sales: list[int] = []
    pattern_length = len(base_pattern)
    for week in range(weeks):
        weekly_bias = 1.0 + (week % 4) * 0.05
        for day_index, base_units in enumerate(base_pattern):
            day_bias = 1.0 + ((day_index + week) % 3) * 0.04
            burst_multiplier = 1.0
            absolute_day = week * pattern_length + day_index
            if burst_every > 0 and absolute_day % burst_every == 0:
                burst_multiplier += 0.35

            projected_units = int(round(base_units * weekly_bias * day_bias * burst_multiplier))
            sales.append(max(1, projected_units))

    return sales


def smooth_series(values: Sequence[int | float], window: int) -> list[float]:
    if window < 1:
        raise ValueError("window must be at least 1")
    if len(values) == 0:
        return []

    smoothed: list[float] = []
    for index in range(len(values)):
        start_index = max(0, index - window + 1)
        segment = values[start_index : index + 1]
        smoothed.append(sum(segment) / len(segment))

    return smoothed


def weighted_growth(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 1.0

    growth_total = 0.0
    weight_total = 0.0
    length = len(values)
    for index in range(1, length):
        previous_value = max(values[index - 1], 0.001)
        delta = (values[index] - values[index - 1]) / previous_value
        weight = 1.0 + index / length
        growth_total += delta * weight
        weight_total += weight

    normalized_growth = growth_total / weight_total
    return max(0.8, 1.0 + normalized_growth)


def calculate_volatility(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0

    absolute_changes: list[float] = []
    for index in range(1, len(values)):
        absolute_changes.append(abs(values[index] - values[index - 1]))

    baseline = max(sum(values) / len(values), 1.0)
    return sum(absolute_changes) / len(absolute_changes) / baseline


def estimate_demand(
    base_pattern: Sequence[int],
    weeks: int = 12,
    smoothing_window: int = 5,
    burst_every: int = 5,
) -> DemandEstimate:
    raw_sales = expand_daily_sales(base_pattern, weeks=weeks, burst_every=burst_every)
    smoothed_sales = smooth_series(raw_sales, smoothing_window)
    recent_window = min(len(smoothed_sales), smoothing_window * 2)
    recent_slice = smoothed_sales[-recent_window:]
    recent_average = sum(recent_slice) / len(recent_slice)

    trend_window = min(len(smoothed_sales), 21)
    trend_slice = smoothed_sales[-trend_window:]
    trend_multiplier = weighted_growth(trend_slice)
    volatility_index = calculate_volatility(trend_slice)

    recommendation_multiplier = 1.0 + min(volatility_index, 0.35)
    recommended_daily_units = recent_average * trend_multiplier * recommendation_multiplier

    return DemandEstimate(
        daily_sales=tuple(raw_sales),
        smoothed_sales=tuple(round(value, 2) for value in smoothed_sales),
        recent_average=round(recent_average, 2),
        trend_multiplier=round(trend_multiplier, 4),
        volatility_index=round(volatility_index, 4),
        recommended_daily_units=round(recommended_daily_units, 2),
    )
