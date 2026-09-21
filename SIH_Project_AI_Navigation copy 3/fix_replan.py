import re

def fix_replan():
    with open('app/backend/main.py', 'r', encoding='utf-8') as f:
        c = f.read()
    
    # Add operator_opt_in to ReplanRequest
    req_old = """class ReplanRequest(BaseModel):
    current_lat: float
    current_lon: float
    destination_lat: float
    destination_lon: float
    encroaching_iceberg_id: str
    drift_offset_km: float = 30.0"""
    
    req_new = """class ReplanRequest(BaseModel):
    current_lat: float
    current_lon: float
    destination_lat: float
    destination_lon: float
    encroaching_iceberg_id: str
    drift_offset_km: float = 30.0
    operator_opt_in: bool = True"""
    
    c = c.replace(req_old, req_new)
    
    # Pass it to find_path
    router_old = """new_route_result = router.find_path(req.current_lat, req.current_lon, req.destination_lat, req.destination_lon)"""
    router_new = """new_route_result = router.find_path(req.current_lat, req.current_lon, req.destination_lat, req.destination_lon, operator_opt_in=req.operator_opt_in)"""
    
    c = c.replace(router_old, router_new)
    
    with open('app/backend/main.py', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_replan()
