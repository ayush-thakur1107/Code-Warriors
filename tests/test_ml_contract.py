"""Training and inference agree on feature names/order, and the model beats the baselines."""
import numpy as np
import pandas as pd
import pytest

from ml import config
from ml.evaluate import compute_metrics
from ml.features import FEATURE_COLUMNS, TARGET_COLUMN
from ml.predict import AreaPredictor, ModelContractError, ModelNotAvailableError


def test_feature_order_saved_in_artifact_matches_code(trained_model_path):
    import joblib
    bundle = joblib.load(trained_model_path)
    assert bundle["feature_columns"] == list(FEATURE_COLUMNS)
    assert list(bundle["model"].feature_names_in_) == list(FEATURE_COLUMNS)


def test_predict_matches_batch_prediction(trained_model_path):
    p = AreaPredictor.load(trained_model_path)
    row = {"initial_area_km2": 4.0, "wind_speed_ms": 8.0, "current_speed_ms": 0.6, "elapsed_hours": 24.0}
    single = p.predict(**row)["predicted_area_km2"]
    batch = p.predict_frame(pd.DataFrame([row]))[0]
    assert single == pytest.approx(batch)
    assert 4.0 < single < 60.0


def test_model_beats_trivial_baselines_on_test(trained_model_path):
    p = AreaPredictor.load(trained_model_path)
    test = pd.read_csv(config.TEST_CSV)
    y = test[TARGET_COLUMN].to_numpy()
    model_mae = compute_metrics(y, np.array(p.predict_frame(test)))["MAE_km2"]
    mean_mae = compute_metrics(y, np.full(len(y), pd.read_csv(config.TRAIN_CSV)[TARGET_COLUMN].mean()))["MAE_km2"]
    no_growth_mae = compute_metrics(y, test["initial_area_km2"].to_numpy())["MAE_km2"]
    assert model_mae < 0.5 * mean_mae
    assert model_mae < 0.5 * no_growth_mae


def test_out_of_range_inputs_warn(trained_model_path):
    p = AreaPredictor.load(trained_model_path)
    ok = p.predict(4, 20, 1.5, 72)  # exact edges of the training range
    assert ok["warnings"] == []
    far = p.predict(4, 35, 1.5, 72)
    assert any("wind_speed_ms" in w for w in far["warnings"])


def test_missing_model_gives_helpful_error(tmp_path):
    with pytest.raises(ModelNotAvailableError, match="train_model.py"):
        AreaPredictor.load(tmp_path / "nope.joblib")


def test_wrong_feature_order_is_rejected(trained_model_path, tmp_path):
    import joblib
    bundle = joblib.load(trained_model_path)
    bundle["feature_columns"] = list(reversed(bundle["feature_columns"]))
    bad = tmp_path / "bad.joblib"
    joblib.dump(bundle, bad)
    with pytest.raises(ModelContractError):
        AreaPredictor.load(bad)
