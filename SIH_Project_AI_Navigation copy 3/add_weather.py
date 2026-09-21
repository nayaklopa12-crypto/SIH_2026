import re

def add_weather_to_astar():
    with open('src/route_optimizer.py', 'r', encoding='utf-8') as f:
        c = f.read()

    # We need to add weather risk to AStarMaritimeRouter
    # Let's add a mock cyclone at (-62.0, -45.0) which is a common storm path in the Weddell Sea
    # And another at (-65.0, 100.0)
    weather_logic = """
                # Weather Risk Calculation (Severe polar cyclones)
                weather_risk = 0.0
                storm1_dist = haversine_km(n_lat, n_lon, -62.0, -45.0)
                if storm1_dist < 800.0:
                    weather_risk = max(0.0, 1.0 - (storm1_dist / 800.0))
                
                storm2_dist = haversine_km(n_lat, n_lon, -65.0, 100.0)
                if storm2_dist < 600.0:
                    weather_risk = max(weather_risk, 1.0 - (storm2_dist / 600.0))
                
                risk = self.risk_grid.get_risk_at(n_lat, n_lon)
                # Combine physical iceberg risk and weather risk
                combined_risk = max(risk, weather_risk * 0.8) # Weather caps at 0.8 so it doesn't block entirely like an iceberg
                
                edge_cost = step_dist * (1.0 + self.fuel_weight * 0.05 + self.risk_weight * (combined_risk**2))
    """
    
    # Replace the old edge_cost calculation
    old_logic = """                risk = self.risk_grid.get_risk_at(n_lat, n_lon)
                edge_cost = step_dist * (1.0 + self.fuel_weight * 0.05 + self.risk_weight * (risk**2))"""
    
    c = c.replace(old_logic, weather_logic)
    
    with open('src/route_optimizer.py', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    add_weather_to_astar()
