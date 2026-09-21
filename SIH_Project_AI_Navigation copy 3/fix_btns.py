def fix_btn_text():
    with open('app/frontend/app.js', 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('<i data-lucide="square"></i> ? STOP DEMO', '<i data-lucide="square"></i> STOP DEMO')
    c = c.replace('<i data-lucide="play"></i> ? START SIH DEMO', '<i data-lucide="play"></i> START SIH DEMO')
    c = c.replace('<i data-lucide=\\"play\\"></i> ? RESUME', '<i data-lucide=\\"play\\"></i> RESUME')
    c = c.replace('<i data-lucide="play"></i> ? RESUME', '<i data-lucide="play"></i> RESUME')
    c = c.replace('? ', '') # Just strip out the random question marks from these buttons if they are elsewhere
    with open('app/frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(c)

if __name__ == '__main__':
    fix_btn_text()
