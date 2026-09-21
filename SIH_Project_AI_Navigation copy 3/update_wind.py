def update_wind_arrows():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()

    # Modify loadWindArrows to also draw the storm zones visually
    weather_viz = """
async function loadWindArrows() {
  windLayer.clearLayers();
  
  // Draw Storm 1 at Weddell Sea (-62, -45)
  L.circle([-62.0, -45.0], {
    color: '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.15,
    radius: 800000, // 800km
    weight: 1
  }).addTo(windLayer).bindPopup("Severe Polar Cyclone<br>Wind: 65+ knots");

  // Draw Storm 2 at East Antarctica (-65, 100)
  L.circle([-65.0, 100.0], {
    color: '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.15,
    radius: 600000, // 600km
    weight: 1
  }).addTo(windLayer).bindPopup("Severe Polar Cyclone<br>Wind: 55+ knots");

  const gridPoints = [];
"""
    c = c.replace('async function loadWindArrows() {\n  windLayer.clearLayers();\n  const gridPoints = [];', weather_viz)
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    update_wind_arrows()
