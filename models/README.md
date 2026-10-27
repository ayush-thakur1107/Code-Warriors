# models/

Trained model artifacts are written here by `python ml/train_model.py`:

- `area_model.joblib` – the model bundle loaded by the API at startup
- `area_model_metadata.json` – human-readable training metadata and metrics

They are **git-ignored on purpose**: they are small and reproducible in a few seconds, and pickled
scikit-learn models do not reliably load across library versions. Each teammate trains locally.
If you ever need to share a large artifact, use Git LFS or a release asset, not a normal commit.
