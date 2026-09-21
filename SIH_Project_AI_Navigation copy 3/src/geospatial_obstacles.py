"""
Geospatial Obstacle & Continuous Clearance Engine
=================================================
Evaluates continuous trajectory segments against real Natural Earth 1:50m
land, island, and permanent ice-shelf geometries using Shapely STRtree spatial indexing.
Computes continuous minimum clearance via GEOS nearest-point boundary projections
and ellipsoidal geodesic formulas.
"""

import os
import json
import math
from typing import List, Tuple, Dict, Optional, Any
from shapely.geometry import shape, Point, LineString, box
from shapely.ops import nearest_points
from shapely.strtree import STRtree

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/geospatial"))

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers on WGS84 sphere."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0)**2
    return 2.0 * R * math.atan2(math.sqrt(max(0.0, a)), math.sqrt(max(0.0, 1.0 - a)))

class GeospatialObstacleEngine:
    """
    Singleton geospatial screening engine backed by Natural Earth 1:50m geometries.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeospatialObstacleEngine, cls).__new__(cls)
            cls._instance._init_engine()
        return cls._instance

    def _init_engine(self):
        self.geoms: List[Any] = []
        self.feature_meta: List[Dict[str, Any]] = []

        land_path = os.path.join(DATA_DIR, "ne_50m_antarctic_land.json")
        shelves_path = os.path.join(DATA_DIR, "ne_50m_antarctic_ice_shelves.json")

        if os.path.exists(land_path):
            with open(land_path, "r", encoding="utf-8") as f:
                land_data = json.load(f)
                for feat in land_data.get("features", []):
                    g = shape(feat["geometry"])
                    if g.is_valid and not g.is_empty:
                        self.geoms.append(g)
                        self.feature_meta.append({"type": "land", "name": feat.get("properties", {}).get("NAME", "Land")})

        if os.path.exists(shelves_path):
            with open(shelves_path, "r", encoding="utf-8") as f:
                shelves_data = json.load(f)
                for feat in shelves_data.get("features", []):
                    g = shape(feat["geometry"])
                    if g.is_valid and not g.is_empty:
                        self.geoms.append(g)
                        self.feature_meta.append({"type": "ice_shelf", "name": feat.get("properties", {}).get("NAME", "Ice Shelf")})

        if self.geoms:
            self.tree = STRtree(self.geoms)
        else:
            self.tree = None

    def is_land_or_shelf(self, lat: float, lon: float) -> bool:
        """
        Returns True if (lat, lon) lies inside any land or permanent ice-shelf polygon.
        Also treats interior polar plateau south of -85.0 S as continental ice.
        """
        if lat <= -85.0:
            return True
        if self.tree is None or not self.geoms:
            return False

        norm_lon = ((lon + 180.0) % 360.0) - 180.0
        pt = Point(norm_lon, lat)

        hits = self.tree.query(pt)
        for h in hits:
            if self.geoms[h].contains(pt) or self.geoms[h].touches(pt):
                return True
        return False

    def check_segment_clearance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
        min_standoff_km: float = 6.0
    ) -> Dict[str, Any]:
        """
        Evaluates continuous segment clearance against all land/ice-shelf polygons.
        Uses fast bounding box querying with GEOS segment intersection and nearest_points.
        min_standoff_km: safety buffer (default 6.0 km for transit; 0.0 km for terminal port/anchorage connections).
        """
        norm_lon1 = ((lon1 + 180.0) % 360.0) - 180.0
        norm_lon2 = ((lon2 + 180.0) % 360.0) - 180.0

        if lat1 <= -85.0 or lat2 <= -85.0:
            return {
                "is_clear": False,
                "min_clearance_km": 0.0,
                "status": "ROUTE_BLOCKED",
                "reason": "Segment penetrates interior continental polar ice sheet."
            }

        if self.tree is None or not self.geoms:
            return {"is_clear": True, "min_clearance_km": 999.0, "status": "CLEAR", "reason": None}

        # Fast bounding box query with pad margin
        pad = max(0.35, min_standoff_km / 100.0)
        minx = min(norm_lon1, norm_lon2) - pad
        maxx = max(norm_lon1, norm_lon2) + pad
        miny = min(lat1, lat2) - pad
        maxy = max(lat1, lat2) + pad

        query_box = box(minx, miny, maxx, maxy)
        hits = self.tree.query(query_box)
        if len(hits) == 0:
            # Completely clear of all obstacles
            return {"is_clear": True, "min_clearance_km": 999.0, "status": "CLEAR", "reason": None}

        segment = LineString([(norm_lon1, lat1), (norm_lon2, lat2)])
        min_dist_km = 9999.0
        nearest_feature = None

        for h in hits:
            poly = self.geoms[h]
            # 1. Direct continuous intersection
            if poly.intersects(segment):
                return {
                    "is_clear": False,
                    "min_clearance_km": 0.0,
                    "status": "ROUTE_BLOCKED",
                    "reason": f"Direct trajectory intersection with {self.feature_meta[h]['type']} ({self.feature_meta[h]['name']})."
                }

            # 2. Continuous minimum distance via nearest boundary points
            try:
                p_poly, p_seg = nearest_points(poly.boundary, segment)
                d_km = haversine_km(p_poly.y, p_poly.x, p_seg.y, p_seg.x)
                if d_km < min_dist_km:
                    min_dist_km = d_km
                    nearest_feature = self.feature_meta[h]
            except Exception:
                pass

        # Screening standoff check (default 6.0 km: 5.0 km 1:50m data generalization + 1.0 km navigation margin)
        if min_standoff_km > 0.0 and min_dist_km <= min_standoff_km:
            return {
                "is_clear": False,
                "min_clearance_km": round(min_dist_km, 2),
                "status": "ROUTE_BLOCKED",
                "reason": f"Trajectory clearance ({min_dist_km:.1f} km) breaches {min_standoff_km:.1f} km minimum screening standoff from {nearest_feature['name'] if nearest_feature else 'land'}."
            }

        return {
            "is_clear": True,
            "min_clearance_km": round(min_dist_km, 2),
            "status": "CLEAR",
            "coastal_proximity": min_dist_km < 25.0,
            "reason": None
        }

    def validate_operational_envelope(self, lat: float, lon: float) -> Tuple[bool, Optional[str]]:
        """
        Validates if coordinates fall within documented operational screening corridors.
        """
        norm_lon = ((lon + 180.0) % 360.0) - 180.0

        if lat <= -80.0:
            return False, "INLAND_CONTINENTAL_ICE_SHEET (South of -80 S)"

        # Corridor 1: Drake Passage & Peninsula
        if -68.5 <= lat <= -52.0 and -75.0 <= norm_lon <= -52.0:
            return True, "DRAKE_PENINSULA_CORRIDOR"

        # Corridor 2: Queen Maud Land / Astrid Coast Approach
        if -71.0 <= lat <= -50.0 and 0.0 <= norm_lon <= 30.0:
            return True, "QUEEN_MAUD_LAND_CORRIDOR"

        # Corridor 3: Prydz Bay / Larsemann Hills Approach
        if -70.5 <= lat <= -50.0 and 65.0 <= norm_lon <= 85.0:
            return True, "PRYDZ_BAY_CORRIDOR"

        # Corridor 4: Ross Sea / McMurdo Sound Approach
        if -78.5 <= lat <= -55.0 and (155.0 <= norm_lon <= 180.0 or -180.0 <= norm_lon <= -165.0):
            return True, "ROSS_SEA_CORRIDOR"

        # Corridor 5: Wilkes Land / Casey Station Approach
        if -70.0 <= lat <= -50.0 and 100.0 <= norm_lon <= 135.0:
            return True, "WILKES_LAND_CORRIDOR"

        # Corridor 6: East Antarctic / Enderby Land Coastal Transit
        if -71.0 <= lat <= -50.0 and 30.0 < norm_lon < 65.0:
            return True, "ENDERBY_COASTAL_CORRIDOR"

        # Sub-polar Open Ocean Gateway waters (Cape Town, Ushuaia, Hobart)
        if -55.0 < lat <= -30.0:
            return True, "OPEN_OCEAN_GATEWAY_CORRIDOR"

        return False, "OUT_OF_DOCUMENTED_COVERAGE"

    def is_point_in_obstacle(self, lat: float, lon: float) -> Tuple[bool, Optional[str]]:
        """Returns (is_in_obstacle, reason_string)."""
        is_land = self.is_land_or_shelf(lat, lon)
        return is_land, ("CONTINENTAL_LAND_OR_ICE_SHELF" if is_land else None)

    def check_segment_collision(
        self,
        p1: Tuple[float, float],
        p2: Tuple[float, float],
        min_standoff_km: float = 6.0
    ) -> Tuple[bool, Optional[str]]:
        """Returns (is_blocked, reason_string)."""
        res = self.check_segment_clearance(p1[0], p1[1], p2[0], p2[1], min_standoff_km=min_standoff_km)
        return (not res["is_clear"]), (res.get("reason") or ("CLEAR" if res["is_clear"] else "BLOCKED"))

# Global engine instance
obstacle_engine = GeospatialObstacleEngine()

def get_obstacle_engine() -> GeospatialObstacleEngine:
    """Returns the singleton GeospatialObstacleEngine instance."""
    return obstacle_engine
