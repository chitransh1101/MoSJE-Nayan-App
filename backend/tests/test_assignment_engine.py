from app.services.assignment_engine import (
    Inspector,
    Institute,
    build_weighted_pool,
    recently_paired,
    select_assignment,
)


def test_weighted_pool_favors_overdue_institutes():
    institutes = [
        Institute(id="fresh", days_since_last_inspection=1),
        Institute(id="overdue", days_since_last_inspection=20),
    ]
    pool = build_weighted_pool(institutes)
    overdue_count = sum(1 for i in pool if i.id == "overdue")
    fresh_count = sum(1 for i in pool if i.id == "fresh")
    assert overdue_count > fresh_count


def test_select_assignment_returns_valid_pair():
    institutes = [Institute(id="inst-1", days_since_last_inspection=5)]
    inspectors = [Inspector(id="insp-1")]
    result = select_assignment(institutes, inspectors, history={})
    assert result.institute_id == "inst-1"
    assert result.inspector_id == "insp-1"
    assert len(result.random_seed_ref) == 32  # secrets.token_hex(16) -> 32 hex chars


def test_fairness_constraint_excludes_recently_paired_inspector():
    institutes = [Institute(id="inst-1", days_since_last_inspection=5)]
    # insp-1 was paired with inst-1 recently; insp-2 was not.
    inspectors = [Inspector(id="insp-1"), Inspector(id="insp-2")]
    history = {"insp-1": ["inst-1"]}

    # Run many draws - insp-1 must NEVER be selected for inst-1 while the
    # fairness window still covers that pairing.
    for _ in range(50):
        result = select_assignment(institutes, inspectors, history, fairness_window=5)
        assert result.inspector_id == "insp-2"


def test_fairness_constraint_falls_back_when_pool_exhausted():
    """If EVERY inspector was recently paired with the institute (tiny team),
    the engine must still produce an assignment rather than failing the cycle."""
    institutes = [Institute(id="inst-1", days_since_last_inspection=5)]
    inspectors = [Inspector(id="insp-1")]
    history = {"insp-1": ["inst-1"]}
    result = select_assignment(institutes, inspectors, history, fairness_window=5)
    assert result.inspector_id == "insp-1"  # only option, fallback kicks in


def test_recently_paired_respects_window_boundary():
    history = {"insp-1": ["a", "b", "c", "d", "e"]}
    assert recently_paired("insp-1", "a", history, window=5) is True
    assert recently_paired("insp-1", "a", history, window=2) is False  # outside the window now


def test_select_assignment_raises_on_empty_pools():
    import pytest

    with pytest.raises(ValueError):
        select_assignment([], [Inspector(id="x")], history={})
    with pytest.raises(ValueError):
        select_assignment([Institute(id="x", days_since_last_inspection=1)], [], history={})


def test_dispatch_time_is_within_working_window():
    institutes = [Institute(id="inst-1", days_since_last_inspection=5)]
    inspectors = [Inspector(id="insp-1")]
    for _ in range(20):
        result = select_assignment(institutes, inspectors, history={})
        assert result.dispatch_time.hour >= 9
        assert result.dispatch_time.hour < 17
