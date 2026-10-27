"""Holds the trained model in memory. Loaded once at startup, never retrained per request.

If the model file is missing at startup the API still runs (health + ranking work); the
next prediction request retries loading, so after running `python ml/train_model.py` you do
not need to restart the server.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:  # make the sibling `ml` package importable
    sys.path.insert(0, str(ROOT))

from ml import config  # noqa: E402
ml_config = config  # re-exported for main.py
from ml.predict import AreaPredictor, ModelContractError, ModelNotAvailableError  # noqa: E402


class ModelUnavailable(Exception):
    """Raised when a prediction is requested but no valid model is loaded."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class ModelService:
    def __init__(self) -> None:
        self.predictor: AreaPredictor | None = None
        self.error: str | None = None

    @property
    def path(self) -> Path:
        override = os.environ.get("OCEANTRACE_MODEL_PATH")
        return Path(override) if override else config.DEFAULT_MODEL_PATH

    @property
    def display_path(self) -> str:
        try:
            return self.path.resolve().relative_to(config.ROOT).as_posix()
        except ValueError:
            return self.path.name

    def load(self) -> None:
        try:
            self.predictor = AreaPredictor.load(self.path)
            self.error = None
        except (ModelNotAvailableError, ModelContractError) as exc:
            self.predictor = None
            self.error = str(exc)

    def ensure_loaded(self) -> None:
        """Cheap retry: only touches disk if nothing is loaded yet."""
        if self.predictor is None:
            self.load()

    def require(self) -> AreaPredictor:
        self.ensure_loaded()
        if self.predictor is None:
            raise ModelUnavailable(self.error or "Model not loaded.")
        return self.predictor


model_service = ModelService()
