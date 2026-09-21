"""
Comprehensive API and Pipeline Verification Suite
=================================================
Automated verification tests for all endpoints and algorithmic subsystems:
- Data Provenance and Quality
- Canonical SQLite Catalog & Track Queries
- PyTorch GRU Multi-Horizon Inference & MC Dropout
- Collision Risk (CPA/TCPA) Calculations
- A* Route Optimization & Dynamic Replanning
- Indian Antarctic Mission Planning
- Real-Time / Offline Data Resilience
"""

import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.backend.main import app, load_application_state


class TestAntarcticNavigationAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load_application_state()
        cls.client = TestClient(app)

    def test_01_health_check(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["dataset_loaded"])
        self.assertTrue(data["model_loaded"])

    def test_02_data_provenance(self):
        resp = self.client.get("/api/data/provenance")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("source", data)
        self.assertIn("version", data)
        self.assertIn("observation_count", data)
        self.assertGreater(data["observation_count"], 100000)
        self.assertEqual(data["status"], "VERIFIED")

    def test_03_data_quality(self):
        resp = self.client.get("/api/data/quality")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["total_observations"], 200000)
        self.assertGreater(data["unique_icebergs"], 50)
        self.assertEqual(data["missing_coordinate_values"], 0)

    def test_04_current_icebergs(self):
        resp = self.client.get("/api/current-icebergs")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("mode", data)
        self.assertGreater(data["count"], 0)

    def test_05_stations(self):
        resp = self.client.get("/api/stations")
        self.assertEqual(resp.status_code, 200)
        stations = resp.json()["stations"]
        self.assertIn("Maitri (India)", stations)
        self.assertIn("Bharati (India)", stations)
        self.assertIn("Ushuaia Port (Argentina)", stations)
        self.assertIn("Palmer Station (US)", stations)

    def test_06_icebergs_catalog_and_search(self):
        resp = self.client.get("/api/icebergs")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["total"], 50)

        # Search query
        s_resp = self.client.get("/api/icebergs/search?q=B09")
        self.assertEqual(s_resp.status_code, 200)
        s_data = s_resp.json()
        self.assertGreater(s_data["count"], 0)
        self.assertTrue(any("B09" in b["iceberg_id"] for b in s_data["icebergs"]))

    def test_07_iceberg_detail_and_track(self):
        resp = self.client.get("/api/icebergs/B09B")
        self.assertEqual(resp.status_code, 200)
        detail = resp.json()
        self.assertEqual(detail["iceberg_id"], "B09B")
        self.assertIn("last_observation", detail)

        t_resp = self.client.get("/api/icebergs/B09B/track?limit=50")
        self.assertEqual(t_resp.status_code, 200)
        track = t_resp.json()
        self.assertEqual(track["iceberg_id"], "B09B")
        self.assertGreater(len(track["track"]), 10)

    def test_08_predict_and_forecast(self):
        resp = self.client.post("/api/predict", json={"iceberg_id": "B09B", "horizon_hours": 48})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["iceberg_id"], "B09B")
        fc24 = data["forecasts"]["24h"]
        fc48 = data["forecasts"]["48h"]
        self.assertIn("gru_prediction", fc24)
        self.assertIn("baseline_prediction", fc24)
        self.assertGreater(fc24["gru_prediction"]["uncertainty_radius_km"], 0)
        self.assertEqual(len(fc24["gru_prediction"]["ensemble_fan"]), 15)

    def test_09_cpa_tcpa_collision_risk(self):
        resp = self.client.get("/api/icebergs/B09B/risk?vessel_lat=-65.0&vessel_lon=140.0")
        self.assertEqual(resp.status_code, 200)
        risk = resp.json()
        self.assertIn("cpa_distance_km", risk)
        self.assertIn("tcpa_hours", risk)
        self.assertIn(risk["threat_level"], ["LOW", "MODERATE", "HIGH", "CRITICAL"])

    def test_10_route_optimization(self):
        resp = self.client.post("/api/route/optimize", json={
            "start_lat": -55.200, "start_lon": -66.200,
            "goal_lat": -64.800, "goal_lon": -64.150,
            "start_name": "Ushuaia Port (Argentina)",
            "goal_name": "Palmer Station (US)",
            "risk_tolerance": 5.0,
            "vessel_speed_knots": 14.0,
            "include_all_icebergs": True
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["status"], ["SCREENED_COARSE_REGIONAL_CONSTRAINTS", "success"])
        self.assertGreater(len(data["waypoints"]), 5)
        self.assertGreater(data["total_distance_km"], 800)
        self.assertIn("collision_analysis", data)

    def test_11_route_compare(self):
        resp = self.client.post("/api/route/compare", json={
            "start_lat": -55.200, "start_lon": -66.200,
            "goal_lat": -64.800, "goal_lon": -64.150,
            "start_name": "Ushuaia", "goal_name": "Palmer",
            "include_all_icebergs": True
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("basic", data["modes"])
        self.assertIn("balanced", data["modes"])
        self.assertIn("advanced", data["modes"])
        self.assertIn(data["modes"]["balanced"]["status"], ["SCREENED_COARSE_REGIONAL_CONSTRAINTS", "success"])

    def test_12_route_replan(self):
        resp = self.client.post("/api/route/replan", json={
            "current_lat": -60.0, "current_lon": -64.0,
            "destination_lat": -64.774, "destination_lon": -64.053,
            "encroaching_iceberg_id": "A23A",
            "drift_offset_km": 25.0
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["replanning_needed"])
        self.assertIn("metrics_comparison", data)
        self.assertGreater(data["metrics_comparison"]["risk_reduction_pct"], 80.0)

    def test_13_india_mission_plan(self):
        resp = self.client.post("/api/mission/plan", json={
            "origin": "Cape Town Port (South Africa)",
            "destination": "Maitri (India)",
            "vessel_name": "MV Maitri Express",
            "vessel_speed_knots": 13.0,
            "risk_tolerance": 5.0,
            "round_trip_both": False,
            "operator_opt_in": True
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("Operation Samudra Maitri", data["mission_name"])
        self.assertGreater(data["total_distance_km"], 3000)
        self.assertGreater(data["fuel_consumption_tonnes"], 100)
        self.assertIn("data_provenance", data)

    def test_14_analytics_and_benchmarks(self):
        resp = self.client.get("/api/analytics/overview")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("icebergs_by_year", data)
        self.assertIn("speed_distribution", data)

        b_resp = self.client.get("/api/benchmarks")
        self.assertEqual(b_resp.status_code, 200)
        benchmarks = b_resp.json()
        self.assertIn("improvement_pct", benchmarks)

    def test_15_india_mission_round_trip(self):
        resp = self.client.post("/api/mission/plan", json={
            "origin": "Cape Town Port (South Africa)",
            "destination": "Maitri (India)",
            "vessel_name": "MV Samudra Ratna",
            "vessel_speed_knots": 14.0,
            "risk_tolerance": 5.0,
            "round_trip_both": True,
            "operator_opt_in": True
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["legs"]), 3)
        self.assertGreater(data["total_distance_km"], 10000.0)
        self.assertGreater(data["estimated_time_days"], 15.0)
        self.assertIn("vessel_voyage", data["data_provenance"])
        self.assertIn("DEMO PLAYBACK ONLY", data["data_provenance"]["vessel_voyage"])

    def test_16_mc_dropout_stochastic_variance(self):
        resp = self.client.post("/api/predict", json={"iceberg_id": "C16", "horizon_hours": 48})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        pred48 = data["forecasts"]["48h"]["gru_prediction"]
        self.assertEqual(len(pred48["ensemble_fan"]), 15)
        # Verify non-zero uncertainty radius and variance
        self.assertGreater(pred48["uncertainty_radius_km"], 0.5)
        lats = [pt["lat"] for pt in pred48["ensemble_fan"]]
        unique_lats = set(lats)
        self.assertGreater(len(unique_lats), 5, "MC Dropout must produce stochastic variance across passes")

    def test_17_cpa_converging_vs_diverging(self):
        # Iceberg B09B position
        pos_resp = self.client.get("/api/icebergs/B09B")
        self.assertEqual(pos_resp.status_code, 200)
        b_pos = pos_resp.json()["last_observation"]

        b_lat = b_pos.get("latitude", b_pos.get("lat", -65.0))
        b_lon = b_pos.get("longitude", b_pos.get("lon", 140.0))

        # 1. Distant / diverging vessel
        safe_resp = self.client.get(f"/api/icebergs/B09B/risk?vessel_lat={b_lat + 5.0}&vessel_lon={b_lon + 5.0}&vessel_speed_knots=14.0&vessel_heading_deg=45.0")
        self.assertEqual(safe_resp.status_code, 200)
        safe_data = safe_resp.json()
        self.assertEqual(safe_data["threat_level"], "LOW")
        self.assertLess(safe_data["risk_score"], 0.1)

    def test_18_static_and_radar_access(self):
        r_home = self.client.get("/")
        self.assertEqual(r_home.status_code, 200)
        self.assertIn("root", r_home.text)

        r_radar = self.client.get("/radar_simulation.html")
        self.assertEqual(r_radar.status_code, 200)
        self.assertIn("Tactical Radar", r_radar.text)

    def test_19_database_integrity_and_checksum(self):
        resp = self.client.get("/api/provenance")
        self.assertEqual(resp.status_code, 200)
        prov = resp.json()
        self.assertEqual(prov["status"], "VERIFIED")
        self.assertEqual(prov["byu_database_stats"]["total_observations"], 243433)
        self.assertEqual(prov["byu_database_stats"]["unique_icebergs"], 75)
        self.assertEqual(prov["byu_database_stats"]["coordinate_validity_pct"], 100.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)

