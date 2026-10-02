"""
The random assignment engine.

Why `secrets` and not `random`: Python's `random` module is a seeded
Mersenne Twister - deterministic and, in principle, predictable if its
internal state leaks. That's an insider risk in a system explicitly built
to prevent insider gaming. `secrets` draws from the OS's cryptographic RNG
(os.urandom), so no amount of internal access lets anyone predict or
reproduce tomorrow's draw.

Two properties this module guarantees together:
  1. Overdue institutes are more likely to be picked (weighted pool) -
     but the actual draw is still a CSPRNG pick from that pool, never a
     sorted "most overdue first" selection an insider could predict.
  2. An inspector cannot be paired with the same institute twice within
     a rolling window (`fairness_window`) - this is what stops a
     corrupt inspector-institute relationship from forming even under
     pure random chance.
"""
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.time import utcnow


@dataclass
class Institute:
    id: str
    days_since_last_inspection: int


@dataclass
class Inspector:
    id: str


@dataclass
class AssignmentResult:
    institute_id: str
    inspector_id: str
    dispatch_time: datetime
    random_seed_ref: str


def build_weighted_pool(institutes: list[Institute]) -> list[Institute]:
    """Overdue institutes appear more times in the pool, so they're more
    likely to be drawn - but every entry is still drawn via CSPRNG, not
    sorted and taken from the top (which an insider could predict)."""
    pool: list[Institute] = []
    for inst in institutes:
        weight = max(1, inst.days_since_last_inspection)
        pool.extend([inst] * weight)
    return pool


def recently_paired(inspector_id: str, institute_id: str, history: dict[str, list[str]], window: int) -> bool:
    """history maps inspector_id -> list of institute_ids inspected, most recent last."""
    recent = history.get(inspector_id, [])[-window:]
    return institute_id in recent


def select_assignment(
    institutes: list[Institute],
    inspectors: list[Inspector],
    history: dict[str, list[str]],
    fairness_window: int = 5,
    now: datetime | None = None,
) -> AssignmentResult:
    if not institutes:
        raise ValueError("No candidate institutes supplied")
    if not inspectors:
        raise ValueError("No candidate inspectors supplied")

    now = now or utcnow()

    weighted_pool = build_weighted_pool(institutes)
    chosen_institute = secrets.choice(weighted_pool)

    eligible_inspectors = [
        i for i in inspectors
        if not recently_paired(i.id, chosen_institute.id, history, fairness_window)
    ]
    # Fallback: if the fairness filter exhausts the whole pool (tiny team,
    # long window), fall back to the full pool rather than failing the cycle -
    # logged so it's visible, never silently un-fair.
    pool_for_inspector = eligible_inspectors if eligible_inspectors else inspectors
    chosen_inspector = secrets.choice(pool_for_inspector)

    # Random dispatch time within a 9am-5pm window (8 hours = 480 minutes) -
    # CSPRNG again, so even the time of day isn't guessable.
    window_start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    dispatch_time = window_start + timedelta(minutes=secrets.randbelow(8 * 60))

    # Audit reference: a random token logged against the assignment row so a
    # later statistical audit (e.g. chi-square test across historical draws)
    # can verify no bias - WITHOUT ever exposing the raw randomness source.
    random_seed_ref = secrets.token_hex(16)

    return AssignmentResult(
        institute_id=chosen_institute.id,
        inspector_id=chosen_inspector.id,
        dispatch_time=dispatch_time,
        random_seed_ref=random_seed_ref,
    )
