"""
Safety-Critical Verification Suite: Antarctic Routing & Obstacle Clearance
==========================================================================
Verifies that:
1. Trans-peninsula routes either detour safely around Graham Land or reject with ROUTE_BLOCKED (zero land intersections).
2. Deep inland polar plateau targets (< -80°S) are strictly rejected.
3. Maitri Base (inland rock) is rejected without operator opt-in; Princess Astrid staging requires explicit opt-in.
4. Continuous line-segment collision checking catches promontories where both endpoints are in open water.
5. Post-smoothing collision rollback (Gate 5) prevents shortcuts across land.
6. Dynamic hazard envelope detection properly computes CPA and clearance.
7. API enforces truthful labeling and unverified bathymetry contract.
"""

import sys
import os
import unittest
from shapely.geometry import LineString, Point
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.backend.main import app, load_application_state
from src.geospatial_obstacles import get_obstacle_engine
from src.route_optimizer import AntarcticRouteOptimizer


class TestRoutingSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load_application_state()
        cls.client = TestClient(app)
        cls.engine = get_obstacle_engine()
        cls.optimizer = AntarcticRouteOptimizer(cls.engine)

    def test_01_trans_peninsula_barrier_rejection_or_safe_detour(self):
        start = (-64.774, -64.053) # Palmer
        goal = (-64.500, -56.000)  # Weddell Sea east of peninsula

        route = self.optimizer.optimize_route(
            start[0], start[1], goal[0], goal[1],
            start_name="Palmer Station", goal_name="Weddell Sea East",
            operator_opt_in=True
        )

        if route["route_found"]:
            self.assertEqual(route["status"], "SCREENED_COARSE_REGIONAL_CONSTRAINTS")
            wps = [(w["lat"], w["lon"]) for w in route["waypoints"]]
            self.assertGreater(len(wps), 2)
            for i in range(len(wps) - 1):
                p1 = wps[i]
                p2 = wps[i + 1]
                blocked, reason = self.engine.check_segment_collision(p1, p2, min_standoff_km=0.0)
                self.assertFalse(
                    blocked,
                    f"Segment {i} -> {i+1} ({p1} to {p2}) intersects obstacle: {reason}"
                )
        else:
            self.assertIn(route["status"], ["ROUTE_BLOCKED", "SAFETY_UNVERIFIED_DATA_INSUFFICIENT"])
            self.assertIn("obstacle", route["message"].lower())

    def test_02_polar_plateau_inland_rejection(self):
        start = (-54.807, -68.304) # Ushuaia
        goal = (-85.000, 0.000)    # Deep interior polar plateau

        route = self.optimizer.optimize_route(
            start[0], start[1], goal[0], goal[1],
            start_name="Ushuaia", goal_name="Amundsen-Scott Plateau",
            operator_opt_in=True
        )

        self.assertFalse(route["route_found"])
        self.assertIn(route["status"], ["ROUTE_BLOCKED", "SAFETY_UNVERIFIED_DATA_INSUFFICIENT"])
        self.assertTrue(len(route["waypoints"]) == 0)

    def test_03_maitri_inland_rejection_vs_princess_astrid_optin(self):
        cpt = (-33.880, 18.440)
        maitri = (-70.7658, 11.7358)
        staging = (-69.8500, 11.9000)

        # 1. Direct to Maitri Base without opt-in -> MUST FAIL
        resp1 = self.client.post("/api/route/optimize", json={
            "start_lat": cpt[0], "start_lon": cpt[1],
            "goal_lat": maitri[0], "goal_lon": maitri[1],
            "start_name": "Cape Town", "goal_name": "Maitri Base",
            "operator_opt_in": False
        })
        self.assertEqual(resp1.status_code, 200)
        data1 = resp1.json()
        self.assertFalse(data1["route_found"])
        self.assertIn(data1["status"], ["SAFETY_UNVERIFIED_DATA_INSUFFICIENT", "ROUTE_BLOCKED"])

        # 2. Princess Astrid staging WITH operator opt-in -> Succeeds with truthful contract
        resp2 = self.client.post("/api/route/optimize", json={
            "start_lat": cpt[0], "start_lon": cpt[1],
            "goal_lat": staging[0], "goal_lon": staging[1],
            "start_name": "Cape Town", "goal_name": "Princess Astrid Coast Staging",
            "operator_opt_in": True
        })
        self.assertEqual(resp2.status_code, 200)
        data2 = resp2.json()
        self.assertTrue(data2["route_found"])
        self.assertEqual(data2["status"], "SCREENED_COARSE_REGIONAL_CONSTRAINTS")
        self.assertEqual(data2["bathymetry"]["status"], "UNVERIFIED_NOT_MODELED")
        self.assertFalse(data2["bathymetry"]["under_keel_clearance_checked"])
        self.assertGreater(data2["min_land_clearance_km"], 0.0)

    def test_04_continuous_line_segment_collision_vs_discrete_points(self):
        p_west = (-63.5, -60.0) # Water (west of peninsula)
        p_east = (-63.5, -53.0) # Water (east of peninsula in Weddell Sea)

        west_in_obs, _ = self.engine.is_point_in_obstacle(p_west[0], p_west[1])
        east_in_obs, _ = self.engine.is_point_in_obstacle(p_east[0], p_east[1])
        self.assertFalse(west_in_obs, "Test setup error: p_west should be in open water")
        self.assertFalse(east_in_obs, "Test setup error: p_east should be in open water")

        is_blocked, reason = self.engine.check_segment_collision(p_west, p_east, min_standoff_km=0.0)
        self.assertTrue(is_blocked, "Continuous LineString check MUST detect peninsula crossing")
        self.assertTrue("land" in reason.lower() or "shelf" in reason.lower())

    def test_05_post_smoothing_collision_rollback_gate(self):
        p_west = (-63.5, -60.0)
        p_north = (-62.8, -58.0) # Safe water north in Bransfield Strait
        p_east = (-63.5, -53.0)

        raw_route = [p_west, p_north, p_east]
        smoothed = self.optimizer.post_process_route_smoothing(raw_route, min_standoff_km=0.0)

        self.assertEqual(len(smoothed), 3)
        self.assertEqual(smoothed[1], p_north)

    def test_06_dynamic_hazard_envelope_clearance(self):
        from src.collision_risk import compute_cpa_tcpa

        ship_pos = (-60.0, -50.0)
        ship_speed_kts = 14.0
        ship_hdg = 180.0

        berg_pos = (-60.166, -50.0)
        berg_vx_kts = 0.0
        berg_vy_kts = 1.0

        cpa_res = compute_cpa_tcpa(
            ship_pos[0], ship_pos[1], ship_speed_kts, ship_hdg,
            berg_pos[0], berg_pos[1], berg_vx_kts, berg_vy_kts
        )

        self.assertIn("cpa_distance_nm", cpa_res)
        self.assertIn("tcpa_hours", cpa_res)
        self.assertIn("threat_level", cpa_res)
        self.assertLess(cpa_res["cpa_distance_nm"], 1.0)
        self.assertGreater(cpa_res["tcpa_hours"], 0.0)
        self.assertIn(cpa_res["threat_level"], ["CRITICAL", "HIGH"])

    def test_07_truthful_api_status_contract(self):
        resp = self.client.post("/api/route/optimize", json={
            "start_lat": -54.807, "start_lon": -68.304,
            "goal_lat": -64.774, "goal_lon": -64.053,
            "start_name": "Ushuaia Port (Argentina)", "goal_name": "Palmer Station (US)",
            "operator_opt_in": False
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["status"], "SCREENED_COARSE_REGIONAL_CONSTRAINTS")
        self.assertIn("DEMO PLAYBACK ONLY", data["label"])
        self.assertIn("COARSE 1:50M", data["label"])
        self.assertEqual(data["bathymetry"]["status"], "UNVERIFIED_NOT_MODELED")
        self.assertFalse(data["bathymetry"]["under_keel_clearance_checked"])
        self.assertNotIn("100% safe", str(data).lower())
        self.assertNotIn("guaranteed safe", str(data).lower())


if __name__ == "__main__":
    unittest.main()
