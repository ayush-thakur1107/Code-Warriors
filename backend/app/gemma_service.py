"""Incident explanation service — heuristic-v1 text generator with optional Gemma/Ollama.

Strategy (in order):
  1. If Ollama is running locally (http://localhost:11434) and a Gemma model is available,
     use it to generate a natural-language summary.
  2. Otherwise fall back to a deterministic template that produces a well-structured,
     readable report from the same structured inputs.

The fallback is safe for the hackathon demo — it needs no API key, no internet and no GPU.
The Ollama path is the "future extension" described in docs/GEMMA_INTEGRATION.md.

Safety rules (both paths):
  * Vessels are always called "leads", never culprits.
  * Every response states the data is SYNTHETIC / prototype.
  * Missing AIS is flagged as a data gap, not guilt.
  * No invented distances, times or legal conclusions.
  * Disclaimer is always appended.
"""
from __future__ import annotations

import json
import textwrap
from datetime import datetime, timezone
from typing import Any

DISCLAIMER = (
    "Prototype built on SYNTHETIC data. Not an operational environmental-response tool. "
    "Outputs are investigative leads, never proof that any vessel caused a spill."
)

# Ollama defaults — override via environment variables if needed.
_OLLAMA_URL = "http://localhost:11434/api/generate"
_OLLAMA_MODEL = "gemma3"          # change to "gemma2" or any model you have pulled
_OLLAMA_TIMEOUT = 30              # seconds


# --------------------------------------------------------------------------- helpers

def _fmt_dt(dt: datetime | str | None) -> str:
    if dt is None:
        return "unknown"
    if isinstance(dt, str):
        return dt[:19].replace("T", " ") + " UTC"
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def _strength_label(s: float) -> str:
    if s >= 0.5:
        return "HIGH"
    if s >= 0.25:
        return "MEDIUM"
    return "LOW"


# --------------------------------------------------------------------------- template fallback

def _build_prompt_context(spill: dict, prediction: dict | None, ranking: dict | None) -> str:
    """Build a readable text block that Gemma (or the template) can work from."""
    lines: list[str] = []

    # --- Spill ---
    lines.append("=== SPILL INCIDENT (SYNTHETIC PROTOTYPE) ===")
    lines.append(f"  Location   : {spill.get('latitude', '?')}°N, {spill.get('longitude', '?')}°E")
    lines.append(f"  Start time : {_fmt_dt(spill.get('start_time'))}")
    lines.append("")

    # --- Prediction ---
    if prediction:
        lines.append("=== FOOTPRINT PREDICTION (SYNTHETIC MODEL) ===")
        lines.append(f"  Initial area      : {prediction.get('initial_area_km2', '?')} km²")
        lines.append(f"  Predicted area    : {prediction.get('predicted_area_km2', '?')} km²")
        lines.append(f"  Growth factor     : {prediction.get('growth_factor', '?')}×")
        warnings = prediction.get("warnings", [])
        if warnings:
            for w in warnings:
                lines.append(f"  ⚠ WARNING         : {w}")
        lines.append("")

    # --- Ranking ---
    if ranking:
        ranked = ranking.get("ranked", [])
        unassessed = ranking.get("unassessed", [])
        lines.append("=== VESSEL RANKING (INVESTIGATIVE LEADS ONLY) ===")
        if ranked:
            for v in ranked[:5]:
                score = v.get("lead_score", 0)
                lines.append(
                    f"  #{v.get('rank')} {v.get('name') or v.get('vessel_id')} "
                    f"[{v.get('vessel_type') or 'unknown type'}] "
                    f"— lead score {score:.3f} ({_strength_label(score)})"
                )
                lines.append(f"     Approach: {v.get('metrics', {}).get('approach_km', '?')} km "
                             f"from spill, "
                             f"{abs(v.get('metrics', {}).get('time_offset_hours', 0)):.1f} h "
                             f"{'before' if v.get('metrics', {}).get('time_offset_hours', 0) <= 0 else 'after'} start")
                for flag in v.get("flags", []):
                    lines.append(f"     ⚑ {flag}")
        else:
            lines.append("  No vessels could be assessed.")
        if unassessed:
            lines.append(f"  Unassessed ({len(unassessed)} vessel(s) — insufficient data):")
            for u in unassessed:
                lines.append(f"    · {u.get('name') or u.get('vessel_id')}: {u.get('reason')}")
        lines.append("")

    return "\n".join(lines)


