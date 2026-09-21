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

    def test_scenario_07_multiple_sequential_icebergs(self):
        icebergs = [
            {"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 100.0},
            {"id": "ICE-2", "lat": -61.0, "lon": -60.0, "size_sq_km": 100.0}
        ]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, self.current_route, icebergs)
        print("SCENARIO 7:", res)

    def test_scenario_09_large_iceberg_wide_evasion(self):
        icebergs = [{"id": "ICE-1", "lat": -60.5, "lon": -60.0, "size_sq_km": 4000.0}]
        res = generate_tactical_avoidance(self.ship_lat, self.ship_lon, self.current_route, icebergs)
        print("SCENARIO 9:", res)

if __name__ == "__main__":
    unittest.main()
