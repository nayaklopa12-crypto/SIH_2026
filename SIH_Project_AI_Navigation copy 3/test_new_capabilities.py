"""
Automated Verification Suite for Newly Implemented Polar Capabilities
=====================================================================
Rigorous test suite covering the 4 closed gaps:
1. Sea-Ice Concentration & Marginal Ice Zone Advection Forecasting
2. Physics-Based Iceberg Drift Dynamics & Hybrid ML Residual Correction
3. Authoritative Maitri & Bharati Coordinates & Landing Sites
4. IMO Polar Code Vessel Digital Twin, Resistance & POLARIS Evaluation
5. Environmental Service Live/Cache Fallback & Corridor Weather
"""

import os
import sys
import unittest
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from app.backend.main import app, load_application_state
from src.physics_iceberg import IcebergPhysicsModel, HybridIcebergPredictor
from src.environmental_service import get_environmental_conditions, get_all_corridors_summary
from src.vessel_twin import VesselDigitalTwin, VESSEL_ARCHETYPES, POLARIS_RIV_TABLE
from src.sea_ice_service import SeaIceForecastingService
from src.route_optimizer import ANTARCTIC_STATIONS


class TestNewPolarCapabilities(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load_application_state()
        cls.client = TestClient(app)

    # ─── 1. Authoritative Station Coordinates (Gap C) ───────────────────────
    def test_01_authoritative_station_coordinates(self):
        maitri = ANTARCTIC_STATIONS["Maitri (India)"]
        bharati = ANTARCTIC_STATIONS["Bharati (India)"]

        # Exact decimal degrees matching NCPOR / COMNAP
        self.assertAlmostEqual(maitri["lat"], -70.7658, places=3)
        self.assertAlmostEqual(maitri["lon"], 11.7358, places=3)
        self.assertIn("NCPOR", maitri["authority"])
        self.assertIn("India Bay", maitri["marine_landing"]["name"])

        self.assertAlmostEqual(bharati["lat"], -69.4078, places=3)
        self.assertAlmostEqual(bharati["lon"], 76.1872, places=3)
        self.assertIn("NCPOR", bharati["authority"])
        self.assertIn("Thala Fjord", bharati["marine_landing"]["name"])

        # API check
        resp = self.client.get("/api/stations")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["stations"]
        self.assertIn("Maitri (India)", data)
        self.assertIn("Bharati (India)", data)

    # ─── 2. Physics-Based Iceberg Drift & Hybrid PIML (Gap B) ───────────────
    def test_02_iceberg_physics_forces_and_coriolis(self):
        phys = IcebergPhysicsModel()
        f_cor = phys.coriolis_parameter(-65.0)
        # Coriolis parameter in Southern Hemisphere must be negative
        self.assertLess(f_cor, 0.0)

        # Drift velocity under 15 m/s wind and ocean current
        drift = phys.compute_drift_velocity(
            lat=-65.0, lon=-60.0,
            wind_speed_ms=15.0, wind_dir_deg=270.0,
            current_u_ms=0.10, current_v_ms=0.02,
            iceberg_size_sq_km=1500.0
        )
        self.assertIn("drift_speed_knots", drift)
        self.assertGreater(drift["drift_speed_knots"], 0.05)
        self.assertIn("forces_breakdown_kn", drift)
        self.assertGreater(drift["forces_breakdown_kn"]["wind_drag_kn"], 0.0)
        self.assertGreater(drift["forces_breakdown_kn"]["ocean_drag_kn"], 0.0)

    def test_03_hybrid_predict_endpoint(self):
        resp = self.client.post("/api/predict/hybrid", json={
            "iceberg_id": "B09B",
            "horizon_hours": 48,
            "weight_physics": 0.4,
            "weight_ml": 0.6
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["iceberg_id"], "B09B")
        self.assertIn("hybrid_prediction", data)
        self.assertIn("physical_prior", data)
        self.assertIn("ml_residual_correction", data)
        self.assertEqual(data["provenance"], "HYBRID_PHYSICS_PIML_FRAMEWORK")

        # Check that physical prior displacement and hybrid displacement are valid numbers
        self.assertGreater(data["hybrid_prediction"]["displacement_km"], 0.0)
        self.assertGreater(data["physical_prior"]["displacement_km"], 0.0)

    # ─── 3. Environmental Service & Corridor Reanalysis (Gap E) ─────────────
    def test_04_environmental_conditions_and_cache(self):
        # 1. Drake passage coordinate query
        env = get_environmental_conditions(-58.5, -60.0)
        self.assertIn("wind_speed_knots", env)
        self.assertIn("wave_height_m", env)
        self.assertIn("provenance", env)
        self.assertIn(env["status"], ["OPERATIONAL", "VERIFIED_OFFLINE", "UNVERIFIED_OFFLINE", "SIMULATED"])

        # 2. Corridors summary
        corridors = get_all_corridors_summary()
        self.assertGreaterEqual(corridors["total_corridors"], 4)
        self.assertIn("Drake Passage", corridors["corridors"])
        self.assertIn("Weddell Sea", corridors["corridors"])

        # 3. API endpoint tests
        r1 = self.client.get("/api/environmental/current?lat=-58.5&lon=-60.0")
        self.assertEqual(r1.status_code, 200)
        d1 = r1.json()
        self.assertIn("wind_speed_knots", d1)

        r2 = self.client.get("/api/environmental/corridors")
        self.assertEqual(r2.status_code, 200)
        d2 = r2.json()
        self.assertGreaterEqual(d2["total_corridors"], 4)

    # ─── 4. IMO Polar Code Vessel Digital Twin (Gap D) ──────────────────────
    def test_05_vessel_twin_hydrodynamics_and_ice(self):
        twin = VesselDigitalTwin(VESSEL_ARCHETYPES["MV-MAITRI-SUPPLY"])
        self.assertEqual(twin.ice_class, "PC5")

        # Open water resistance must increase with speed
        r10 = twin.open_water_resistance_kn(10.0)
        r14 = twin.open_water_resistance_kn(14.0)
        self.assertGreater(r14, r10)
        self.assertGreater(r10, 0.0)

        # Ice resistance in 0.5m ice must be non-zero
        r_ice = twin.lindqvist_ice_resistance_kn(speed_knots=8.0, ice_thickness_m=0.6, ice_concentration=0.7)
        self.assertGreater(r_ice, 0.0)

        # Full power and fuel calculation
        calcs = twin.calculate_power_and_fuel(
            speed_knots=12.0, ice_thickness_m=0.4, ice_concentration=0.5, sea_state_wave_m=2.5
        )
        self.assertIn("powering", calcs)
        self.assertIn("fuel_and_emissions", calcs)
        self.assertIn("imo_polaris_evaluation", calcs)
        self.assertGreater(calcs["fuel_and_emissions"]["fuel_consumption_rate_t_per_h"], 0.1)
        self.assertGreater(calcs["fuel_and_emissions"]["co2_emissions_rate_t_per_h"], 0.3)
        self.assertEqual(calcs["provenance"], "CONFIGURABLE_DEMONSTRATION_TWIN")

    def test_06_vessel_twin_api_endpoints(self):
        # 1. GET /api/vessel/twin
        r1 = self.client.get("/api/vessel/twin?vessel_id=MV-MAITRI-SUPPLY")
        self.assertEqual(r1.status_code, 200)
        d1 = r1.json()
        self.assertEqual(d1["vessel_spec"]["vessel_id"], "MV-MAITRI-SUPPLY")
        self.assertGreater(len(d1["speed_power_curve"]), 3)

        # 2. POST /api/vessel/twin/simulate
        r2 = self.client.post("/api/vessel/twin/simulate", json={
            "vessel_id": "MV-BHARATI-SUPPLY",
            "speed_knots": 13.0,
            "ice_thickness_m": 0.5,
            "ice_concentration": 0.6,
            "wave_height_m": 2.2
        })
        self.assertEqual(r2.status_code, 200)
        d2 = r2.json()
        self.assertIn("imo_polaris_evaluation", d2)
        self.assertIn("total_resistance_kn", d2["resistance_breakdown_kn"])

    # ─── 5. Sea-Ice Concentration & Forecasting (Gap A) ─────────────────────
    def test_07_sea_ice_forecasting_and_disclosure(self):
        service = SeaIceForecastingService()

        # Open water coordinate north of ice edge (e.g. -50°S)
        open_water = service.get_ice_state_at(lat=-50.0, lon=-60.0, day_of_year=50)
        self.assertEqual(open_water["concentration"], 0.0)
        self.assertIn("OPEN_WATER", open_water["regime"])

        # Deep polar coordinate south of ice edge (e.g. -75°S)
        pack_ice = service.get_ice_state_at(lat=-75.0, lon=-40.0, day_of_year=50)
        self.assertGreater(pack_ice["concentration"], 0.15)
        self.assertGreater(pack_ice["thickness_m"], 0.2)

        # Advective forecast (+48h)
        adv = service.forecast_ice_edge_advance(lon=-60.0, horizon_hours=48.0, wind_speed_ms=12.0)
        self.assertIn("current_edge_lat", adv)
        self.assertIn("forecast_edge_lat", adv)
        self.assertIn("disclosure", adv)

        # API endpoint test
        resp = self.client.get("/api/sea-ice/forecast?lat=-65.0&lon=-60.0&horizon_hours=48.0")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("current_ice_state", data)
        self.assertIn("advection_forecast", data)
        self.assertIn("disclosure", data)


if __name__ == "__main__":
    unittest.main(verbosity=2)
