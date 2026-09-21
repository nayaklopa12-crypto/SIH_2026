import re

def fix_weather_tab():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Update switchTab to include 'weather'
    c = c.replace('["tracking","routing","fuel","india","analytics","benchmarks"].forEach', 
                  '["tracking","routing","weather","fuel","india","analytics","benchmarks"].forEach')
    
    # 2. Add weather map toggle logic
    weather_logic = """
    if (tabId === "weather") {
        if (!map.hasLayer(windLayer)) map.addLayer(windLayer);
        // Dim base map slightly for weather view? Or change tiles?
        document.querySelector('.leaflet-tile-pane').style.filter = 'brightness(0.6) contrast(1.2)';
    } else {
        if (map.hasLayer(windLayer)) map.removeLayer(windLayer);
        document.querySelector('.leaflet-tile-pane').style.filter = 'none';
    }
    """
    
    # Insert before the end of switchTab
    c = re.sub(
        r'(if \(tabId === "benchmarks"\))',
        weather_logic + r'\n    \1',
        c
    )

    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_weather_tab()
