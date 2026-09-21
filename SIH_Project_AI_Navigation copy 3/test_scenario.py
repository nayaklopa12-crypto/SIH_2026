import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def run_scenario():
    print("--- SCENARIO START ---")
    
    # 1. Select a real iceberg
    response = requests.get(f"{BASE_URL}/api/icebergs").json()
    icebergs = response.get("icebergs", [])
    # Find a good iceberg with enough data
    berg_id = None
    for b in icebergs:
        if b.get("iceberg_id") == "A23A":
            berg_id = b["iceberg_id"]
            break
    if not berg_id:
        berg_id = icebergs[0]["iceberg_id"]
    
    print(f"1. Selected Iceberg: {berg_id}")
    
    # 2. Historical trajectory
    track_res = requests.get(f"{BASE_URL}/api/icebergs/{berg_id}/track").json()
    track = track_res.get("track", [])
    current_pos = track[-1]
    print(f"2. Current position: lat={current_pos['lat']}, lon={current_pos['lon']}, date={current_pos['date']}")
    
    # 3 & 4. GRU Forecast & MC Dropout Uncertainty
    predict_req = {
        "iceberg_id": berg_id,
        "history": track,
        "horizon_hours": 24,
        "enable_mc_dropout": True
    }
    pred_res = requests.post(f"{BASE_URL}/api/predict", json=predict_req).json()
    print("\n[AI PREDICTION - 24h Horizon]")
    
    forecasts = pred_res.get("forecasts", {})
    forecast_24h = forecasts.get("24h", {})
    gru_forecast = forecast_24h.get("gru_prediction", {})
    uncertainty = gru_forecast.get('uncertainty_radius_km', 0.0)
    
    print(f"Predicted Position (24h): lat={gru_forecast.get('lat')}, lon={gru_forecast.get('lon')}")
    print(f"Uncertainty Radius (95% CI): {uncertainty:.2f} km")
    
    # 5 & 6. India Mission Voyage & Initial A* Route
    # We will simulate a route that directly intersects the iceberg's current position to force a CRITICAL threat.
    # We will start 1 degree South, and go to 1 degree North of the iceberg.
    start_lat = current_pos['lat'] - 0.5
    start_lon = current_pos['lon']
    goal_lat = current_pos['lat'] + 0.5
    goal_lon = current_pos['lon']
    
    route_req = {
        "start_lat": start_lat,
        "start_lon": start_lon,
        "goal_lat": goal_lat,
        "goal_lon": goal_lon,
        "fuel_profile": "balanced"
    }
    route_res = requests.post(f"{BASE_URL}/api/route/optimize", json=route_req).json()
    route = route_res.get("modes", {}).get("balanced", {}).get("waypoints", [])
    print(f"6. Initial A* route length: {len(route)} waypoints")
    print(f"   Route Start: lat={start_lat}, lon={start_lon}")
    print(f"   Route Goal: lat={goal_lat}, lon={goal_lon}")
    
    # 7-13. Replan endpoint which does CPA/TCPA and replanning
    replan_req = {
        "current_lat": current_pos['lat'] - 0.5,
        "current_lon": current_pos['lon'],
        "destination_lat": current_pos['lat'] + 0.5,
        "destination_lon": current_pos['lon'],
        "encroaching_iceberg_id": berg_id,
        "drift_offset_km": max(15.0, uncertainty)
    }
    replan_res = requests.post(f"{BASE_URL}/api/route/replan", json=replan_req).json()
    
    print("\nInitial CPA/TCPA assessment:")
    if "detail" in replan_res:
        print("Error from API:", replan_res["detail"])
    else:
        threat = replan_res.get("threat_assessment", {})
        print(f"  CPA: {threat.get('cpa_km')} km")
        print(f"  TCPA: {threat.get('tcpa_hours')} hours")
        print(f"  Threat Level: {threat.get('threat_level')}")
        
        if replan_res.get("replanning_needed"):
            print("11/12/13. Dynamic Replanning triggered!")
            print(f"  Reason: {replan_res.get('trigger_reason')}")
            metrics = replan_res.get("metrics_comparison", {})
            print(f"  New CPA: {replan_res.get('threat_assessment', {}).get('cpa_km', 'N/A')} km (Simulated as Avoided)")
            print(f"  Extra Distance: {metrics.get('additional_distance_km')} km")
            print(f"  Extra Fuel: {metrics.get('additional_fuel_tonnes')} tonnes")
        else:
            print("No replanning was needed.")
            
    print("\n--- SCENARIO END ---")

if __name__ == "__main__":
    run_scenario()
