import os
import unittest
import json
from fastapi.testclient import TestClient
from app.backend.main import app

class TestRadar3DCapabilities(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_geospatial_context_endpoint(self):
        resp = self.client.get('/api/geospatial/context?lat_min=-66.0&lat_max=-54.0&lon_min=-70.0&lon_max=-60.0')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'APPROXIMATE_1_50M_REGIONAL_DATA')
        self.assertIn('features', data)
        self.assertTrue(len(data['features']) > 0)
        first_feat = data['features'][0]
        self.assertIn('type', first_feat)
        self.assertIn('geometry', first_feat)
        self.assertIn(first_feat['geometry']['type'], ['Polygon', 'MultiPolygon'])

    def test_02_custom_icebergs_route_avoidance(self):
        custom_bergs = [
            {
                'id': 'CUSTOM_BERG_ALPHA',
                'lat': -60.0,
                'lon': -65.0,
                'speed_knots': 0.4,
                'heading_deg': 180.0,
                'radius_km': 40.0,
                'size_sq_km': 1200.0
            }
        ]
        payload = {
            'start_lat': -55.2000,
            'start_lon': -66.2000,
            'goal_lat': -64.8000,
            'goal_lon': -64.1500,
            'start_name': 'Ushuaia Port (Argentina)',
            'goal_name': 'Palmer Station (US)',
            'risk_tolerance': 5.0,
            'vessel_speed_knots': 14.0,
            'include_all_icebergs': True,
            'custom_icebergs': custom_bergs
        }
        resp = self.client.post('/api/route/optimize', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get('route_found', False))
        self.assertEqual(data.get('status'), 'SCREENED_COARSE_REGIONAL_CONSTRAINTS')
        waypoints = data.get('waypoints', [])
        self.assertTrue(len(waypoints) >= 2)

    def test_03_custom_icebergs_validation_error(self):
        invalid_payload = {
            'start_lat': -55.2000,
            'start_lon': -66.2000,
            'goal_lat': -64.8000,
            'goal_lon': -64.1500,
            'custom_icebergs': [
                {
                    'id': 'INVALID_BERG',
                    'lat': 150.0,
                    'lon': -65.0
                }
            ]
        }
        resp = self.client.post('/api/route/optimize', json=invalid_payload)
        self.assertEqual(resp.status_code, 422)

    def test_04_route_blocked_handling(self):
        wall_bergs = []
        for i, lat in enumerate([-64.7, -64.75, -64.8, -64.85, -64.9]):
            for j, lon in enumerate([-64.0, -64.1, -64.15, -64.2, -64.25, -64.3]):
                wall_bergs.append({
                    'id': f'WALL_{i}_{j}',
                    'lat': lat,
                    'lon': lon,
                    'radius_km': 50.0
                })
        payload = {
            'start_lat': -55.2000,
            'start_lon': -66.2000,
            'goal_lat': -64.8000,
            'goal_lon': -64.1500,
            'start_name': 'Ushuaia Port (Argentina)',
            'goal_name': 'Palmer Station (US)',
            'risk_tolerance': 10.0,
            'custom_icebergs': wall_bergs
        }
        resp = self.client.post('/api/route/optimize', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Strictly assert route is rejected when destination is surrounded by iceberg wall
        self.assertFalse(data.get('route_found'), "Route MUST be rejected when destination is obstructed by iceberg wall")
        self.assertEqual(data.get('status'), 'ROUTE_BLOCKED')
        self.assertEqual(len(data.get('waypoints', [])), 0)
        self.assertIn('obstructed', data.get('message', '').lower())

    def test_05_legacy_route_request_preserved(self):
        payload = {
            'start_lat': -55.2000,
            'start_lon': -66.2000,
            'goal_lat': -64.8000,
            'goal_lon': -64.1500,
            'start_name': 'Ushuaia Port (Argentina)',
            'goal_name': 'Palmer Station (US)'
        }
        resp = self.client.post('/api/route/optimize', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get('route_found', False))
        self.assertEqual(data.get('status'), 'SCREENED_COARSE_REGIONAL_CONSTRAINTS')

    def test_06_frontend_contract_blocked_propulsion_halt(self):
        """Verifies the frontend radar simulation contract explicitly halts propulsion on blocked route."""
        radar_path = os.path.join(os.path.dirname(__file__), 'app', 'frontend', 'radar_simulation.html')
        with open(radar_path, 'r', encoding='utf-8') as f:
            html = f.read()
        self.assertIn('NO NAVIGABLE ROUTE (PROPULSION HALTED)', html)
        self.assertIn('simSpeedMultiplier = 0.0', html)
        self.assertIn('isPaused = true', html)
        self.assertIn('validateFallbackRoute', html)
        self.assertIn('Approximate 1:50M cartographic geometry', html)

if __name__ == '__main__':
    unittest.main()

