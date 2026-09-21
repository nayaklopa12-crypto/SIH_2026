import re

def fix_all_ternaries():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    
    c = c.replace("const tag = prov prov.split(' ')[0] : 'VERIFIED';", "const tag = prov ? prov.split(' ')[0] : 'VERIFIED';")
    c = c.replace("const name = iceInfo.name (iceInfo.name) : bergId;", "const name = iceInfo.name ? (iceInfo.name) : bergId;")
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_all_ternaries()
