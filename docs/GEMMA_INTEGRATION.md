# Future extension: Gemma 4 incident explanations (not implemented)

The core prototype needs **no LLM and no API key**. If time permits, add an explanation layer like this:

1. **Server-side only.** Add `POST /explain-incident` to the FastAPI backend. Any key or model path lives in an environment variable read by the backend; never in `frontend/` (anything `VITE_*` is public).
2. **Input** = structured facts already produced by the app: the spill inputs, the `/predict-area` result (with its synthetic-model label and warnings), and the `/rank-vessels` output including `flags` and `unassessed`.
3. **Prompt rules:** instruct the model to (a) only use the supplied JSON, (b) call vessels *leads*, never culprits, (c) state that data is synthetic/prototype, (d) mention missing AIS as a data gap, not guilt, (e) not invent distances, times or legal conclusions.
4. **Run Gemma** either locally (for example via Ollama or Hugging Face `transformers`) or through a hosted endpoint; keep it behind the same endpoint so the frontend only calls `/explain-incident`.
5. **Frontend:** add a button + panel that shows the returned text with a visible "AI-generated, check against the data" label.
6. **Safeguards:** timeouts, a plain fallback template if the model is unavailable, and tests that the disclaimer is always present.
