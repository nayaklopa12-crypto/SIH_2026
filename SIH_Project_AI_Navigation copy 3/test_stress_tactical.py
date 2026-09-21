import random
import time
from src.tactical_avoidance import generate_tactical_avoidance

def run_stress_test():
    print("Starting Tactical Avoidance Stress Test (150 Scenarios)...")
    ship_lat, ship_lon = -60.0, -60.0
    current_route = [
        [-60.0, -60.0],
        [-60.5, -60.0],
        [-61.0, -60.0],
        [-61.5, -60.0],
        [-62.0, -60.0],
        [-62.5, -60.0],
        [-63.0, -60.0]
    ]

    success = 0
    blocked = 0
    failed_crashing = 0

    random.seed(42)

    for i in range(150):
        # Generate 1 to 5 random icebergs around the route
        num_icebergs = random.randint(1, 5)
        icebergs = []
        for j in range(num_icebergs):
            lat = random.uniform(-63.0, -59.5)
            lon = random.uniform(-60.5, -59.5)
            size = random.uniform(1.0, 500.0)
            icebergs.append({
                "id": f"ICE-{i}-{j}",
                "lat": lat, "lon": lon,
                "size_sq_km": size
            })
            
        try:
            res = generate_tactical_avoidance(ship_lat, ship_lon, current_route, icebergs)
            if res["status"] in ["safe", "avoidance_required"]:
                success += 1
            elif res["status"] == "blocked":
                blocked += 1
            else:
                failed_crashing += 1
        except Exception as e:
            print(f"Exception in scenario {i}: {e}")
            failed_crashing += 1

    print(f"Stress Test Complete.")
    print(f"  Safe / Avoidance Generated: {success}")
    print(f"  Safely Blocked (No Valid Path): {blocked}")
    print(f"  Crashes / Exceptions: {failed_crashing}")
    
    if failed_crashing == 0:
        print("RESULT: PASS")
    else:
        print("RESULT: FAIL")

if __name__ == "__main__":
    run_stress_test()
