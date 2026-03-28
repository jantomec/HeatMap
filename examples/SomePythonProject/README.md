# SomePythonProject

Small sample project for trying the HeatMap extension.

## Setup

```bash
python3 -m pip install -r requirements-dev.txt
pytest
```

## Suggested tests to profile

- `test_rank_restock_candidates_surfaces_busy_low_coverage_items`
- `test_build_restock_plan_respects_budget_and_keeps_multiple_items`
- `test_estimate_demand_highlights_bursty_patterns`

Open `restock_planner.py` or `demand_model.py`, run `HeatMap: Profile Test`, then pick one of the tests above.
