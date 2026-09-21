import re

def fix_replan_ui():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()

    # Find the block inside simulateDynamicReplan
    pattern = r'(L\.circle\(\[midLat-0\.4.*?addTo\(routeLayer\);)\s*if \(data\.replanning_needed && data\.new_route\?\.waypoints\) \{'
    
    replacement = r"""\1
      if (data.new_route && (data.new_route.status === "ROUTE_BLOCKED" || !data.new_route.waypoints.length)) {
        document.getElementById("replan-alert-box").classList.remove("hidden");
        document.getElementById("replan-alert-msg").innerHTML = `<b>? REPLAN FAILED:</b> ${data.new_route.message || 'No safe detour found.'}`;
        if (routeCruiseTimer) clearInterval(routeCruiseTimer);
        const badge = document.getElementById("voyage-status-badge");
        if (badge) { badge.className = "voyage-chip halted"; badge.innerText = "? PROPULSION HALTED"; }
      } else if (data.replanning_needed && data.new_route?.waypoints) {"""
      
    c, count = re.subn(pattern, replacement, c, flags=re.DOTALL)
    print("Replaced:", count)
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_replan_ui()
