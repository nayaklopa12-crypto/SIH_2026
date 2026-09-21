import re

def fix_replan_ui():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()

    logic = """
      const data = await res.json();
      L.circle([midLat-0.4, midLon+0.5], {radius:35000, color:"#7f1d1d", weight:2, fillColor:"#7f1d1d", fillOpacity:0.22}).bindPopup("<b>?? Encroaching Iceberg</b>").addTo(routeLayer);
      
      if (data.new_route && (data.new_route.status === "ROUTE_BLOCKED" || !data.new_route.waypoints.length)) {
        document.getElementById("replan-alert-box").classList.remove("hidden");
        document.getElementById("replan-alert-msg").innerHTML = `<b>? REPLAN FAILED:</b> ${data.new_route.message || 'No safe detour found.'}`;
        if (routeCruiseTimer) clearInterval(routeCruiseTimer);
        document.getElementById("voyage-status-badge").className = "voyage-chip halted";
        document.getElementById("voyage-status-badge").innerText = "? PROPULSION HALTED";
      } else if (data.replanning_needed && data.new_route?.waypoints) {
        document.getElementById("replan-alert-box").classList.remove("hidden");
        document.getElementById("replan-alert-msg").innerText = "Danger! Berg within 25 km - AI computed collision-free detour.";
"""
    
    old_logic = """
      const data = await res.json();
      L.circle([midLat-0.4, midLon+0.5], {radius:35000, color:"#7f1d1d", weight:2,
        fillColor:"#7f1d1d", fillOpacity:0.22}).bindPopup("<b>?? Encroaching Iceberg</b>").addTo(routeLayer);
      if (data.replanning_needed && data.new_route?.waypoints) {
        document.getElementById("replan-alert-box").classList.remove("hidden");
        document.getElementById("replan-alert-msg").innerText = "Danger! Berg within 25 km - AI computed collision-free detour.";"""
    
    # Strip exactly matching parts or use regex
    c = c.replace(old_logic.strip(), logic.strip())
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_replan_ui()
