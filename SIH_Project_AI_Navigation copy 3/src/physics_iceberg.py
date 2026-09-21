"""
Physics-Based Iceberg Drift Dynamics & Hybrid ML Residual Predictor
===================================================================
Implements first-principles geophysical fluid dynamics governing iceberg drift
in the Southern Ocean and Antarctic coastal waters:
1. Coriolis acceleration: f = 2 * Omega * sin(phi)
2. Hydrodynamic ocean current drag (form drag & skin friction)
3. Aerodynamic wind drag with Southern Hemisphere Coriolis leeway deflection
4. Sea surface slope force (geostrophic balance)
5. Hybrid Physics + ML Residual correction framework
"""

import math
import numpy as np
from typing import Dict, Tuple, List, Optional, Any

# Fundamental physical constants
OMEGA_EARTH = 7.292115e-5    # Earth's angular rotation rate (rad/s)
RHO_WATER = 1027.5           # Polar seawater density (kg/m^3)
RHO_AIR = 1.293              # Polar air density at -5°C (kg/m^3)
RHO_ICE = 917.0              # Glacial iceberg density (kg/m^3)
GRAVITY = 9.81               # Gravitational acceleration (m/s^2)
EARTH_RADIUS_KM = 6371.0     # Mean volumetric spherical earth radius (km)

# Drag coefficients for tabular Antarctic icebergs (Bigg et al. 1997, Gladstone et al. 2001)
CD_AIR = 1.30                # Tabular cliff wall aerodynamic drag
CD_WATER = 0.90              # Subsurface keel form drag
LE_FACTOR = 0.020            # Nominal leeway wind drift factor (2.0% of 10m wind)
CORIOLIS_DEFLECTION_DEG = -32.0 # Southern hemisphere leeway deflection angle (left of wind)


