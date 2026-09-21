import time
from playwright.sync_api import sync_playwright

def test_interaction_matrix():
    print("Starting Phase 4: Full Interaction Matrix")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        results = []

        def report(page_name, action, result, status, error=""):
            results.append(f"{page_name} | {action} | {result} | {status} | {error}")
            print(results[-1])

        try:
            # 1. Main App Page
            page.goto("http://localhost:8000/")
            page.wait_for_load_state('networkidle')
            
            # Find a link to map or navigator
            nav_link = page.locator("a[href='/navigator'], a[href='/map'], a[href='/simulation']")
            if nav_link.count() > 0:
                nav_link.first.click(force=True)
                page.wait_for_load_state('networkidle')
                report("Landing", "Click Enter App", f"Navigated to {page.url}", "PASS")
            else:
                report("Landing", "Click Enter App", "Link not found", "SKIP")
            
            # 2. Navigator Page explicitly
            page.goto("http://localhost:8000/navigator")
            page.wait_for_load_state('networkidle')
            
            # Check Tabs
            tabs = ['tracking', 'routing', 'weather', 'fuel', 'india', 'analytics', 'benchmarks']
            for tab in tabs:
                btn = page.locator(f"#tab-btn-{tab}")
                if btn.count() > 0:
                    btn.click(force=True)
                    panel = page.locator(f"#tab-{tab}")
                    if panel.count() > 0 and panel.is_visible():
                        report("Navigator", f"Click Tab {tab}", f"Panel {tab} visible", "PASS")
                    else:
                        report("Navigator", f"Click Tab {tab}", f"Panel {tab} NOT visible", "FAIL")

            # Go to Routing tab
            page.locator("#tab-btn-routing").click(force=True)
            time.sleep(0.5)

            # Route Planner
            btn_route = page.locator("#btn-optimize-route")
            if btn_route.count() > 0:
                btn_route.click(force=True)
                try:
                    page.wait_for_selector("#res-distance", timeout=10000)
                    dist = page.locator("#res-distance").inner_text()
                    if dist and dist != "--":
                        report("Navigator", "Compute A* Route", f"Route rendered, dist={dist}", "PASS")
                    else:
                        report("Navigator", "Compute A* Route", "Stats not updated", "FAIL")
                except Exception as e:
                    report("Navigator", "Compute A* Route", "Timeout waiting for route", "FAIL", str(e))
            
            # 3. Radar Simulation
            page.goto("http://localhost:8000/radar")
            page.wait_for_load_state('networkidle')
            
            # Verify mission change doesn't crash
            msel = page.locator("#mission-select")
            if msel.count() > 0:
                msel.select_option(value="capetown-maitri")
                report("Radar", "Change Mission", "Mission changed", "PASS")
            
            # Close HUD
            close_btn = page.locator(".hud-target-close")
            if close_btn.count() > 0:
                if close_btn.is_visible():
                    close_btn.click(force=True)
                    if not page.locator("#hud-target-card").is_visible():
                        report("Radar", "Close HUD", "HUD hidden", "PASS")
                    else:
                        report("Radar", "Close HUD", "HUD still visible", "FAIL")

            # 4. Dashboard
            page.goto("http://localhost:8000/dashboard")
            page.wait_for_load_state('networkidle')
            if "/dashboard" in page.url:
                report("Dashboard", "Load Dashboard", "Dashboard loaded", "PASS")

        except Exception as e:
            print(f"Matrix Script crashed: {e}")

        finally:
            browser.close()
            
    print("\n--- FINAL MATRIX RESULTS ---")
    for r in results:
        print(r)

if __name__ == "__main__":
    test_interaction_matrix()
