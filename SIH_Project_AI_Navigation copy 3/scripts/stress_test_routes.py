import asyncio
import random
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.route_optimizer import AStarMaritimeRouter, RiskGrid

def validate_route(route_pts):
    if not route_pts:
        return {"valid": False, "issues": ["Empty route"], "minimum_clearance_km": 0, "route_length_km": 0}
    issues = []
    min_clearance = 9999
    length_km = 0
    from src.geospatial_obstacles import haversine_km, get_obstacle_engine
    engine = get_obstacle_engine()
    
    for i in range(len(route_pts) - 1):
        lat1, lon1 = route_pts[i]["lat"], route_pts[i]["lon"]
        lat2, lon2 = route_pts[i+1]["lat"], route_pts[i+1]["lon"]
        
        dist = haversine_km(lat1, lon1, lat2, lon2)
        length_km += dist
        
        # Check segment clearance
        res = engine.check_segment_clearance(lat1, lon1, lat2, lon2)
        is_clear = res["is_clear"]
        clr = res["min_clearance_km"]
        
        min_clearance = min(min_clearance, clr)
        
        if not is_clear:
            issues.append(f"Segment {i} intersects land/coast (Clearance: {clr:.2f}km)")
            
    for p in route_pts:
        if p["lat"] > -50 or p["lat"] < -85:
            issues.append(f"Point {p} out of bounds")
            
    valid = len(issues) == 0
    return {
        "valid": valid,
        "issues": issues,
        "minimum_clearance_km": round(min_clearance, 2) if min_clearance != 9999 else 0,
        "route_length_km": round(length_km, 2)
    }

async def run_stress_test():
    grid = RiskGrid(lat_min=-85.0, lat_max=-50.0, resolution_deg=0.5)
    router = AStarMaritimeRouter(grid)
    
    random.seed(42)
    success = 0
    failed = 0
    invalid = 0
    
    print("Running 50 Route Stress Tests...")
    for i in range(50):
        # Generate random start/end in Southern Ocean
        slat = random.uniform(-75.0, -60.0)
        slon = random.uniform(-180, 180)
        glat = random.uniform(-75.0, -60.0)
        glon = random.uniform(-180, 180)
        
        try:
            res = router.find_path(slat, slon, glat, glon)
            if res.get("route_found"):
                val = validate_route(res["waypoints"])
                if val["valid"]:
                    success += 1
                else:
                    invalid += 1
                    print(f"Scenario {i} Invalid: {val['issues']}")
            else:
                failed += 1
        except Exception as e:
            import traceback; traceback.print_exc()
            invalid += 1
            
    print(f"\nResults: Success: {success}, Failed (No route/Blocked): {failed}, Invalid/Crash: {invalid}")

if __name__ == "__main__":
    asyncio.run(run_stress_test())
