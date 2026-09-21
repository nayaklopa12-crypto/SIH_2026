# Frontend Interaction Inventory

## Landing Page (/)
1. **Explore Map**: Click -> Navigates to `/navigator`
2. **Simulation**: Click -> Navigates to `/simulation` (or 3D radar)
3. **Dashboard**: Click -> Navigates to `/dashboard`
4. **Learn More**: Click -> Scrolls/Action
5. **Get Started**: Click -> Action
6. **Navbar Home**: Click -> Navigates to `/`

## Navigator (/navigator or index.html)
1. **MISSION CONTROL Button**: Navigates to `/dashboard`
2. **3D RADAR Button**: Navigates to `/radar`
3. **HOME Button**: Navigates to `/`
4. **SIH Demo Toggle**: Toggles presentation mode
5. **Tab - Track**: Shows tracking panel
6. **Tab - Route**: Shows routing panel
7. **Tab - Weather**: Shows weather panel
8. **Tab - Fuel**: Shows fuel panel
9. **Iceberg Select Dropdown**: Selects iceberg scenario -> updates map markers
10. **Playback Slider**: Scrubs timeline -> updates positions
11. **Play/Stop Buttons**: Toggles playback -> updates map markers dynamically
12. **+24/+48 Hours Buttons**: Sets prediction horizon
13. **Run Prediction Button**: Fetches trajectory API -> renders path
14. **Route Start/Goal Select**: Sets routing origin/destination
15. **Risk Weight Slider**: Adjusts routing weights
16. **Include Live Iceberg Checkbox**: Toggles dynamic hazards in A*
17. **Compute A* Route Button**: Submits API call -> renders route, updates metrics
18. **Simulate Iceberg Replan Button**: Triggers specific obstacle injection -> reroutes
19. **3D Tactical Radar Simulation Button**: Launches radar simulation
20. **Plan Multi-Stop Voyage Button**: Submits API call for multi-waypoint -> renders path

## Radar Simulation (/radar or radar_simulation.html)
1. **Return to Dashboard**: Navigates to `/dashboard`
2. **Return to Navigator**: Navigates to `/navigator`
3. **Return to Home**: Navigates to `/`
4. **Mission Select Dropdown**: Sets mission -> sets route internally
5. **Play/Pause Button**: Toggles `isPaused` -> stops/starts animation loop
6. **Restart Voyage**: Resets ship to start of route
7. **Generate Fresh Iceberg Scenario**: Fetches new random obstacle layout
8. **Speed Controls (0.5x, 1x, 2.5x, 5x)**: Changes `simSpeed` variable
9. **Camera Controls (Command, Follow, Tactical, Topdown, Closeup)**: Adjusts Three.js camera position/target
10. **HUD Target Close (X)**: Hides `hud-target-card`

## Dashboard (/dashboard)
1. **Filters / Tabs**: Navigates dashboard views
2. **Charts**: Interactive tooltips
3. **Refresh**: Reloads data
4. **Cards**: Clickable elements navigating to detailed logs or tracking

*This inventory covers the major intended interactive elements across the application.*
