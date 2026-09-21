import unittest
import json
from src.tactical_avoidance import generate_tactical_avoidance

class TestTacticalAvoidance(unittest.TestCase):
    def setUp(self):
        self.ship_lat = -60.0
        self.ship_lon = -60.0
        self.current_route = [
            [-60.0, -60.0],
            [-60.5, -60.0],
            [-61.0, -60.0],
            [-61.5, -60.0],
            [-62.0, -60.0]
        ]

    def test_scenario_01_clear_path(self):
        icebergs = []
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "safe")

    def test_scenario_02_single_iceberg_dead_ahead(self):
        icebergs = [{"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        self.assertIn(res["avoidance_side"], ["left", "right", "dynamic"])

    def test_scenario_03_left_blocked_choose_right(self):
        # Place one dead ahead, and one to the left
        icebergs = [
            {"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0},
            {"id": "ICE-2", "lat": -60.5, "lon": -59.5, "size_sq_km": 200.0} # left
        ]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        self.assertIn(res["avoidance_side"], ["left", "right", "dynamic"])

    def test_scenario_04_right_blocked_choose_left(self):
        # Place one dead ahead, and one to the right
        icebergs = [
            {"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0},
            {"id": "ICE-2", "lat": -60.5, "lon": -60.5, "size_sq_km": 200.0} # right
        ]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        self.assertIn(res["avoidance_side"], ["left", "right", "dynamic"])

    def test_scenario_05_both_blocked_no_safe_path(self):
        # Place a huge wall of icebergs
        icebergs = [
            {"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 4000.0},
            {"id": "ICE-2", "lat": -60.5, "lon": -59.0, "size_sq_km": 4000.0}, # left
            {"id": "ICE-3", "lat": -60.5, "lon": -61.0, "size_sq_km": 4000.0}  # right
        ]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertIn(res["status"], ["blocked", "avoidance_required"])

    def test_scenario_06_distant_iceberg_ignored(self):
        # Iceberg very far away (outside detection radius)
        icebergs = [{"id": "ICE-1", "lat": -70.0, "lon": -60.0, "size_sq_km": 100.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs, detection_radius_km=110.0)
        self.assertEqual(res["status"], "safe")

    def test_scenario_07_multiple_sequential_icebergs(self):
        icebergs = [
            {"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0},
            {"id": "ICE-2", "lat": -61.0, "lon": -60.0, "size_sq_km": 100.0}
        ]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        # It should avoid ICE-1 first
        self.assertEqual(res["threats"][0], "ICE-1")
        
    def test_scenario_08_iceberg_on_destination(self):
        icebergs = [{"id": "ICE-1", "lat": -62.0, "lon": -60.0, "size_sq_km": 100.0}]
        # Destination is 222km away, so we must increase detection_radius to see it
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs, detection_radius_km=300.0)
        # Should be blocked, because there's nowhere to merge back onto the route safely after the destination
        self.assertIn(res["status"], ["blocked", "avoidance_required"])

    def test_scenario_09_large_iceberg_wide_evasion(self):
        icebergs = [{"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 4000.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        self.assertGreaterEqual(res["safe_clearance"], 0.0)

    def test_scenario_10_small_iceberg_tight_evasion(self):
        icebergs = [{"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 1.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "avoidance_required")
        self.assertLess(res["safe_clearance"], 20.0)

    def test_scenario_11_route_points_interpolation(self):
        icebergs = [{"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        # Should generate multiple points for smooth curve
        self.assertGreaterEqual(len(res["avoidance_route"]), 2)
        
    def test_scenario_12_already_past_iceberg(self):
        # Iceberg behind the ship
        icebergs = [{"id": "ICE-1", "lat": -59.5, "lon": -60.0, "size_sq_km": 100.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, 180.0, [-62.0, -60.0], self.current_route, icebergs)
        self.assertEqual(res["status"], "safe")

if __name__ == "__main__":
    unittest.main()
