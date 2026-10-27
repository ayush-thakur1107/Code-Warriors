# OCEANTRACE model evaluation report

> **Read this first.** All data below is SYNTHETIC and comes from one invented generator (`ml/generate_data.py`). These metrics show how well the model reproduces that synthetic process. They do **not** establish accuracy on real oil spills. No real observations, satellite imagery or AIS records were used.

_Generated 2026-10-27 06:20 UTC by `ml/evaluate.py` · model trained 2026-10-27T06:20:01+00:00 · scikit-learn 1.9.1. Re-running training can change numbers slightly across library versions._

## Setup

- **Task:** regression — predict footprint area `area_km2` (km²).
- **Features (in order):** `initial_area_km2`, `wind_speed_ms`, `current_speed_ms`, `elapsed_hours`.
- **Selected model:** `GradientBoostingRegressor` (chosen by grouped CV MAE on training data — see model comparison section below).
- **Splits:** train / validation / test come from different random seeds with disjoint scenario ids, so no simulated incident appears in two splits. Rows inside one scenario are never separated.
- **Stress set:** every input deliberately outside the training range, to show extrapolation failure.
- **Negative-prediction policy:** predictions below zero are clipped to 0.0 in `ml/predict.py:predict_frame()`. This is documented and tested; it only activates in extreme out-of-range extrapolation cases.

## Model comparison (grouped 5-fold CV on training data)

| Model | CV MAE (km²) | CV RMSE (km²) | CV R² |
|---|---:|---:|---:|
| GradientBoostingRegressor ✓ winner | 1.952 | 3.456 | 0.970 |
| HistGradientBoostingRegressor | 2.028 | 3.603 | 0.967 |
| RandomForestRegressor | 2.104 | 4.015 | 0.959 |

Winner selected by lowest CV MAE on training data: **GradientBoostingRegressor**.
Final model was refit on the full training set after selection.

## Validation set  (800 rows, 80 scenarios)

| Model | MAE (km²) | RMSE (km²) | R² | Median abs. % error |
|---|---:|---:|---:|---:|
| Baseline: always predict the training mean | 14.145 | 20.257 | -0.008 | 70.9% |
| Baseline: no growth (area = initial area) | 13.221 | 20.718 | -0.054 | 69.8% |
| Baseline: linear regression | 5.539 | 8.288 | 0.831 | 28.5% |
| GradientBoostingRegressor (selected model) | 2.396 | 4.363 | 0.953 | 10.7% |
| Reference: generator's own noise-free formula | 1.554 | 2.877 | 0.980 | 7.0% |


## Test set  (800 rows, 80 scenarios)

| Model | MAE (km²) | RMSE (km²) | R² | Median abs. % error |
|---|---:|---:|---:|---:|
| Baseline: always predict the training mean | 13.831 | 19.019 | -0.000 | 83.5% |
| Baseline: no growth (area = initial area) | 11.987 | 19.468 | -0.048 | 70.9% |
| Baseline: linear regression | 5.115 | 8.242 | 0.812 | 31.7% |
| GradientBoostingRegressor (selected model) | 2.089 | 4.340 | 0.948 | 11.3% |
| Reference: generator's own noise-free formula | 1.561 | 3.153 | 0.973 | 7.6% |


## Stress (out-of-range) set  (600 rows, 60 scenarios)

| Model | MAE (km²) | RMSE (km²) | R² | Median abs. % error |
|---|---:|---:|---:|---:|
| Baseline: always predict the training mean | 9.873 | 13.078 | -0.043 | 45.3% |
| Baseline: no growth (area = initial area) | 13.447 | 15.403 | -0.447 | 72.7% |
| Baseline: linear regression | 92.371 | 94.626 | -53.599 | 556.5% |
| GradientBoostingRegressor (selected model) | 17.388 | 19.465 | -1.310 | 100.1% |
| Reference: generator's own noise-free formula | 1.777 | 2.634 | 0.958 | 7.7% |


> **Expected**: linear regression blows up dramatically on out-of-range inputs (this is intentional — it shows why bounded tree models are preferred for this task). The trained model also degrades but less severely.

## Feature importance (training-set, MDI)

| Feature | Importance |
|---|---:|
| `initial_area_km2` | 0.7609 |
| `elapsed_hours` | 0.1472 |
| `wind_speed_ms` | 0.0815 |
| `current_speed_ms` | 0.0103 |

_MDI = Mean Decrease in Impurity (relative; sums to 1.0). Reflects importance for the SYNTHETIC formula only — real-world importance will differ._

## What these numbers do and do not establish

- On the held-out **test** set the selected model's MAE is 2.09 km². The generator's own noise-free formula scores MAE 1.56 km² there; that gap is roughly the irreducible noise built into the synthetic data (a hidden per-scenario factor the inputs cannot reveal). A model cannot beat it by much.
- The model beating the *mean* and *no-growth* baselines shows it learned the synthetic relationship between inputs and area. That is the whole claim.
- **A model adds little beyond a direct calculation here.** Because we wrote the formula that creates the labels, the formula is a perfect 'model' (see the reference row). Training is included to demonstrate a complete train → save → serve → display workflow that you can later point at real labelled data.
- On the **stress** set the model's MAE is 17.39 km² (8.3× the test MAE). Tree-based models cannot extrapolate beyond the range they saw, so predictions flatten out. The API therefore returns a warning when an input is outside the training range.
- Nothing here validates the generator itself. Whether real slicks behave like the formula is untested.
- **Vessel ranking is NOT based on this model.** `backend/app/ranking.py` uses a transparent heuristic (proximity × time × route consistency). Vessel scores are investigative leads only — never proof of responsibility.

## Real-world readiness

To use this pipeline for real spill data:
1. Obtain labelled observations (see `docs/ML_AUDIT.md` for data sources).
2. Validate with `python ml/ingest.py <your_data.csv> --mapping <col_map.json>`.
3. Retrain with `python ml/train_model.py --include-real`.
4. The evaluation report will distinguish synthetic vs real provenance in metadata.
