# Autonomous Iceberg Detection and Avoidance Implementation

## Goal
Implement a real-time, closed-loop autonomous navigation system where the ship proactively detects, predicts, and steers clear of dynamic icebergs without violating exclusion zones, without oscillating, and without clipping through other hazards.

## System Architecture

The implementation successfully closes the loop between the visual frontend and the intelligence backend:

1.  **Frontend State Machine (`app/frontend/radar_simulation.html`)**:
    *   A continuous asynchronous loop `checkTacticalEnvironment()` polls every 10 frames during animation.
    *   It samples the ship's current `[lat, lon]`, heading, and the remaining `corridorWaypoints`.
    *   It posts to `/api/route/avoid-iceberg` and awaits a tactical response.
    *   **Oscillation Prevention**: Explicit states (`NORMAL_NAVIGATION`, `AVOIDING_LEFT`, `AVOIDING_RIGHT`, `RETURN_TO_ROUTE`) lock the ship's decision. Once an avoidance maneuver is initiated, it commits until it merges back with the original route.

2.  **Ship Trajectory & Physics**:
    *   Removed localized hardcoded repulsive vectors from `computeNextStep()`. 
    *   The ship's physics model is strictly bound to `corridorWaypoints`. 
    *   When the API mandates avoidance, the backend's exact Bezier curve route is spliced into the waypoint array, meaning the ship accurately steers and physically traces the safety corridor.

3.  **Backend Tactical Avoidance (`src/tactical_avoidance.py`)**:
    *   **Generation**: Generates smooth Bezier curves laterally offset from the route segment intersecting the iceberg's effective radius.
    *   **Strict Verification**: Implemented a robust validation step that strictly computes point-to-segment distances for the ENTIRE proposed curve against ALL icebergs, not just the primary threat. 
    *   **Dynamic Push**: The algorithm iteratively expands the curve outwards (`1.5x` up to `4.0x` the safety radius). If it finds a safe path on the left, it takes it; else it tries right; else it scales outward. If it cannot find a path, it safely refuses to traverse and reports `blocked`.
    *   **Safe Waypoint Snapping**: It strictly avoids snapping the avoidance curve's start/end points into the effective radius of neighboring sequential icebergs, preventing multi-iceberg cascading collisions.

## Verification & Testing

### 1. Deterministic Unit Tests
Implemented 12 strict edge-case scenarios in `test_tactical_scenarios.py`:
- `test_scenario_01_clear_path`: Safe route.
- `test_scenario_02_single_iceberg_dead_ahead`: Left turn avoidance.
- `test_scenario_03_left_blocked_choose_right`: Validates secondary right-turn choice.
- `test_scenario_04_right_blocked_choose_left`: Validates primary left-turn choice.
- `test_scenario_05_both_blocked_no_safe_path`: Huge ice-wall forces a safe `blocked` response.
- `test_scenario_06_distant_iceberg_ignored`: Detection radius limits false positives.
- `test_scenario_07_multiple_sequential_icebergs`: Strict collision mapping for sequential targets.
- `test_scenario_08_iceberg_on_destination`: Iceberg covering the terminal berth forces a `blocked` result.
- `test_scenario_09_large_iceberg_wide_evasion`: Giant icebergs scale the Bezier curve safely outwards.
- `test_scenario_10_small_iceberg_tight_evasion`: Minimally invasive turning radius for small bergs.
- `test_scenario_11_route_points_interpolation`: High waypoint density around curves.
- `test_scenario_12_already_past_iceberg`: Ensures icebergs behind the ship's plane are ignored.

All 12 scenarios pass successfully.

### 2. Full Backend Test Suite
Executed the full Python unit test suite:
*   Ran 53 tests across all modules.
*   **Result**: `OK` (53/53 tests pass).

### 3. Stress Testing
Developed and ran `test_stress_tactical.py` to bombard the tactical endpoint with 150 randomized iceberg configurations consisting of clustered sizes and unpredictable distributions.
*   **Safe / Avoidance Generated**: 126 maneuvers.
*   **Safely Blocked (No Valid Path)**: 24 refusals (expected when clusters fully block the trajectory).
*   **Crashes / Exceptions**: 0.
*   **Result**: `PASS`.
