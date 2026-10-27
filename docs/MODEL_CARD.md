# Model card: spill-area regressor (synthetic demo)

| | |
|---|---|
| **Model** | scikit-learn `GradientBoostingRegressor` (400 trees, depth 4, learning rate 0.05, subsample 0.8, seed 42) |
| **Task** | Regression: predict footprint area (km²) at a given elapsed time |
| **Code** | `ml/train_model.py`, `ml/predict.py`, `ml/evaluate.py` |
| **Artifact** | `models/area_model.joblib` (created locally, not committed) |

## Intended use
Demonstrate a complete train → save → serve → display workflow in a hackathon prototype, and provide a placeholder
that real labelled data could later replace. **Not** for forecasting real spills or for any operational, legal or response decision.

## Inputs (order is fixed in `ml/features.py`)
1. `initial_area_km2` (km²) · 2. `wind_speed_ms` (m/s) · 3. `current_speed_ms` (m/s) · 4. `elapsed_hours` (h)

## Target
`area_km2`: synthetic footprint area at `elapsed_hours`.

## Data provenance
Trained on `data/raw/synthetic_train.csv`: 3000 rows from 300 simulated scenarios produced by an **invented formula** with noise
([DATA.md](DATA.md)). No real observations. Validation, test and stress sets are separate files with disjoint scenarios.

## Evaluation
See [model_evaluation.md](model_evaluation.md) (MAE, RMSE, R², median % error vs. mean, no-growth and linear baselines, plus the generator's own formula as a reference).
Because train and test come from the **same generator**, the scores measure fit to that synthetic process only. They do **not** establish real-world oil-spill prediction accuracy.

## Limitations
- Learns an invented relationship; says nothing about real slick behaviour.
- A direct formula reproduces the labels as well as or better than the model; training adds no real-world value yet.
- Tree ensembles cannot extrapolate: outside the training ranges predictions flatten (the stress set shows large errors). The API warns on out-of-range inputs.
- No direction, oil type, weathering, temperature, sea state, coastline or uncertainty estimate.
- Deterministic point prediction; no confidence interval.

## Ethical / safety notes
Outputs are labelled synthetic throughout the UI and API. Do not present them as scientific results or use them to attribute blame to any vessel or operator.
