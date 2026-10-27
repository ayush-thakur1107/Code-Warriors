# Two-person GitHub workflow

Goal: two people work at the same time without breaking each other. Suggested split:
**Person A** `feature/map-ui` (works in `frontend/`) · **Person B** `feature/ml-model` (works in `ml/`, `backend/`, `data/`).
The API contract in [API.md](API.md) is the handshake: change it only after telling each other.

## 1. One-time setup
```powershell
# Person A creates the repo on GitHub (empty), then locally:
cd path\to\oceantrace
git init -b main
git add .
git commit -m "Initial OCEANTRACE starter kit"
git remote add origin https://github.com/<user>/oceantrace.git
git push -u origin main
```
GitHub → Settings → Collaborators → invite Person B. Optional: Settings → Branches → protect `main` (require pull request).

Person B:
```powershell
git clone https://github.com/<user>/oceantrace.git
cd oceantrace
```
Then each person follows the README setup (venv, `pip install`, `python ml\train_model.py`, `npm install`).

## 2. Daily loop
```powershell
git checkout main
git pull origin main                      # start from the latest main
git checkout -b feature/map-ui            # once per feature  (Person B: feature/ml-model)
# ...edit, test locally...
git status
git add frontend/src/components/MapView.jsx   # add specific files, not blindly "."
git commit -m "Add vessel selection highlight"
git fetch origin
git rebase origin/main                    # or: git merge origin/main (use ONE style consistently)
git push -u origin feature/map-ui         # later pushes: git push
```
Commit small and often (at least hourly). A pushed commit is a backup.

## 3. Pull requests and merging safely
1. On GitHub click **Compare & pull request** for your branch → base `main`.
2. Write 2–3 lines: what changed, how you tested it.
3. The other person skims it (5 minutes), runs it if it touches the API, then **Squash and merge** (or Merge).
4. After merging, both run `git checkout main; git pull origin main` and `git rebase origin/main` (or merge) on their branch.
5. Never force-push `main`. Avoid `git push --force` on shared branches.

Before any PR: `python -m pytest` and `cd frontend; npm run build` must pass.

## 4. Avoiding conflicts
- Own your folders (above). Don't reformat files you don't own.
- Shared files (`README.md`, `backend/app/schemas.py`, `frontend/src/api.js`, `ml/features.py`): tell each other before editing; keep changes small and merge them quickly.
- Changing the API: update `schemas.py`, `api.js`, `docs/API.md` and tests **in one PR**.
- Pull `main` into your branch at least every couple of hours so differences stay small.
- If a conflict appears: open the file, keep both sides' intent, remove `<<<<<<<`/`=======`/`>>>>>>>` markers, then `git add <file>` and `git rebase --continue` (or `git commit` for a merge). Stuck? `git rebase --abort`, and ask your teammate.

## 5. What to commit, what not to
**Commit:** source code, small synthetic CSV/JSON in `data/`, docs, tests, `package.json` + `package-lock.json`, `requirements*.txt`, `.env.example`.
**Never commit:** API keys or `.env` files (a pushed secret is public forever; rotate it if it happens), `.venv/`, `node_modules/`, `frontend/dist/`, `__pycache__/`, trained `models/*.joblib`, large datasets. `.gitignore` covers these.

## 6. Large data and model artifacts
- GitHub rejects files over 100 MB and large binaries bloat history. Keep the repo to small synthetic samples.
- Models here retrain in seconds, so **don't commit them**; commit the data + script that creates them.
- For a bigger real dataset or model later: store it outside git (cloud drive, Hugging Face, release asset) and document the download step in the README, or use Git LFS (`git lfs track "*.joblib"`).

## 7. Running the same project locally
Same commands for both (README): `pip install -r backend\requirements.txt` → `python ml\train_model.py` → backend → `npm install` → `npm run dev`.
Data CSVs are committed and seeds are fixed, so both of you train an equivalent model.

## 8. Important
Pushing to GitHub does **not** deploy, build or integrate anything. Both teammates still run the app locally, and a demo needs a running backend + frontend (or a separate deployment you set up).
For the hackathon demo, agree on a code-freeze time, merge both branches into `main`, pull, run, and demo from one laptop.
