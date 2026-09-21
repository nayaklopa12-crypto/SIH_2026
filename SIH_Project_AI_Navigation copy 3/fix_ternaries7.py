import re

def fix_all_ternaries():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    
    c = c.replace('pt pt.date : "---"', 'pt ? pt.date : "---"')
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_all_ternaries()
