from __future__ import annotations

from dataclasses import dataclass, replace
from math import ceil
from typing import Iterable

from demand_model import estimate_demand


@dataclass(frozen=True)
class SkuProfile:
    sku: str
    stock_on_hand: int
    unit_cost: float
    unit_margin: float
    lead_time_days: int
    daily_pattern: tuple[int, ...]


@dataclass(frozen=True)
class RestockCandidate:
    sku: str
    score: float
    coverage_days: float
    trend_multiplier: float
    volatility_index: float
    unit_cost: float
    recommended_daily_units: float
    recommended_order_units: int
    estimated_spend: float


def inventory_value(profiles: Iterable[SkuProfile]) -> float:
    total_value = 0.0
    for profile in profiles:
        total_value += profile.stock_on_hand * profile.unit_cost

    return round(total_value, 2)


def score_restock_candidate(profile: SkuProfile, horizon_weeks: int = 12) -> RestockCandidate:
    demand_estimate = estimate_demand(profile.daily_pattern, weeks=horizon_weeks)
    projected_daily_units = max(demand_estimate.recommended_daily_units, 0.5)
    coverage_days = profile.stock_on_hand / projected_daily_units
    target_coverage_days = profile.lead_time_days + 3
    recommended_order_units = max(
        ceil(projected_daily_units * target_coverage_days - profile.stock_on_hand),
        0,
    )

    margin_ratio = profile.unit_margin / max(profile.unit_cost, 1.0)
    urgency = max(target_coverage_days - coverage_days, 0.0)
    volatility_penalty = max(0.75, 1.08 - demand_estimate.volatility_index)
    score = urgency * demand_estimate.trend_multiplier * (1.0 + margin_ratio) * volatility_penalty

    return RestockCandidate(
        sku=profile.sku,
        score=round(score, 4),
        coverage_days=round(coverage_days, 2),
        trend_multiplier=demand_estimate.trend_multiplier,
        volatility_index=demand_estimate.volatility_index,
        unit_cost=profile.unit_cost,
        recommended_daily_units=projected_daily_units,
        recommended_order_units=recommended_order_units,
        estimated_spend=round(recommended_order_units * profile.unit_cost, 2),
    )


def rank_restock_candidates(
    profiles: Iterable[SkuProfile],
    horizon_weeks: int = 12,
) -> list[RestockCandidate]:
    candidates = [score_restock_candidate(profile, horizon_weeks=horizon_weeks) for profile in profiles]
    return sorted(
        candidates,
        key=lambda candidate: (candidate.score, candidate.recommended_daily_units),
        reverse=True,
    )


def build_restock_plan(
    profiles: Iterable[SkuProfile],
    budget: float,
    horizon_weeks: int = 12,
) -> list[RestockCandidate]:
    profile_list = list(profiles)
    if not profile_list:
        return []

    ranked_candidates = rank_restock_candidates(profile_list, horizon_weeks=horizon_weeks)
    remaining_budget = budget
    plan: list[RestockCandidate] = []
    cheapest_unit_cost = min(profile.unit_cost for profile in profile_list)

    for candidate in ranked_candidates:
        affordable_units = min(
            candidate.recommended_order_units,
            int(remaining_budget // candidate.unit_cost),
        )
        if affordable_units <= 0:
            continue

        planned_spend = round(affordable_units * candidate.unit_cost, 2)
        plan.append(
            replace(
                candidate,
                recommended_order_units=affordable_units,
                estimated_spend=planned_spend,
            )
        )
        remaining_budget = round(remaining_budget - planned_spend, 2)

        if remaining_budget < cheapest_unit_cost:
            break

    return plan
