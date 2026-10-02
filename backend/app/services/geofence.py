"""
The system only ever needs point-to-point distance (is the inspector
within N meters of the institute?) - never polygon/region queries. So a
Haversine calculation in plain Python gives the same feature as PostGIS's
ST_DWithin without the extension, the special geography column type, or
the extra deployment step. This is a deliberate simplification, not a
missing feature - see the tech-stack write-up for the full reasoning.
"""
import math

EARTH_RADIUS_METERS = 6_371_000


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c


def is_within_geofence(inspector_lat: float, inspector_lng: float, institute_lat: float, institute_lng: float, radius_meters: float) -> bool:
    return haversine_distance_meters(inspector_lat, inspector_lng, institute_lat, institute_lng) <= radius_meters