def _template_explanation(spill: dict, prediction: dict | None, ranking: dict | None, max_vessels: int) -> str:
    """Generate a structured plain-English investigation summary without any LLM."""
    lat = spill.get("latitude", "?")
    lon = spill.get("longitude", "?")
    start = _fmt_dt(spill.get("start_time"))

    sections: list[str] = []

    # ── Header ──────────────────────────────────────────────────────────────
    sections.append(
        f"## OceanTrace Incident Summary\n"
        f"*Generated {_fmt_dt(datetime.now(timezone.utc))} — SYNTHETIC PROTOTYPE DATA*\n"
    )

    # ── Incident ────────────────────────────────────────────────────────────
    sections.append(
        f"### Incident\n"
        f"A simulated oil-spill incident has been reported at **{lat}°N, {lon}°E**, "
        f"with an estimated start time of **{start}**. "
        f"All data in this report is synthetic and for demonstration purposes only."
    )

    # ── Footprint Prediction ─────────────────────────────────────────────────
    if prediction:
        init_area = prediction.get("initial_area_km2", "?")
        pred_area = prediction.get("predicted_area_km2", "?")
        gf = prediction.get("growth_factor", "?")
        warnings = prediction.get("warnings", [])
        warn_text = ""
        if warnings:
            warn_text = (
                "\n\n> **Model warnings:** " + "; ".join(warnings) +
                " These warnings indicate the prediction may be unreliable."
            )
        sections.append(
            f"### Predicted Spill Footprint\n"
            f"The synthetic area model estimates the spill footprint will grow from an initial "
            f"**{init_area} km²** to approximately **{pred_area} km²** — a growth factor of **{gf}×**. "
            f"This figure is produced by a model trained entirely on synthetic data and should not "
            f"be interpreted as a validated oceanographic forecast."
            f"{warn_text}"
        )
    else:
        sections.append(
            "### Predicted Spill Footprint\n"
            "No footprint prediction was supplied for this incident summary."
        )

    # ── Vessel Leads ─────────────────────────────────────────────────────────
    if ranking:
        ranked = ranking.get("ranked", [])
        unassessed = ranking.get("unassessed", [])

        if ranked:
            leads_text_parts = []
            for v in ranked[:max_vessels]:
                score = v.get("lead_score", 0)
                strength = _strength_label(score)
                name = v.get("name") or v.get("vessel_id")
                vtype = v.get("vessel_type") or "unknown type"
                metrics = v.get("metrics", {})
                approach_km = metrics.get("approach_km", "?")
                time_off = metrics.get("time_offset_hours", 0)
                timing = f"{abs(time_off):.1f} h {'before' if time_off <= 0 else 'after'} the estimated spill start"
                flags = v.get("flags", [])
                flag_text = ""
                if flags:
                    flag_text = " Flags: " + "; ".join(flags)

                leads_text_parts.append(
                    f"**#{v.get('rank')} — {name}** ({vtype})  \n"
                    f"Lead score: {score:.3f} ({strength} strength). "
                    f"Closest approach was **{approach_km} km** from the incident location, "
                    f"**{timing}**. "
                    f"This vessel is an investigative lead only — not evidence of wrongdoing."
                    f"{(' ' + flag_text) if flag_text else ''}"
                )

            sections.append(
                "### Vessel Investigative Leads\n"
                "The heuristic ranking system has identified the following synthetic vessels "
                "as investigative leads based on proximity, timing, and route consistency. "
                "These are leads for further inquiry, **not accusations**.\n\n" +
                "\n\n".join(leads_text_parts)
            )

            if unassessed:
                ua_names = ", ".join(
                    u.get("name") or u.get("vessel_id") for u in unassessed
                )
                sections.append(
                    f"### Vessels With Insufficient Data\n"
                    f"The following vessel(s) could not be assessed due to missing or insufficient "
                    f"position report data: **{ua_names}**. "
                    f"Insufficient data means these vessels cannot be ranked — "
                    f"it is not evidence of wrongdoing and warrants a request for additional records."
                )
        else:
            sections.append(
                "### Vessel Investigative Leads\n"
                "No vessels could be assessed with the available data."
            )
    else:
        sections.append(
            "### Vessel Investigative Leads\n"
            "No vessel ranking data was supplied for this incident summary."
        )

    # ── Recommended Next Steps ───────────────────────────────────────────────
    sections.append(
        "### Recommended Next Steps\n"
        "1. Cross-reference vessel position reports with satellite AIS data.\n"
        "2. Request port-entry records for vessels with AIS reporting gaps.\n"
        "3. Obtain oceanographic drift data to refine the spill origin estimate.\n"
        "4. Consult maritime authorities before drawing any conclusions.\n"
        "5. Treat all outputs as investigative starting points, not findings."
    )

    # ── Disclaimer ───────────────────────────────────────────────────────────
    sections.append(f"---\n*{DISCLAIMER}*")

    return "\n\n".join(sections)


