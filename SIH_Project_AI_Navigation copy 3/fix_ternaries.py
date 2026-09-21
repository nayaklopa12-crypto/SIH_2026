import re

def fix_ternaries():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    
    c = c.replace('isIndia "#0a1628" : (isPort "#1e3a5f" : "#0c3460")', 'isIndia ? "#0a1628" : (isPort ? "#1e3a5f" : "#0c3460")')
    c = c.replace('const wps = mode === "india" lastIndiaWaypoints : lastRouteWaypoints;', 'const wps = mode === "india" ? lastIndiaWaypoints : lastRouteWaypoints;')
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_ternaries()
