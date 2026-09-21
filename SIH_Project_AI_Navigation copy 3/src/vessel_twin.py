"""
Antarctic Vessel Digital Twin & IMO Polar Code Performance Simulator
====================================================================
Simulates polar vessel dynamics, resistance, powering, and fuel consumption:
1. IMO Polar Code Ice Classes (PC1 to PC7 & Open Water)
2. Hydrodynamic open-water resistance (Holtrop/Harvald formulation)
3. Lindqvist (1989) continuous level ice & pack ice resistance
4. Marine engine brake power demand and Specific Fuel Oil Consumption (SFOC)
5. Instantaneous and voyage fuel burn (tonnes HFO/MGO) and IMO GHG emissions (3.114 t CO2 / t fuel)
6. POLARIS (Polar Operational Limit Assessment Risk Indexing System) RIO score

Transparency & Provenance:
All vessel characteristics are based on IMO Polar Code benchmarks and
published polar naval architecture specifications. Where specific shipboard
telemetry is proprietary, parameters are explicitly tagged as
CONFIGURABLE_DEMONSTRATION_TWIN.
"""

import math
from typing import Dict, List, Any, Optional

# IMO Polar Code Ice Class Definition & Risk Index Values (RIV) for POLARIS
# RIV values for medium first-year ice (0.7 - 1.2m) by ice class:
POLARIS_RIV_TABLE = {
    "PC1": {"label": "Polar Class 1 (Year-round all polar waters)", "riv_medium_ice": 3, "max_safe_ice_m": 3.5},
    "PC2": {"label": "Polar Class 2 (Year-round moderate multi-year)", "riv_medium_ice": 3, "max_safe_ice_m": 2.8},
    "PC3": {"label": "Polar Class 3 (Year-round second-year ice)", "riv_medium_ice": 2, "max_safe_ice_m": 2.2},
    "PC4": {"label": "Polar Class 4 (Year-round thick first-year)", "riv_medium_ice": 2, "max_safe_ice_m": 1.6},
    "PC5": {"label": "Polar Class 5 (Year-round medium first-year)", "riv_medium_ice": 1, "max_safe_ice_m": 1.2},
    "PC6": {"label": "Polar Class 6 (Summer/autumn medium first-year)", "riv_medium_ice": 0, "max_safe_ice_m": 0.9},
    "PC7": {"label": "Polar Class 7 (Summer/autumn thin first-year)", "riv_medium_ice": -1, "max_safe_ice_m": 0.6},
    "NON_ICE": {"label": "Non-Ice-Strengthened (Open Water Only)", "riv_medium_ice": -10, "max_safe_ice_m": 0.0}
}

# Standard Demonstration Vessel Archetypes
VESSEL_ARCHETYPES: Dict[str, Dict[str, Any]] = {
    "MV-MAITRI-SUPPLY": {
        "vessel_id": "MV-MAITRI-SUPPLY",
        "name": "MV Maitri Express (India)",
        "flag": "India",
        "operator": "National Centre for Polar and Ocean Research (NCPOR)",
        "ice_class": "PC5",
        "length_m": 136.0,
        "beam_m": 21.0,
        "draft_m": 7.8,
        "displacement_tonnes": 13500.0,
        "installed_power_kw": 9600.0,
        "design_speed_knots": 14.0,
        "economic_speed_knots": 11.5,
        "sfoc_g_kwh": 178.0,
        "fuel_type": "Marine Gas Oil (MGO) / Low-Sulfur HFO",
        "propulsion_efficiency": 0.65,
        "provenance": "CONFIGURABLE_DEMONSTRATION_TWIN"
    },
    "MV-BHARATI-SUPPLY": {
        "vessel_id": "MV-BHARATI-SUPPLY",
        "name": "MV Bharati Supply (India)",
        "flag": "India",
        "operator": "NCPOR Antarctic Logistics",
        "ice_class": "PC4",
        "length_m": 142.0,
        "beam_m": 22.5,
        "draft_m": 8.2,
        "displacement_tonnes": 15800.0,
        "installed_power_kw": 11200.0,
        "design_speed_knots": 14.5,
        "economic_speed_knots": 12.0,
        "sfoc_g_kwh": 175.0,
        "fuel_type": "MGO / Polar Low-Sulfur Diesel",
        "propulsion_efficiency": 0.66,
        "provenance": "CONFIGURABLE_DEMONSTRATION_TWIN"
    },
    "RV-POLARSTERN": {
        "vessel_id": "RV-POLARSTERN",
        "name": "RV Polarstern (Germany)",
        "flag": "Germany",
        "operator": "Alfred Wegener Institute (AWI)",
        "ice_class": "PC3",
        "length_m": 118.0,
        "beam_m": 25.0,
        "draft_m": 11.2,
        "displacement_tonnes": 17300.0,
        "installed_power_kw": 14700.0,
        "design_speed_knots": 15.5,
        "economic_speed_knots": 10.5,
        "sfoc_g_kwh": 182.0,
        "fuel_type": "MGO",
        "propulsion_efficiency": 0.62,
        "provenance": "CONFIGURABLE_DEMONSTRATION_TWIN"
    },
    "RV-NATHANIEL-PALMER": {
        "vessel_id": "RV-NATHANIEL-PALMER",
        "name": "RV Nathaniel B. Palmer (US)",
        "flag": "USA",
        "operator": "US Antarctic Program (USAP / NSF)",
        "ice_class": "PC5",
        "length_m": 94.0,
        "beam_m": 18.3,
        "draft_m": 6.8,
        "displacement_tonnes": 6600.0,
        "installed_power_kw": 9480.0,
        "design_speed_knots": 14.0,
        "economic_speed_knots": 11.0,
        "sfoc_g_kwh": 180.0,
        "fuel_type": "MGO",
        "propulsion_efficiency": 0.64,
        "provenance": "CONFIGURABLE_DEMONSTRATION_TWIN"
    }
}


