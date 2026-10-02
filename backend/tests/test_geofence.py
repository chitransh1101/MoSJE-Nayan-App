from app.services.geofence import haversine_distance_meters, is_within_geofence

LUCKNOW_LAT, LUCKNOW_LNG = 26.8467, 80.9462


def test_same_point_has_zero_distance():
    assert haversine_distance_meters(LUCKNOW_LAT, LUCKNOW_LNG, LUCKNOW_LAT, LUCKNOW_LNG) == 0


def test_known_distance_is_approximately_correct():
    # Lucknow to Kanpur is roughly 75-80 km apart (well-known reference distance).
    kanpur_lat, kanpur_lng = 26.4499, 80.3319
    distance_km = haversine_distance_meters(LUCKNOW_LAT, LUCKNOW_LNG, kanpur_lat, kanpur_lng) / 1000
    assert 60 < distance_km < 95


def test_within_geofence_when_close():
    # ~50 meters north of the institute (roughly 0.00045 degrees latitude)
    nearby_lat = LUCKNOW_LAT + 0.00045
    assert is_within_geofence(nearby_lat, LUCKNOW_LNG, LUCKNOW_LAT, LUCKNOW_LNG, radius_meters=500) is True


def test_outside_geofence_when_far():
    far_lat = LUCKNOW_LAT + 0.05  # roughly 5.5 km away
    assert is_within_geofence(far_lat, LUCKNOW_LNG, LUCKNOW_LAT, LUCKNOW_LNG, radius_meters=500) is False


def test_boundary_is_inclusive_not_off_by_one():
    # A point placed to be just within a 100m radius should pass.
    import math
    delta_lat = (99 / 111_320)  # ~99 meters north, in degrees latitude
    assert is_within_geofence(LUCKNOW_LAT + delta_lat, LUCKNOW_LNG, LUCKNOW_LAT, LUCKNOW_LNG, radius_meters=100) is True
