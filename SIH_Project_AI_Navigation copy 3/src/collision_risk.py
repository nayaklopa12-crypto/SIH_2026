"""
Antarctic Maritime Collision Risk & CPA/TCPA Engine
===================================================
Calculates Closest Point of Approach (CPA), Time to Closest Point of
Approach (TCPA), geometric trajectory intersection hazards, uncertainty
expansion envelopes, and threat categorization (LOW, MODERATE, HIGH, CRITICAL).
"""

import math
from typing import List, Dict, Tuple, Optional, Any
import numpy as np

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates spherical great-circle distance in kilometers."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians((lon2 - lon1 + 540.0) % 360.0 - 180.0)

    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_KM * c


def latlon_to_cartesian_km(lat: float, lon: float, ref_lat: float, ref_lon: float) -> Tuple[float, float]:
    """Projects lat/lon to local Cartesian tangent plane in km around reference coordinate."""
    x = math.radians((lon - ref_lon + 540.0) % 360.0 - 180.0) * EARTH_RADIUS_KM * math.cos(math.radians(ref_lat))
    y = math.radians(lat - ref_lat) * EARTH_RADIUS_KM
    return x, y


def compute_cpa_tcpa(
    ship_lat: float, ship_lon: float, ship_speed_kts: float, ship_heading_deg: float,
    berg_lat: float, berg_lon: float, berg_speed_kts: float, berg_heading_deg: float,
    berg_size_km: float = 8.0,
    uncertainty_km: float = 15.0
) -> Dict[str, Any]:
    """
    Computes exact Closest Point of Approach (CPA), Time to Closest Point of Approach (TCPA),
    and collision risk score based on relative kinematics.
    """
    ref_lat = (ship_lat + berg_lat) / 2.0
    ref_lon = (ship_lon + berg_lon) / 2.0

    # Positions in local Cartesian km
    sx, sy = latlon_to_cartesian_km(ship_lat, ship_lon, ref_lat, ref_lon)
    bx, by = latlon_to_cartesian_km(berg_lat, berg_lon, ref_lat, ref_lon)

    # Velocities in km/hour
    ship_spd_kmh = ship_speed_kts * 1.852
    berg_spd_kmh = berg_speed_kts * 1.852

    s_rad = math.radians(ship_heading_deg)
    b_rad = math.radians(berg_heading_deg)

    # Heading: 0 deg = North (+y), 90 deg = East (+x)
    vsx = ship_spd_kmh * math.sin(s_rad)
    vsy = ship_spd_kmh * math.cos(s_rad)

    vbx = berg_spd_kmh * math.sin(b_rad)
    vby = berg_spd_kmh * math.cos(b_rad)

    # Relative position: Iceberg relative to ship
    rx = bx - sx
    ry = by - sy
    initial_dist_km = math.sqrt(rx**2 + ry**2)

    # Relative velocity: Iceberg velocity minus ship velocity
    vrx = vbx - vsx
    vry = vby - vsy
    vr_sq = vrx**2 + vry**2

    if vr_sq < 1e-4:
        # Parallel tracks / stationary
        tcpa_hours = 0.0
        cpa_dist_km = initial_dist_km
    else:
        # TCPA formula
        tcpa_hours = -(rx * vrx + ry * vry) / vr_sq
        if tcpa_hours < 0:
            # Diverging: closest approach was in the past or now
            tcpa_hours = 0.0
            cpa_dist_km = initial_dist_km
        else:
            # Position at CPA
            cpa_rx = rx + vrx * tcpa_hours
            cpa_ry = ry + vry * tcpa_hours
            cpa_dist_km = math.sqrt(cpa_rx**2 + cpa_ry**2)

    # Threat envelope accounts for physical size and forecast uncertainty
    threat_radius = berg_size_km + uncertainty_km + 10.0  # 10 km vessel buffer

    # Normalized spatial risk: exp(-d^2 / (2 * threat_radius^2))
    if threat_radius > 0:
        spatial_risk = math.exp(-(cpa_dist_km**2) / (2.0 * (threat_radius**2)))
    else:
        spatial_risk = 1.0 if cpa_dist_km < 5.0 else 0.0

    # Temporal proximity factor: closer TCPA yields higher urgency only if tracks are converging and in proximity
    is_converging = tcpa_hours > 0
    if is_converging and spatial_risk > 0.001:
        time_factor = 1.0 / (1.0 + (tcpa_hours / 12.0))
    else:
        time_factor = 0.0

    risk_score = round(min(1.0, float(spatial_risk * (0.65 + time_factor * 0.35))), 4)

    # Threat Categorization
    if spatial_risk < 0.005 and cpa_dist_km > threat_radius:
        threat_level = "LOW"
    elif (cpa_dist_km <= 8.0 and 0 < tcpa_hours <= 12.0) or risk_score >= 0.75:
        threat_level = "CRITICAL"
    elif (cpa_dist_km <= 20.0 and 0 < tcpa_hours <= 24.0) or risk_score >= 0.40:
        threat_level = "HIGH"
    elif (cpa_dist_km <= 45.0 and 0 < tcpa_hours <= 48.0) or risk_score >= 0.15:
        threat_level = "MODERATE"
    else:
        threat_level = "LOW"

    return {
        "initial_distance_km": round(initial_dist_km, 1),
        "initial_distance_nm": round(initial_dist_km / 1.852, 1),
        "cpa_distance_km": round(cpa_dist_km, 1),
        "cpa_distance_nm": round(cpa_dist_km / 1.852, 1),
        "tcpa_hours": round(tcpa_hours, 1),
        "risk_score": risk_score,
        "threat_level": threat_level,
        "is_converging": tcpa_hours > 0,
        "threat_radius_km": round(threat_radius, 1)
    }