class VesselDigitalTwin:
    """
    Simulates polar hydrodynamics, ice interaction resistance, and emissions.
    """
    def __init__(self, spec: Optional[Dict[str, Any]] = None):
        self.spec = spec or VESSEL_ARCHETYPES["MV-MAITRI-SUPPLY"]
        self.L = float(self.spec["length_m"])
        self.B = float(self.spec["beam_m"])
        self.T = float(self.spec["draft_m"])
        self.disp = float(self.spec["displacement_tonnes"])
        self.P_inst = float(self.spec["installed_power_kw"])
        self.sfoc = float(self.spec["sfoc_g_kwh"])
        self.eta = float(self.spec.get("propulsion_efficiency", 0.65))
        self.ice_class = self.spec.get("ice_class", "PC5")

    def open_water_resistance_kn(self, speed_knots: float) -> float:
        """
        Calculates total calm open-water hull hydrodynamic resistance in kilonewtons (kN).
        Uses Harvald / Holtrop empirical regression for full-form polar hull.
        """
        if speed_knots <= 0.1:
            return 0.0
        v_ms = speed_knots * 0.514444
        # Wetted surface area approximation: S = 1.025 * sqrt(disp * L) * 2.6
        s_wetted = 2.58 * math.sqrt(self.disp * self.L)
        # Frictional resistance coefficient (ITTC-1957)
        reynolds = (v_ms * self.L) / 1.83e-6  # kinematic viscosity of cold seawater
        cf = 0.075 / ((math.log10(max(1e5, reynolds)) - 2.0)**2)
        # Total resistance coefficient with form factor (1 + k) and wave resistance
        fn = v_ms / math.sqrt(9.81 * self.L)
        cw = 0.0012 + 0.005 * (fn**3.5)  # Wave resistance coefficient
        cr = cf * 1.35 + cw

        rho_w = 1027.5
        r_total_n = 0.5 * rho_w * s_wetted * (v_ms**2) * cr
        return r_total_n / 1000.0  # Return in kN

    def lindqvist_ice_resistance_kn(
        self,
        speed_knots: float,
        ice_thickness_m: float,
        ice_concentration: float = 0.8
    ) -> float:
        """
        Lindqvist (1989) continuous level ice & pack ice resistance formula in kN.
        R_ice = (R_crushing + R_bending) * (1 + 1.4 * v / sqrt(g*h)) + R_submersion * (1 + 9.4 * v / sqrt(g*L))
        """
        if ice_thickness_m <= 0.01 or ice_concentration <= 0.05 or speed_knots <= 0.1:
            return 0.0

        v_ms = speed_knots * 0.514444
        h = min(2.5, max(0.05, ice_thickness_m))
        conc = min(1.0, max(0.0, ice_concentration))
        g = 9.81
        phi = math.radians(28.0)  # Stem bow angle for polar ice hull
        psi = math.radians(45.0)  # Flare angle

        # Flexural ice strength (polar first-year ice approx 550 kPa)
        sigma_b = 550.0  # kPa
        # Crushing strength
        r_c = 0.5 * sigma_b * (h**2) * (math.tan(phi) / math.sin(psi)) * 0.001

        # Bending strength
        r_b = 0.000027 * (self.B**0.7) * (h**1.5) * sigma_b * 1000.0

        # Submersion resistance
        delta_rho = 1027.5 - 917.0  # density difference (seawater - ice)
        r_s = delta_rho * g * h * self.B * (self.T * (self.B + self.T) / (self.B + 2.0 * self.T)) * 0.001

        # Velocity dependent terms
        f_v1 = 1.0 + 1.4 * (v_ms / math.sqrt(g * h))
        f_v2 = 1.0 + 9.4 * (v_ms / math.sqrt(g * self.L))

        r_lindqvist_level = (r_c + r_b) * f_v1 + r_s * f_v2
        # Scale by ice concentration: in broken/pack ice, resistance drops non-linearly
        r_pack = r_lindqvist_level * (conc**2.2)

        return float(r_pack)

    def calculate_power_and_fuel(
        self,
        speed_knots: float,
        ice_thickness_m: float = 0.0,
        ice_concentration: float = 0.0,
        sea_state_wave_m: float = 2.0
    ) -> Dict[str, Any]:
        """
        Computes total resistance, brake power demand, fuel consumption rate,
        and IMO CO2 emissions for given voyage conditions.
        """
        v_ms = speed_knots * 0.514444
        r_ow = self.open_water_resistance_kn(speed_knots)
        # Added wave resistance (approx 8% per meter of wave height)
        wave_factor = 1.0 + 0.08 * max(0.0, sea_state_wave_m - 1.5)
        r_ow_weather = r_ow * wave_factor

        r_ice = self.lindqvist_ice_resistance_kn(speed_knots, ice_thickness_m, ice_concentration)
        r_total_kn = r_ow_weather + r_ice

        # Required brake power P_b = (R_total * v) / eta_propulsion (kW)
        effective_power_kw = r_total_kn * v_ms
        brake_power_kw = effective_power_kw / max(0.3, self.eta)

        # Engine load fraction
        engine_load_pct = min(110.0, (brake_power_kw / self.P_inst) * 100.0)

        # Hourly fuel rate in metric tonnes/hour: P_b * SFOC * 1e-6
        fuel_rate_t_per_hour = brake_power_kw * self.sfoc * 1e-6
        co2_rate_t_per_hour = fuel_rate_t_per_hour * 3.114  # IMO MEPC GHG carbon factor

        # Specific consumption per nautical mile
        nm_per_hour = max(0.1, speed_knots)
        fuel_tonnes_per_nm = fuel_rate_t_per_hour / nm_per_hour

        # POLARIS calculation for this condition
        riv_info = POLARIS_RIV_TABLE.get(self.ice_class, POLARIS_RIV_TABLE["PC5"])
        riv_score = riv_info["riv_medium_ice"] if ice_thickness_m > 0.3 else 3
        rio = (1.0 - ice_concentration) * 3 + ice_concentration * riv_score

        if rio >= 0:
            polaris_status = "NORMAL_OPERATION (Safe Navigational Envelope)"
        elif rio >= -10:
            polaris_status = "ELEVATED_OPERATIONAL_RISK (Reduced Speed / Escort Recommended)"
        else:
            polaris_status = "PROHIBITED_UNDER_POLAR_CODE (Ice Exceeds Vessel Structural Capability)"

        return {
            "vessel_name": self.spec["name"],
            "ice_class": self.ice_class,
            "speed_knots": speed_knots,
            "conditions": {
                "ice_thickness_m": ice_thickness_m,
                "ice_concentration": ice_concentration,
                "wave_height_m": sea_state_wave_m
            },
            "resistance_breakdown_kn": {
                "open_water_kn": round(r_ow, 1),
                "weather_and_waves_kn": round(r_ow_weather - r_ow, 1),
                "ice_resistance_kn": round(r_ice, 1),
                "total_resistance_kn": round(r_total_kn, 1)
            },
            "powering": {
                "brake_power_required_kw": round(brake_power_kw, 1),
                "installed_power_kw": self.P_inst,
                "engine_load_pct": round(engine_load_pct, 1),
                "power_margin_kw": round(max(0.0, self.P_inst - brake_power_kw), 1)
            },
            "fuel_and_emissions": {
                "fuel_consumption_rate_t_per_h": round(fuel_rate_t_per_hour, 3),
                "co2_emissions_rate_t_per_h": round(co2_rate_t_per_hour, 3),
                "fuel_consumption_per_nm": round(fuel_tonnes_per_nm, 4),
                "carbon_intensity_g_co2_ton_nm": round((fuel_tonnes_per_nm * 3.114 * 1e6) / self.disp, 2)
            },
            "imo_polaris_evaluation": {
                "risk_index_outcome_rio": round(rio, 2),
                "status": polaris_status,
                "guidance": "IMO Circular MSC.1/Circ.1519 Polar Operational Limit Assessment Risk Indexing System"
            },
            "provenance": self.spec.get("provenance", "CONFIGURABLE_DEMONSTRATION_TWIN")
        }