# --------------------------------------------------------------------------- Ollama/Gemma path

def _try_gemma_ollama(context: str, max_vessels: int) -> str | None:
    """Attempt to call Ollama. Returns the generated text or None on any failure."""
    try:
        import urllib.request  # stdlib only — no extra deps
        import urllib.error

        system_prompt = textwrap.dedent("""\
            You are an AI assistant helping maritime investigators understand a synthetic
            oil-spill prototype report. Follow these rules strictly:
            1. Only use the facts provided in the context below — invent nothing.
            2. Refer to vessels as "investigative leads", never as culprits.
            3. Always state the data is synthetic/prototype and not real observations.
            4. Describe AIS gaps as data gaps requiring more information, never as guilt.
            5. Do not state legal conclusions, distances or times not in the context.
            6. End every response with the disclaimer:
               "Prototype built on SYNTHETIC data. Not an operational tool. Outputs are
                investigative leads, never proof that any vessel caused a spill."
            Write a clear, structured investigation summary for a non-technical audience.
        """)

        prompt = f"{system_prompt}\n\nContext:\n{context}\n\nSummary:"
        payload = json.dumps({
            "model": _OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }).encode()

        req = urllib.request.Request(
            _OLLAMA_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_OLLAMA_TIMEOUT) as resp:
            result = json.loads(resp.read())
            text = result.get("response", "").strip()
            if not text:
                return None
            # Guarantee disclaimer is present even if the model omitted it
            if DISCLAIMER.split(".")[0].lower() not in text.lower():
                text += f"\n\n---\n*{DISCLAIMER}*"
            return text
    except Exception:  # network error, timeout, model missing, etc.
        return None


# --------------------------------------------------------------------------- public entry point

def generate_explanation(
    spill: dict[str, Any],
    prediction: dict[str, Any] | None,
    ranking: dict[str, Any] | None,
    max_vessels: int = 3,
    use_ollama: bool = True,
) -> tuple[str, str]:
    """Generate an incident explanation. Returns (explanation_text, model_used).

    Args:
        spill:       SpillIncident dict.
        prediction:  PredictAreaResponse dict, or None.
        ranking:     RankVesselsResponse dict, or None.
        max_vessels: Number of top vessels to mention.
        use_ollama:  If True, attempt Ollama before falling back to template.

    Returns:
        (explanation, model_used) where model_used is "gemma-ollama" or "template".
    """
    context = _build_prompt_context(spill, prediction, ranking)

    if use_ollama:
        gemma_text = _try_gemma_ollama(context, max_vessels)
        if gemma_text:
            return gemma_text, f"gemma-ollama ({_OLLAMA_MODEL})"

    template_text = _template_explanation(spill, prediction, ranking, max_vessels)
    return template_text, "template"
