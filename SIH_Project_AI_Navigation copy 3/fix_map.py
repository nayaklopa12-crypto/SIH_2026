def fix_map_init():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    
    # Update init map params
    c = c.replace('center:[-60,0], zoom:3, minZoom:2', 'center:[-75,0], zoom:2, minZoom:1')
    
    # Update Reset View button
    c = c.replace("map.setView([-60,0], 3)", "map.setView([-75,0], 2)")
    
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_map_init()
