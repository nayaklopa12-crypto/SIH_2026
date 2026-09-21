import re

def fix_all_ternaries():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    
    c = c.replace('v.id === "MV-BHARATI-SUPPLY" "Polar Class', 'v.id === "MV-BHARATI-SUPPLY" ? "Polar Class')
    c = c.replace('v.id === "RV-POLARSTERN" "Polar Class', 'v.id === "RV-POLARSTERN" ? "Polar Class')
    c = c.replace('v.id === "RV-NATHANIEL-PALMER" "Polar Class', 'v.id === "RV-NATHANIEL-PALMER" ? "Polar Class')
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_all_ternaries()