def evaluate_route_collision_threats(
    waypoints: List[Dict[str, Any]],
    vessel_speed_kts: float,
    active_icebergs: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluates an entire planned route against all active/predicted icebergs.
    Calculates overall route safety, minimum clearance, closest threat, and danger zones.
    """
    if not waypoints or not active_icebergs:
        return {
            "highest_threat_level": "LOW",
            "max_risk_score": 0.0,
            "min_clearance_km": 999.0,
            "threat_iceberg": None,
            "threat_count": 0,
            "safety_rating": "Optimal (Zero Collision Threat)",
            "threat_details": []
        }

    # Step through route waypoints with accumulated transit time
    accum_dist_km = 0.0
    threats = []
    min_clearance = float("inf")
    max_risk = 0.0
    primary_threat = None

    vessel_spd_kmh = vessel_speed_kts * 1.852

    for i in range(len(waypoints)):
        wp = waypoints[i]
        if i > 0:
            step_km = haversine_km(waypoints[i-1]["lat"], waypoints[i-1]["lon"], wp["lat"], wp["lon"])
            accum_dist_km += step_km

        wp_eta_hours = accum_dist_km / max(1.0, vessel_spd_kmh)

        # Check each iceberg
        for berg in active_icebergs:
            b_lat = berg.get("latest_lat") or berg.get("lat", 0.0)
            b_lon = berg.get("latest_lon") or berg.get("lon", 0.0)
            b_spd = berg.get("speed_knots", 0.5)
            b_hdg = berg.get("heading_deg", 0.0)
            b_id = berg.get("iceberg_id", "BERG_ALERT")
            b_size = berg.get("size_sq_km", 200.0)
            b_radius = math.sqrt(max(10.0, b_size) / math.pi)

            # Forecast iceberg position at wp_eta_hours
            drift_km = (b_spd * 1.852) * wp_eta_hours
            b_rad = math.radians(b_hdg)
            dx = drift_km * math.sin(b_rad)
            dy = drift_km * math.cos(b_rad)

            # Approximate predicted lat/lon of iceberg at this time
            pred_b_lat = b_lat + (dy / 111.0)
            pred_b_lon = (b_lon + (dx / (111.0 * max(0.2, math.cos(math.radians(b_lat))))) + 540.0) % 360.0 - 180.0

            dist_at_eta = haversine_km(wp["lat"], wp["lon"], pred_b_lat, pred_b_lon)
            if dist_at_eta < min_clearance:
                min_clearance = dist_at_eta

            # Uncertainty expands with horizon
            unc_radius = 15.0 + (wp_eta_hours * 0.4)
            safe_margin = b_radius + unc_radius + 15.0

            if dist_at_eta <= safe_margin:
                risk_val = math.exp(-(dist_at_eta**2) / (2.0 * (safe_margin**2)))
                threat_info = {
                    "iceberg_id": b_id,
                    "waypoint_index": i,
                    "waypoint_lat": wp["lat"],
                    "waypoint_lon": wp["lon"],
                    "eta_hours": round(wp_eta_hours, 1),
                    "clearance_km": round(dist_at_eta, 1),
                    "safe_margin_km": round(safe_margin, 1),
                    "risk_score": round(risk_val, 3),
                    "level": "CRITICAL" if risk_val >= 0.70 else "HIGH" if risk_val >= 0.40 else "MODERATE"
                }
                threats.append(threat_info)
                if risk_val > max_risk:
                    max_risk = risk_val
                    primary_threat = threat_info

    # Determine overall rating
    if max_risk >= 0.70:
        overall_level = "CRITICAL"
        rating = "Hazard Warning (Immediate Rerouting Required)"
    elif max_risk >= 0.40:
        overall_level = "HIGH"
        rating = "Cautious (Iceberg Proximity Detected)"
    elif max_risk >= 0.15:
        overall_level = "MODERATE"
        rating = "Advisory (Ice Tracking Active)"
    else:
        overall_level = "LOW"
        rating = "Optimal (Zero Collision Threat)"

    return {
        "highest_threat_level": overall_level,
        "max_risk_score": round(max_risk, 4),
        "min_clearance_km": round(min_clearance if min_clearance != float("inf") else 999.0, 1),
        "threat_iceberg": primary_threat["iceberg_id"] if primary_threat else None,
        "primary_threat_detail": primary_threat,
        "threat_count": len(threats),
        "safety_rating": rating,
        "threat_details": sorted(threats, key=lambda x: x["risk_score"], reverse=True)[:5]
    }
