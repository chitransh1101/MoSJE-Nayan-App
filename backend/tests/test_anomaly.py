from app.services.anomaly import generate_synthetic_history, score_day, train_model


def test_synthetic_history_has_expected_shape():
    df = generate_synthetic_history(days=60, inject_anomaly_on_last_n=5)
    assert len(df) == 60
    assert set(df.columns) == {"attendance_count", "cctv_uptime_pct", "vc_pickup_rate", "inspection_freq"}


def test_model_flags_injected_anomaly():
    """
    The core claim behind USP4: the model must flag the injected
    'prepared for inspection' day as anomalous when trained ONLY on the
    clean history that precedes it - proving the flag comes from a real
    computed deviation, not a hardcoded rule.
    """
    df = generate_synthetic_history(days=60, seed=7, inject_anomaly_on_last_n=5)
    clean_history = df.iloc[:-5]
    model = train_model(clean_history)

    anomalous_day = df.iloc[-1].to_dict()
    result = score_day(model, anomalous_day)
    assert result["is_anomaly"] is True
    assert result["anomaly_score"] < 0  # sklearn convention: negative = anomalous


def test_model_does_not_flag_normal_day():
    df = generate_synthetic_history(days=60, seed=7, inject_anomaly_on_last_n=0)
    model = train_model(df)

    # A day drawn from the SAME distribution the model was trained on
    # should not be flagged - otherwise the model is just flagging
    # everything, which would be worthless for a real dashboard.
    normal_day = df.iloc[10].to_dict()
    result = score_day(model, normal_day)
    assert result["is_anomaly"] is False


def test_train_model_requires_minimum_history():
    import pandas as pd
    import pytest

    tiny_df = generate_synthetic_history(days=3, inject_anomaly_on_last_n=0)
    with pytest.raises(ValueError):
        train_model(tiny_df)
