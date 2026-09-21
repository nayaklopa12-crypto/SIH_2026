import time
import math
import json
from playwright.sync_api import sync_playwright

def get_clearance(ship_lat, ship_lon, icebergs):
    min_c = float('inf')
    for b in icebergs:
        dist = math.hypot((b['lon'] - ship_lon) * 111.0 * math.cos(math.radians(ship_lat)), (b['lat'] - ship_lat) * 111.0)
        eff_radius = math.sqrt(b['size_sq_km'] / math.pi) + 10.0 + 2.0
        clearance = dist - eff_radius
        if clearance < min_c:
            min_c = clearance
    return min_c

def run_autonomous_scenario(context, name, setup_script, timeout_steps=40):
    print(f"\n--- SCENARIO: {name} ---")
    page = context.new_page()
    page.goto("http://localhost:8000/radar")
    page.wait_for_load_state('networkidle')
    time.sleep(3)
    page.locator("#mission-select").select_option(value="capetown-maitri")
    time.sleep(3)
    
    page.evaluate("""
        window.testShipLog = [];
        window.isRecording = true;
        const origComp = computeNextStep;
        computeNextStep = function() {
            origComp();
            if (window.isRecording) {
                window.testShipLog.push({
                    lat: shipPos[0],
                    lon: shipPos[1],
                    heading: currentHeading,
                    status: document.getElementById('hud-status').innerText,
                    wpIdx: currentWpIndex
                });
            }
        };
    """)

    icebergs = page.evaluate(setup_script)
    time.sleep(1)
    
    page.evaluate("tacticalReplanInProgress = false; checkTacticalEnvironment();")
    
    min_clearance = float('inf')
    rejoined = False
    blocked = False
    route_changed = False
    
    for _ in range(timeout_steps):
        time.sleep(1)
        log = page.evaluate("window.testShipLog")
        status = page.evaluate("document.getElementById('hud-status').innerText")
        route_changed = page.evaluate("tacticalReplanInProgress") or "TACTICAL AVOIDANCE" in status
        
        if "ROUTE BLOCKED" in status or "PROPULSION HALTED" in status:
            blocked = True
            break
            
        if len(log) > 0:
            last = log[-1]
            c = get_clearance(last['lat'], last['lon'], icebergs)
            if c < min_clearance:
                min_clearance = c
                
            if "NORMAL NAVIGATION" in status and last['wpIdx'] > 5:
                rejoined = True
                break

    page.close()
    
    print(f"Triggered Avoidance: {route_changed}")
    print(f"Blocked: {blocked}")
    print(f"Min Clearance: {min_clearance:.2f} km")
    print(f"Rejoined: {rejoined}")

def run_all_tests():
    print("STARTING FULL REGRESSION & AUTONOMOUS TEST SUITE")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        
        print("\n=== PAGE LOAD & INTERACTION MATRIX ===")
        routes = ["/", "/map", "/navigator", "/radar", "/simulation", "/dashboard"]
        for r in routes:
            page = ctx.new_page()
            res = page.goto(f"http://localhost:8000{r}")
            is_blank = page.evaluate('document.body.innerHTML.trim() === ""')
            print(f"Route {r} | Status: {res.status} | Blank: {is_blank}")
            page.close()
            
        print("\n=== IFRAME TEST ===")
        page = ctx.new_page()
        page.goto("http://localhost:8000/") # The React UI embeds iframe
        time.sleep(3)
        frames = page.frames
        sim_frame = next((f for f in frames if "simulation" in f.url or "radar" in f.url), None)
        print(f"IFrame Found in new UI: {sim_frame is not None}")
        
        page.goto("http://localhost:8000/navigator")
        time.sleep(3)
        frames = page.frames
        sim_frame = next((f for f in frames if "simulation" in f.url or "radar" in f.url), None)
        print(f"IFrame Found in navigator: {sim_frame is not None}")
        page.close()

        print("\n=== AUTONOMOUS SCENARIOS ===")
        
        test_autonomous_scenario(ctx, "No conflict", "() => { return []; }")
        
        test_autonomous_scenario(ctx, "Direct iceberg", """() => {
            const wp = corridorWaypoints[currentWpIndex + 5];
            const threat = { lat: wp[0], lon: wp[1], size_sq_km: 50.0, risk_level: "Critical" };
            icebergMarkers.push(L.marker([threat.lat, threat.lon]).addTo(map));
            icebergMarkers[icebergMarkers.length - 1].bergData = threat;
            return [threat];
        }""")
        
        test_autonomous_scenario(ctx, "Blocked corridor", """() => {
            const wp = corridorWaypoints[currentWpIndex + 5];
            const threat = { lat: wp[0], lon: wp[1], size_sq_km: 99999999.0, risk_level: "Critical" };
            icebergMarkers.push(L.marker([threat.lat, threat.lon]).addTo(map));
            icebergMarkers[icebergMarkers.length - 1].bergData = threat;
            return [threat];
        }""")
        
        browser.close()
        print("ALL TESTS COMPLETED")

if __name__ == "__main__":
    run_all_tests()
