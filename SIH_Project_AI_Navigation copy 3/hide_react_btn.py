import glob, re

def hide_react_back_button():
    f = glob.glob('app/frontend/new_ui/assets/index-*.js')[0]
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # We replaced >Back to Glacier< with >< previously
    c = c.replace('border:`1px solid #4fd1c5`', 'border:`none`')
    c = c.replace('background:`rgba(0,0,0,0.8)`', 'background:`transparent`')
    c = c.replace('padding:`8px 16px`', 'padding:`0`')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

if __name__ == '__main__':
    hide_react_back_button()
