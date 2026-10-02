"""
Pattern-based anomaly detection.

Why Isolation Forest and not a labeled classifier: there is no dataset of
"confirmed institute fraud" to train on - this is exactly the situation
Isolation Forest is built for. It needs no labels; it just learns what
"normal" looks like for each institute from its own history and flags
days that don't fit. That's also why it's explainable to a judge in one
sentence, unlike a black-box deep model - using something heavier here
would be complexity for its own sake, not a genuine improvement.

Each institute gets its OWN model, fit on its own history, because
"normal" for an urban skill center and a remote shelter are different
baselines - a shared global model would just learn "urban vs rural"
instead of "staged vs genuine".
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES = ["attendance_count", "cctv_uptime_pct", "vc_pickup_rate", "inspection_freq"]


def train_model(history_df: pd.DataFrame, contamination: float = 0.1, random_state: int = 42) -> IsolationForest:
    if len(history_df) < 5:
        raise ValueError("Need at least 5 historical days to fit a meaningful model")
    model = IsolationForest(contamination=contamination, random_state=random_state)
    model.fit(history_df[FEATURES])
    return model


def score_day(model: IsolationForest, day_features: dict) -> dict:
    """
    Returns a dict with the raw anomaly score (negative = more anomalous)
    and a boolean flag using the model's own decision boundary - this is
    what gets written to the `alerts` table, never a hardcoded threshold.
    """
    # Built as a DataFrame with the same column names the model was fit on -
    # a bare ndarray triggers a sklearn UserWarning and silently discards
    # the feature-name validation that catches column-order mistakes.
    row = pd.DataFrame([[day_features[f] for f in FEATURES]], columns=FEATURES)
    raw_score = float(model.decision_function(row)[0])
    is_anomaly = bool(model.predict(row)[0] == -1)
    return {"anomaly_score": raw_score, "is_anomaly": is_anomaly}


def generate_synthetic_history(days: int = 60, seed: int = 7, inject_anomaly_on_last_n: int = 5) -> pd.DataFrame:
    """
    Builds a realistic-looking daily time series for ONE institute, then
    deliberately corrupts the last few days to look "prepared for
    inspection" (attendance spike + CCTV uptime spike + no VC pickups) -
    this is what lets the demo prove the model reacts to real computed
    data instead of a hardcoded flag.
    """
    rng = np.random.default_rng(seed)
    normal_attendance = rng.normal(loc=22, scale=3, size=days).clip(5, 40)
    normal_cctv = rng.normal(loc=75, scale=8, size=days).clip(20, 100)
    normal_vc_pickup = rng.normal(loc=0.6, scale=0.15, size=days).clip(0, 1)
    normal_freq = rng.poisson(lam=0.3, size=days)

    df = pd.DataFrame({
        "attendance_count": normal_attendance,
        "cctv_uptime_pct": normal_cctv,
        "vc_pickup_rate": normal_vc_pickup,
        "inspection_freq": normal_freq,
    })

    if inject_anomaly_on_last_n > 0:
        tail = df.index[-inject_anomaly_on_last_n:]
        df.loc[tail, "attendance_count"] = 39  # near-perfect attendance, out of character
        df.loc[tail, "cctv_uptime_pct"] = 99   # suspiciously perfect uptime
        df.loc[tail, "vc_pickup_rate"] = 0.1   # beneficiaries suddenly not answering

    return df
