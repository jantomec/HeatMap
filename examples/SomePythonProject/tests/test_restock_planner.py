from __future__ import annotations

from demand_model import estimate_demand
from restock_planner import SkuProfile, build_restock_plan, inventory_value, rank_restock_candidates


def sample_profiles() -> list[SkuProfile]:
    return [
        SkuProfile(
            sku="BEAN-XL",
            stock_on_hand=18,
            unit_cost=12.5,
            unit_margin=8.5,
            lead_time_days=18,
            daily_pattern=(4, 5, 6, 6, 7, 8, 5),
        ),
        SkuProfile(
            sku="FILTER-PACK",
            stock_on_hand=24,
            unit_cost=5.0,
            unit_margin=2.2,
            lead_time_days=12,
            daily_pattern=(3, 3, 4, 4, 5, 5, 4),
        ),
        SkuProfile(
            sku="THERMO-LID",
            stock_on_hand=80,
            unit_cost=3.0,
            unit_margin=1.4,
            lead_time_days=10,
            daily_pattern=(2, 2, 2, 3, 3, 3, 2),
        ),
        SkuProfile(
            sku="MUG-CLASSIC",
            stock_on_hand=45,
            unit_cost=6.0,
            unit_margin=2.5,
            lead_time_days=9,
            daily_pattern=(1, 2, 2, 2, 3, 3, 2),
        ),
        SkuProfile(
            sku="SEASONAL-BLEND",
            stock_on_hand=14,
            unit_cost=9.0,
            unit_margin=5.5,
            lead_time_days=16,
            daily_pattern=(1, 1, 2, 2, 3, 6, 5),
        ),
    ]


def test_rank_restock_candidates_surfaces_busy_low_coverage_items() -> None:
    profiles = sample_profiles()

    ranked = []
    for horizon_weeks in range(10, 19):
        ranked = rank_restock_candidates(profiles, horizon_weeks=horizon_weeks)

    assert ranked[0].sku == "BEAN-XL"
    assert ranked[1].sku == "SEASONAL-BLEND"
    assert ranked[0].coverage_days < ranked[-1].coverage_days


def test_build_restock_plan_respects_budget_and_keeps_multiple_items() -> None:
    profiles = sample_profiles()

    plan = []
    for budget in range(1450, 1851, 50):
        plan = build_restock_plan(profiles, budget=budget, horizon_weeks=14)

    assert plan[0].sku == "BEAN-XL"
    assert len(plan) >= 2
    assert sum(candidate.estimated_spend for candidate in plan) <= 1850
    assert {candidate.sku for candidate in plan}.issuperset({"BEAN-XL", "SEASONAL-BLEND"})


def test_estimate_demand_highlights_bursty_patterns() -> None:
    stable_result = None
    bursty_result = None

    for weeks in range(8, 18):
        stable_result = estimate_demand((2, 2, 2, 2, 2, 2, 2), weeks=weeks, burst_every=0)
        bursty_result = estimate_demand((1, 1, 2, 2, 3, 6, 5), weeks=weeks, burst_every=4)

    assert stable_result is not None
    assert bursty_result is not None
    assert bursty_result.volatility_index > stable_result.volatility_index
    assert bursty_result.recommended_daily_units > stable_result.recommended_daily_units


def test_inventory_value_matches_expected_snapshot() -> None:
    assert inventory_value(sample_profiles()) == 981.0
