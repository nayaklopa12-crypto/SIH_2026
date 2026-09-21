import time
import json
from playwright.sync_api import sync_playwright

def test_autonomous_closed_loop():
    print("Starting Phase 8: Autonomous Closed-Loop Browser Tests")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        
        try:
            page.goto("http://localhost:8000/radar")
            page.wait_for_load_state('networkidle')
            
            print("Waiting for initial route computation...")
            time.sleep(4) 

            page.locator("#mission-select").select_option(value="capetown-maitri")
            time.sleep(4)

            print("Injecting an iceberg directly in front of the vessel (within 110km radar range)...")
            page.evaluate("""
                const nextWp = corridorWaypoints[currentWpIndex + 1];
                const threat = {
                  id: "TEST-THREAT-1",
                  lat: nextWp[0],
                  lon: nextWp[1],
                  vx: 0.0,
                  vy: 0.0,
                  size_sq_km: 100.0,
                  risk_level: "Critical"
                };
                icebergMarkers.push(
                  L.marker([threat.lat, threat.lon], { icon: L.divIcon({className: 'iceberg-3d-wrapper'}) }).addTo(map)
                );
                icebergMarkers[icebergMarkers.length - 1].bergData = threat;
                
                console.log("Injected threat at", threat.lat, threat.lon);
                tacticalReplanInProgress = false;
                checkTacticalEnvironment();
            """)

            try:
                page.wait_for_selector("#target-header-title:has-text('TACTICAL AVOIDANCE ACTIVE')", timeout=10000)
                print("[PASS] Tactical Avoidance Active HUD triggered.")
            except Exception as e:
                print(f"[FAIL] Tactical Avoidance did not trigger: {e}")
            
            print("Injecting an un-navigable massive ice wall right in front to test HALT...")
            page.evaluate("""
                const wallWp = corridorWaypoints[currentWpIndex + 1];
                const block = {
                  id: "ICE-WALL",
                  lat: wallWp[0],
                  lon: wallWp[1],
                  vx: 0.0,
                  vy: 0.0,
                  size_sq_km: 99999999.0, // Colossal, will cover everything
                  risk_level: "Critical"
                };
                icebergMarkers.push(
                  L.marker([block.lat, block.lon], { icon: L.divIcon({className: 'iceberg-3d-wrapper'}) }).addTo(map)
                );
                icebergMarkers[icebergMarkers.length - 1].bergData = block;
                console.log("Injected block at", block.lat, block.lon);
                
                tacticalReplanInProgress = false;
                checkTacticalEnvironment();
            """)

            try:
                page.wait_for_selector("#hud-status:has-text('ROUTE BLOCKED')", timeout=10000)
                print("[PASS] Route Blocked correctly triggered.")
            except Exception as e:
                print(f"[FAIL] Route Blocked did not trigger: {e}")
                
        except Exception as e:
            print(f"Test crashed: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_autonomous_closed_loop()
