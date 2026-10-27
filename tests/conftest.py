"""Shared fixtures. A throwaway model is trained into a temp dir so tests never touch models/."""
from __future__ import annotations

import pytest

from ml import config
from ml.train_model import train


@pytest.fixture(scope="session")
def trained_model_path(tmp_path_factory):
    d = tmp_path_factory.mktemp("model")
    model_path = d / "area_model.joblib"
    train(
        train_csv=config.TRAIN_CSV,
        val_csv=config.VAL_CSV,
        model_path=model_path,
        metadata_path=d / "meta.json",
    )
    return model_path
