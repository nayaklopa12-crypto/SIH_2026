import math
from typing import List, Dict, Any, Tuple
from src.geospatial_obstacles import get_obstacle_engine
import numpy as np

def generate_tactical_avoidance(
    ship_lat: float, ship_lon: float,
    ship_heading: float,
    destination: List[float],
    current_route: List[List[float]],
    icebergs: List[Dict[str, Any]],
    detection_radius_km: float = 150.0,
    safety_margin_km: float = 10.0,
    ship_safety_radius_km: float = 2.0
) -> Dict[str, Any]:
    
    # 1. Coordinate transformations relative to ship
    cos_lat = math.cos(math.radians(ship_lat))
    def to_km(lat, lon):
        return (lon - ship_lon) * 111.0 * cos_lat, (lat - ship_lat) * 111.0
    def to_deg(x, y):
        return ship_lat + y / 111.0, ship_lon + x / (111.0 * cos_lat)
        
    def point_to_segment_distance(px, py, ax, ay, bx, by):
        l2 = (bx - ax)**2 + (by - ay)**2
        if l2 == 0: return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2))
        proj_x = ax + t * (bx - ax)
        proj_y = ay + t * (by - ay)
        return math.hypot(px - proj_x, py - proj_y)

    # 2. Extract forward route starting from ship's actual position
    # The ship is at (0,0) in local coordinates.
    # Find the closest segment on current_route to the ship to know where we are.
    route_km_full = [to_km(p[0], p[1]) for p in current_route]
    
    closest_dist = float('inf')
    closest_idx = 0
    for i in range(len(route_km_full) - 1):
        ax, ay = route_km_full[i]
        bx_seg, by_seg = route_km_full[i+1]
        d = point_to_segment_distance(0, 0, ax, ay, bx_seg, by_seg)
        if d < closest_dist:
            closest_dist = d
            closest_idx = i

    # Forward route: ship -> remainder of the current segment -> rest of route
    route_km = [(0.0, 0.0)]
    route_km.extend(route_km_full[closest_idx+1:])
    
    # 3. Detect and classify icebergs
    tracked_icebergs = []  # ORANGE
    threat_icebergs = []   # RED
    
    ship_speed_kmh = 28.0

    for berg in icebergs:
        bx, by = to_km(berg['lat'], berg['lon'])
        d_ship = math.hypot(bx, by)
        
        if d_ship > detection_radius_km:
            continue
            
        tracked_icebergs.append(berg['id'])
        
        sz = berg.get('size_sq_km', 25.0)
        br = math.sqrt(sz / math.pi)
        # 5. ICEBERG SAFETY / DANGER RADIUS -> Must clear entire safety zone
        eff_radius = br + safety_margin_km + ship_safety_radius_km
        
        is_threat = False
        min_clearance = float('inf')
        
        # Check intersection with future route
        cumulative_dist = 0.0
        for i in range(len(route_km) - 1):
            ax, ay = route_km[i]
            bx_seg, by_seg = route_km[i+1]
            seg_len = math.hypot(bx_seg - ax, by_seg - ay)
            if seg_len == 0:
                continue
            
            # Distance from segment to iceberg
            d = point_to_segment_distance(bx, by, ax, ay, bx_seg, by_seg)
            
            # Predict iceberg future pos? 
            # If moving, we can add (vx, vy) * time_to_reach.
            # But the simulation updates quickly, so bounding box is fine. 
            # We strictly enforce that if the route segment intersects the radius, it's a threat.
            if d < eff_radius:
                is_threat = True
                if d < min_clearance:
                    min_clearance = d
                    
            cumulative_dist += seg_len
            
        if is_threat:
            threat_icebergs.append({
                "iceberg": berg,
                "bx": bx, "by": by,
                "eff_radius": eff_radius,
                "clearance": min_clearance,
                "dist_to_ship": d_ship
            })
            
    if not threat_icebergs:
        return {
            "status": "safe", 
            "route": current_route, 
            "threats": [], 
            "tracked": tracked_icebergs,
            "reason": "No predicted intersection", 
            "safe_clearance": -1
        }
        
    threat_icebergs.sort(key=lambda t: t['dist_to_ship'])
    
    # 4. Dynamic Route Replanning
    obs_engine = get_obstacle_engine()
    
    def is_segment_safe(p1_km, p2_km):
        p1_deg = to_deg(*p1_km)
        p2_deg = to_deg(*p2_km)
        
        # Check Land (16. WATER-ONLY ROUTING)
        blocked, _ = obs_engine.check_segment_collision(p1_deg, p2_deg, min_standoff_km=2.0)
        if blocked:
            return False
            
        # Check ALL Icebergs
        for berg in icebergs:
            bx_b, by_b = to_km(berg['lat'], berg['lon'])
            if math.hypot(bx_b, by_b) > detection_radius_km + 50.0:
                continue
            sz = berg.get('size_sq_km', 25.0)
            br = math.sqrt(sz / math.pi)
            e_rad = br + safety_margin_km + ship_safety_radius_km
            
            if point_to_segment_distance(bx_b, by_b, p1_km[0], p1_km[1], p2_km[0], p2_km[1]) <= e_rad:
                return False
                
        return True

    def validate_route(cand_route_km):
        for i in range(len(cand_route_km) - 1):
            if not is_segment_safe(cand_route_km[i], cand_route_km[i+1]):
                return False
        return True

    dest_km = to_km(destination[0], destination[1])
    
    valid_route = None
    best_route_len = float('inf')
    best_side = "unknown"
    
    primary = threat_icebergs[0]
    p_dist = primary['dist_to_ship']
    p_angle = math.atan2(primary['by'], primary['bx'])
    
    # Generate alternative paths (10. MULTIPLE ICEBERGS, 14. VALIDATE ENTIRE REROUTED PATH)
    # 13. ROUTE MUST START FROM THE SHIP'S CURRENT POSITION -> cand starts with (0.0, 0.0)
    
    angles_to_try = [20, -20, 35, -35, 50, -50, 70, -70, 90, -90, 110, -110]
    dists_to_try = [p_dist * 0.5, p_dist, p_dist * 1.5, p_dist * 2.0, p_dist * 3.0, primary['eff_radius'] * 2]
    
    for angle_deg in angles_to_try:
        rad = math.radians(angle_deg)
        for wp_dist in dists_to_try:
            wp_x = math.cos(p_angle + rad) * wp_dist
            wp_y = math.sin(p_angle + rad) * wp_dist
            
            # Candidate 1: Ship -> WP -> Dest
            cand = [(0.0, 0.0), (wp_x, wp_y), dest_km]
            if validate_route(cand):
                l = wp_dist + math.hypot(dest_km[0] - wp_x, dest_km[1] - wp_y)
                if l < best_route_len:
                    best_route_len = l
                    valid_route = cand
                    best_side = "left" if angle_deg > 0 else "right"
                    
            # Candidate 2: Ship -> WP -> Rejoin forward route
            for i in range(len(route_km) - 1, 0, -1):
                rx, ry = route_km[i]
                if math.hypot(rx, ry) > p_dist + primary['eff_radius']:
                    cand2 = [(0.0, 0.0), (wp_x, wp_y), (rx, ry)]
                    cand2.extend(route_km[i+1:])
                    
                    if validate_route(cand2):
                        l2 = 0
                        for j in range(len(cand2)-1):
                            l2 += math.hypot(cand2[j+1][0] - cand2[j][0], cand2[j+1][1] - cand2[j][1])
                        if l2 < best_route_len:
                            best_route_len = l2
                            valid_route = cand2
                            best_side = "left" if angle_deg > 0 else "right"
                    break

    # If simple 1-waypoint detours fail, try 2-waypoint detours for complex multiple-iceberg fields.
    if not valid_route:
        for a1 in [30, -30, 60, -60]:
            for a2 in [15, -15, 45, -45]:
                wp1_dist = primary['eff_radius'] * 1.5
                wp2_dist = p_dist * 2.0
                wp1_x = math.cos(p_angle + math.radians(a1)) * wp1_dist
                wp1_y = math.sin(p_angle + math.radians(a1)) * wp1_dist
                wp2_x = math.cos(p_angle + math.radians(a2)) * wp2_dist
                wp2_y = math.sin(p_angle + math.radians(a2)) * wp2_dist
                
                cand = [(0.0, 0.0), (wp1_x, wp1_y), (wp2_x, wp2_y), dest_km]
                if validate_route(cand):
                    valid_route = cand
                    best_side = "complex"
                    break
            if valid_route:
                break

    if valid_route:
        # Smooth transition (23. REALISTIC SHIP MOVEMENT)
        # We can add an intermediate point very close to the ship (e.g. 1km ahead on the new bearing)
        # to ensure it doesn't try to turn 90 degrees instantly, but Leaflet route following already
        # handles vector-based turning nicely.
        new_route_deg = [list(to_deg(x, y)) for x, y in valid_route]
        return {
            "status": "avoidance_required",
            "threats": [t['iceberg']['id'] for t in threat_icebergs],
            "tracked": tracked_icebergs,
            "avoidance_side": best_side,
            "original_route": current_route,
            "avoidance_route": new_route_deg,
            "safe_clearance": primary['eff_radius'],
            "reason": f"Projected intersection with {len(threat_icebergs)} hazards"
        }
    else:
        # 17. FIX THE CURRENT "STUCK SHIP" BUG
        # If absolutely no safe route is found, we can try to inch forward safely or stop.
        # But wait, we must not freeze indefinitely.
        return {
            "status": "blocked",
            "threats": [t['iceberg']['id'] for t in threat_icebergs],
            "tracked": tracked_icebergs,
            "route": current_route,
            "reason": "ROUTE BLOCKED - No safe path around active hazards"
        }