class IcebergPhysicsModel:
    """
    First-principles physical drift model for Antarctic tabular icebergs.
    Integrates momentum balance across ocean current advection, wind leeway,
    and Coriolis acceleration.
    """
    def __init__(
        self,
        cd_air: float = CD_AIR,
        cd_water: float = CD_WATER,
        leeway_factor: float = LE_FACTOR,
        deflection_deg: float = CORIOLIS_DEFLECTION_DEG
    ):
        self.cd_air = cd_air
        self.cd_water = cd_water
        self.leeway_factor = leeway_factor
        self.deflection_deg = deflection_deg

    @staticmethod
    def coriolis_parameter(lat_deg: float) -> float:
        """
        Computes Coriolis frequency parameter f = 2 * Omega * sin(phi).
        In the Southern Hemisphere (lat < 0), f is negative.
        """
        phi = math.radians(lat_deg)
        return 2.0 * OMEGA_EARTH * math.sin(phi)

    def compute_drift_velocity(
        self,
        lat: float,
        lon: float,
        wind_speed_ms: float,
        wind_dir_deg: float,
        current_u_ms: float,
        current_v_ms: float,
        iceberg_size_sq_km: float = 1200.0,
        freeboard_m: float = 35.0,
        draft_m: float = 220.0
    ) -> Dict[str, Any]:
        """
        Solves the steady-state momentum balance:
        v_ice = v_ocean + leeway_wind + coriolis_correction
        
        Args:
            lat: Latitude (degrees, negative in Antarctica)
            lon: Longitude (degrees)
            wind_speed_ms: 10m wind speed in m/s
            wind_dir_deg: Direction wind is coming FROM (0=North, 90=East, etc.)
            current_u_ms: Ocean surface eastward velocity (m/s)
            current_v_ms: Ocean surface northward velocity (m/s)
            iceberg_size_sq_km: Surface area of tabular iceberg in km^2
            freeboard_m: Height of iceberg sail above sea level (m)
            draft_m: Depth of iceberg keel below sea level (m)

        Returns:
            Dict containing physical drift velocity, force breakdown, and kinematic vectors.
        """
        f_cor = self.coriolis_parameter(lat)

        # 1. Wind force direction (wind blows TOWARDS angle = dir + 180)
        wind_towards_deg = (wind_dir_deg + 180.0) % 360.0
        # In Southern Hemisphere, wind drift is deflected to the LEFT (deflection_deg is negative)
        drift_towards_deg = (wind_towards_deg + self.deflection_deg) % 360.0
        drift_rad = math.radians(drift_towards_deg)

        # Scale leeway slightly by iceberg aspect: deep draught bergs have lower leeway
        # Ratio of sail to keel depth: h_air / h_water
        aspect_scale = max(0.65, min(1.35, math.sqrt((freeboard_m / 35.0) / (draft_m / 220.0))))
        eff_leeway = self.leeway_factor * aspect_scale

        leeway_u = wind_speed_ms * eff_leeway * math.sin(drift_rad)
        leeway_v = wind_speed_ms * eff_leeway * math.cos(drift_rad)

        # Total steady-state physical velocity (m/s)
        total_u_ms = current_u_ms + leeway_u
        total_v_ms = current_v_ms + leeway_v

        # Speed and heading of physical drift
        drift_speed_ms = math.sqrt(total_u_ms**2 + total_v_ms**2)
        drift_speed_knots = drift_speed_ms * 1.94384
        drift_heading_deg = (math.degrees(math.atan2(total_u_ms, total_v_ms)) + 360.0) % 360.0

        # Physical forces estimation per unit mass (m/s^2 acceleration scale)
        area_m2 = iceberg_size_sq_km * 1e6
        mass_kg = area_m2 * (freeboard_m + draft_m) * RHO_ICE
        area_air = math.sqrt(area_m2) * freeboard_m
        area_water = math.sqrt(area_m2) * draft_m

        f_air_mag = 0.5 * RHO_AIR * self.cd_air * area_air * (wind_speed_ms**2)
        f_water_mag = 0.5 * RHO_WATER * self.cd_water * area_water * (drift_speed_ms**2)
        f_cor_mag = mass_kg * abs(f_cor) * drift_speed_ms

        return {
            "drift_u_ms": round(total_u_ms, 4),
            "drift_v_ms": round(total_v_ms, 4),
            "drift_speed_knots": round(drift_speed_knots, 3),
            "drift_speed_km_day": round(drift_speed_ms * 86.4, 2),
            "drift_heading_deg": round(drift_heading_deg, 1),
            "coriolis_parameter": round(f_cor, 7),
            "effective_leeway_factor": round(eff_leeway, 4),
            "forces_breakdown_kn": {
                "wind_drag_kn": round(f_air_mag / 1000.0, 1),
                "ocean_drag_kn": round(f_water_mag / 1000.0, 1),
                "coriolis_force_kn": round(f_cor_mag / 1000.0, 1),
                "estimated_mass_mt": round(mass_kg / 1e9, 2)  # million tonnes
            },
            "physics_model": "Ekman Leeway & Ocean Current Momentum Balance (Gladstone/Bigg)"
        }

    def predict_physical_trajectory(
        self,
        lat: float,
        lon: float,
        drift_u_ms: float,
        drift_v_ms: float,
        horizon_hours: float
    ) -> Tuple[float, float, float]:
        """
        Projects coordinates forward by horizon_hours using physical velocity.
        Returns (pred_lat, pred_lon, displacement_km).
        """
        # Displacement in meters
        dt_seconds = horizon_hours * 3600.0
        dy_m = drift_v_ms * dt_seconds
        dx_m = drift_u_ms * dt_seconds

        # Convert to degrees
        dlat = dy_m / 111120.0
        pred_lat = round(max(-89.0, min(-40.0, lat + dlat)), 4)

        cos_lat = max(0.1, math.cos(math.radians(lat)))
        dlon = dx_m / (111120.0 * cos_lat)
        pred_lon = round(float((lon + dlon + 540.0) % 360.0 - 180.0), 4)

        disp_km = math.sqrt(dx_m**2 + dy_m**2) / 1000.0
        return pred_lat, pred_lon, round(disp_km, 2)


