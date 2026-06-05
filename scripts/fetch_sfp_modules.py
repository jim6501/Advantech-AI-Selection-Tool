import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv('configs/.env')
import gspread

GOOGLE_SHEET_ID = os.getenv('GOOGLE_SHEET_ID', '')
gc = gspread.service_account(filename='configs/credentials.json')
sh = gc.open_by_key(GOOGLE_SHEET_ID)

ws = sh.worksheet('SFP')
data = ws.get_all_values()

# Row 1: merged header groups (Wavelength, Optical Power)
# Row 2: actual column headers
headers = data[1]  # Speed, Part Number, Optical Mode, ...
rows    = data[2:]  # actual data rows

# Column indices
COL_SPEED = 0
COL_PART  = 1
COL_MODE  = 2
COL_CABLE = 3
COL_DIST  = 4
COL_CONN  = 5
COL_WAVE  = 9   # "Typical (nm)"

def parse_speed(raw):
    """Normalise speed string to '100M' / '1G' / '10G' / 'copper'."""
    r = raw.strip().lower()
    if not r:
        return None
    if 'copper' in r:
        return 'copper'
    if '10 gbps' in r or '10gbps' in r:
        return '10G'
    if '1.25' in r or '1000' in r:
        return '1G'
    if '100' in r:
        return '100M'
    return r  # fallback: keep raw

def parse_mode_cat_bidi(raw_mode):
    """Return (mode, cat, bidi) from Optical Mode cell."""
    m = raw_mode.strip().lower()
    if m == 'copper':
        return ('any', 'copper', False)
    if 'bi-directional' in m or 'bidi' in m:
        return ('single-mode', 'fiber', True)
    if 'multi' in m:
        return ('multi-mode', 'fiber', False)
    if 'single' in m:
        return ('single-mode', 'fiber', False)
    return (m, 'fiber', False)

def parse_connector(raw_conn):
    """Simplify connector string to LC / SC / RJ45 etc."""
    c = raw_conn.strip()
    if not c:
        return ''
    c_low = c.lower()
    if 'rj45' in c_low or 'rj-45' in c_low:
        return 'RJ45'
    if 'simplex lc' in c_low:
        return 'LC'
    if 'duplex lc' in c_low:
        return 'LC'
    if 'simplex sc' in c_low:
        return 'SC'
    if 'duplex sc' in c_low:
        return 'SC'
    return c

def parse_duplex(raw_conn):
    """Return 'simplex' or 'duplex'."""
    c = raw_conn.strip().lower()
    if 'simplex' in c:
        return 'simplex'
    if 'duplex' in c:
        return 'duplex'
    return ''

modules = []
current_speed = None

for row in rows:
    # Skip footnote rows (col 1 has long text)
    part = row[COL_PART].strip() if len(row) > COL_PART else ''
    if not part or part.startswith('*'):
        continue

    speed_raw = row[COL_SPEED].strip() if len(row) > COL_SPEED else ''
    # Handle "SFP+\n 10 Gbps\n (WDM)" type multi-line cells
    speed_clean = ' '.join(speed_raw.split())
    if speed_clean:
        current_speed = parse_speed(speed_clean)

    mode_raw = row[COL_MODE].strip() if len(row) > COL_MODE else ''
    dist     = row[COL_DIST].strip() if len(row) > COL_DIST else ''
    conn_raw = row[COL_CONN].strip() if len(row) > COL_CONN else ''
    wave     = row[COL_WAVE].strip() if len(row) > COL_WAVE else ''
    # Strip Excel errors
    wave = '' if wave.startswith('#') else wave

    mode, cat, bidi = parse_mode_cat_bidi(mode_raw)
    conn   = parse_connector(conn_raw)
    duplex = parse_duplex(conn_raw)

    # BiDi pair: TX parts end with TX, RX end with RX
    pair = ''
    if bidi:
        if part.upper().endswith('TX') or part.upper().endswith('TX-LC'):
            pair = part.rsplit('-', 1)[0] + '-RX' if '-TX' in part.upper() else ''
            pair = part.replace('TX', 'RX')
        elif part.upper().endswith('RX') or part.upper().endswith('RX-LC'):
            pair = part.replace('RX', 'TX')

    modules.append({
        'part':   part,
        'speed':  current_speed,
        'cat':    cat,
        'mode':   mode,
        'bidi':   bidi,
        'pair':   pair,
        'conn':   conn,
        'duplex': duplex,
        'dist':   dist,
        'wave':   wave,
    })

# Output
out_dir = 'frontend/data'
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, 'sfp_modules.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(modules, f, ensure_ascii=False, indent=2)

print(f'✅ 共解析 {len(modules)} 筆 SFP 模組，儲存至 {out_path}')
for m in modules:
    print(f"  {m['speed']:6s} | {m['cat']:6s} | {m['mode']:12s} | bidi={m['bidi']} | {m['part']}")
