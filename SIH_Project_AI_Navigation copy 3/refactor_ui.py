import re

def refactor_index_html():
    with open('app/frontend/index.html', 'r', encoding='utf8') as f:
        html = f.read()

    # 1. Clean up the top navbar to give space for title and Start SIH Demo
    # Remove HOME, 3D RADAR, and MISSION CONTROL buttons from the top bar since they are redundant
    # We will just keep the badges and START SIH DEMO.
    html = re.sub(
        r'<a href="/dashboard".*?>.*?MISSION CONTROL</a>',
        '',
        html,
        flags=re.DOTALL
    )
    html = re.sub(
        r'<a href="/radar".*?>.*?3D RADAR</a>',
        '',
        html,
        flags=re.DOTALL
    )
    html = re.sub(
        r'<a href="/".*?>.*?HOME</a>',
        '',
        html,
        flags=re.DOTALL
    )
    
    # 2. Make START SIH DEMO more prominent
    old_start_btn = """<button id="btn-sih-demo" class="sih-demo-btn" onclick="toggleSIHDemo()">
          <i data-lucide="play"></i> ? START SIH DEMO
        </button>"""
    new_start_btn = """<button id="btn-sih-demo" class="sih-demo-btn primary-action" onclick="toggleSIHDemo()">
          <i data-lucide="play"></i> START SIH DEMO
        </button>"""
    html = html.replace(old_start_btn, new_start_btn)
    html = html.replace('<i data-lucide="play"></i> ? START SIH DEMO', '<i data-lucide="play"></i> START SIH DEMO')

    # 3. Add "Back to Glacier" to panel-tabs
    old_tabs = """<div class="panel-tabs">
        <button id="tab-btn-tracking" class="tab-btn active" onclick="switchTab('tracking')"><i data-lucide="radar"></i><span>Track</span></button>"""
    new_tabs = """<div class="panel-tabs">
        <a href="/" class="tab-btn" style="text-decoration:none; color:var(--text-muted);"><i data-lucide="arrow-left"></i><span>Back</span></a>
        <button id="tab-btn-tracking" class="tab-btn active" onclick="switchTab('tracking')"><i data-lucide="radar"></i><span>Track</span></button>"""
    html = html.replace(old_tabs, new_tabs)

    with open('app/frontend/index.html', 'w', encoding='utf8') as f:
        f.write(html)

def refactor_style_css():
    with open('app/frontend/style.css', 'r', encoding='utf8') as f:
        css = f.read()

    # 1. Update top-navbar for better responsiveness
    old_navbar = """#top-navbar{
  height:60px;background:var(--black);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;z-index:1000;
  border-bottom:2px solid var(--cyan);
  box-shadow:0 2px 20px rgba(14,165,233,0.25);
}"""
    new_navbar = """#top-navbar{
  min-height:60px;background:var(--black);
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 20px;z-index:1000;
  border-bottom:2px solid var(--cyan);
  box-shadow:0 2px 20px rgba(14,165,233,0.25);
  flex-wrap: wrap; gap: 10px;
}"""
    css = css.replace(old_navbar, new_navbar)

    # 2. Update panel-tabs from 6 columns to flexbox
    old_panel_tabs = """.panel-tabs{
  display:grid;
  grid-template-columns:repeat(6, 1fr);
  border-bottom:2px solid var(--border);
  background:var(--bg-inset);
  padding:5px 4px;
  gap:2px;
}"""
    new_panel_tabs = """.panel-tabs{
  display:flex;
  flex-wrap: wrap;
  justify-content: space-between;
  border-bottom:2px solid var(--border);
  background:var(--bg-inset);
  padding:5px 4px;
  gap:2px;
}
.tab-btn { flex: 1 1 auto; min-width: 50px; }"""
    css = css.replace(old_panel_tabs, new_panel_tabs)

    # 3. Add primary-action style
    css += """
.primary-action {
  background: rgba(16, 185, 129, 0.15) !important;
  color: #10b981 !important;
  border: 1px solid rgba(16, 185, 129, 0.5) !important;
  padding: 8px 16px !important;
  font-size: 0.85rem !important;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
}
.primary-action:hover {
  background: rgba(16, 185, 129, 0.25) !important;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
}
"""
    with open('app/frontend/style.css', 'w', encoding='utf8') as f:
        f.write(css)

if __name__ == '__main__':
    refactor_index_html()
    refactor_style_css()
    print("UI Refactored.")