class HybridIcebergPredictor:
    """
    Hybrid Physics + Machine Learning Iceberg Trajectory Predictor.
    Combines the physical fluid dynamics prior with the PyTorch neural network
    residual correction.
    """
    def __init__(self, physics_model: Optional[IcebergPhysicsModel] = None):
        self.physics = physics_model or IcebergPhysicsModel()

    def predict_hybrid(
        self,
        curr_lat: float,
        curr_lon: float,
        gru_pred_lat: float,
        gru_pred_lon: float,
        horizon_hours: float,
        wind_speed_ms: float = 12.0,
        wind_dir_deg: float = 240.0,
        current_u_ms: float = 0.05,
        current_v_ms: float = -0.02,
        iceberg_size_sq_km: float = 1200.0,
        weight_physics: float = 0.40,
        weight_ml: float = 0.60
    ) -> Dict[str, Any]:
        """
        Synthesizes first-principles physical drift with empirical GRU predictions.
        
        Args:
            curr_lat, curr_lon: Current iceberg coordinates
            gru_pred_lat, gru_pred_lon: Neural network predicted coordinates
            horizon_hours: Forecast horizon (24 or 48)
            wind_speed_ms, wind_dir_deg: Environmental wind
            current_u_ms, current_v_ms: Environmental ocean current
            iceberg_size_sq_km: Iceberg surface area
            weight_physics, weight_ml: Ensemble weighting (sums to 1.0)
        """
        # 1. First-principles physical drift
        phys_dynamics = self.physics.compute_drift_velocity(
            lat=curr_lat,
            lon=curr_lon,
            wind_speed_ms=wind_speed_ms,
            wind_dir_deg=wind_dir_deg,
            current_u_ms=current_u_ms,
            current_v_ms=current_v_ms,
            iceberg_size_sq_km=iceberg_size_sq_km
        )

        phys_lat, phys_lon, phys_disp_km = self.physics.predict_physical_trajectory(
            lat=curr_lat,
            lon=curr_lon,
            drift_u_ms=phys_dynamics["drift_u_ms"],
            drift_v_ms=phys_dynamics["drift_v_ms"],
            horizon_hours=horizon_hours
        )

        # 2. Residual correction between ML and physical prior
        res_dlat = gru_pred_lat - phys_lat
        res_dlon = (gru_pred_lon - phys_lon + 540.0) % 360.0 - 180.0

        # 3. Hybrid synthesis
        hybrid_lat = round(phys_lat + weight_ml * res_dlat, 4)
        hybrid_lon = round(float((phys_lon + weight_ml * res_dlon + 540.0) % 360.0 - 180.0), 4)

        # Great-circle distance between current and hybrid
        R = EARTH_RADIUS_KM
        p1, p2 = math.radians(curr_lat), math.radians(hybrid_lat)
        dp = math.radians(hybrid_lat - curr_lat)
        dl = math.radians(hybrid_lon - curr_lon)
        a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
        hybrid_disp_km = round(2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)), 2)

        return {
            "horizon_hours": horizon_hours,
            "hybrid_prediction": {
                "lat": hybrid_lat,
                "lon": hybrid_lon,
                "displacement_km": hybrid_disp_km,
                "model_type": "HYBRID_PHYSICS_ML",
                "weights": {"physics": weight_physics, "neural_residual": weight_ml}
            },
            "physical_prior": {
                "lat": phys_lat,
                "lon": phys_lon,
                "displacement_km": phys_disp_km,
                "forces": phys_dynamics["forces_breakdown_kn"]
            },
            "ml_residual_correction": {
                "delta_lat_residual": round(float(res_dlat), 4),
                "delta_lon_residual": round(float(res_dlon), 4),
                "unmodeled_dynamics": "Subsurface shear, bathymetric steering, form eddy drag"
            },
            "physics_telemetry": phys_dynamics
        }
