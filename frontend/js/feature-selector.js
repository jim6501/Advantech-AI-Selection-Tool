/* ═══════════════════════════════════════════════════════════
   Advantech Switch Selection Tool — Feature Selector Logic
   ═══════════════════════════════════════════════════════════

   維護說明：
   ┌─────────────────────────────────────────────────────────┐
   │  新增 DB「子功能」  → 不需改任何程式碼，自動同步        │
   │  新增 DB「大分類」  → 在對應 Group 的 dbCategories 加一行│
   │  新增「大分類卡片」 → 在 FS_GROUPS 陣列加一個 object    │
   └─────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════ */

// ================================================================
// FS_GROUPS — 大分類定義（唯一需要人工維護的區塊）
//
// 欄位說明：
//   id          : 唯一識別碼
//   label       : 顯示在卡片上的中文名稱
//   icon        : 卡片圖示
//   color       : 左邊框與強調色（CSS color 值）
//   dbCategories: 對應後端 DB 的 category 名稱陣列
//                 （需與 sw_index.py 輸出的【分類】名稱完全一致）
// ================================================================
const FS_GROUPS = [
    {
        id: 'net2', label: '二層交換', icon: '⬡', color: '#4a9eff',
        dbCategories: [
            'VLAN(IEEE 802.1Q)',
            'Spanning Tree',
            'Link Aggregation LACP (IEEE 802.3ad)',
            'Loop Control',
            'Flow Control (IEEE 802.3x)',
            'GARP-GVRP   GARP-GMRP',
            'MRP',
            'IEC 62439',
            'IEC 62439-2 MRP'
        ]
    },
    {
        id: 'net3', label: '三層路由', icon: '⇄', color: '#3ec99a',
        dbCategories: [
            'Routing Protocol',
            'IGMP Snooping v1/v2/v3',
            'MLD Snooping',
            'NAT',
            'NAT Throughput',
            'L3 Table',
            'IPv6',
            'DNS - Client  DNS - Server'
        ]
    },
    {
        id: 'security', label: '安全防護', icon: '⛨', color: '#f87171',
        dbCategories: [
            'Access Control List (ACL)',
            'DoS Attack Prevention',
            'CPU Protection',
            'IP Security - IP Source Guard/DHCP Snooping/ARP Spoofing Prevention',
            'IEEE 802.1X',
            'Remote Authentication - RADIUS/TACACS+',
            'Firewall',
            'VPN',
            'Port Security',
            'Security Protocol',
            'Password Management',
            'Trusted Host',
            'User Account',
            'Certification'
        ]
    },
    {
        id: 'qos', label: 'QoS / 流量控制', icon: '⇅', color: '#fbbf24',
        dbCategories: [
            'QoS IEEE 802.1p Based CoS  QoS IP TOS / Precedence  QoS DSCP based CoS',
            'Port Rate Limit',
            'Port Storm Control',
            'Scheduling',
            'sFlow',
            'Green Ethernet (IEEE 802.3az EEE)'
        ]
    },
    {
        id: 'redundancy', label: '備援 / 環型網路', icon: '↻', color: '#a78bfa',
        dbCategories: [
            'ERPS(G.8032)',
            'X-Ring Elite',
            'X-Ring Pro'
        ]
    },
    {
        id: 'tsn', label: '時間同步 / TSN', icon: '◷', color: '#34d399',
        dbCategories: [
            'IEEE 1588v2',
            'TSN',
            'NTP Client  NTP Server  SNTP Client',
            'IEC 61850'
        ]
    },
    {
        id: 'mgmt', label: '管理 / 維運', icon: '⚙', color: '#94a3b8',
        dbCategories: [
            'WEB GUI',
            'Command Line Interface',
            'SNMP-SNMPv1/v2c/v3/Trap',
            'DHCP - Client  DHCP - Server  DHCP Relay  DHCP Option 82',
            'System Log',
            'SMTP',
            'System Notice',
            'LLDP(IEEE 802.1ab)',
            'IP Management',
            'Upload / Download Method',
            'Configuration Management',
            'Firmware Management',
            'Boot Management',
            'IXM',
            'Memory Protection',
            'Storage Protection',
            'Standard MIB',
            'Private MIB',
            'RMONv1'
        ]
    },
    {
        id: 'oam', label: 'OAM / 診斷協定', icon: '◎', color: '#38bdf8',
        dbCategories: [
            'OAM - IEEE 802.1ag CFM',
            'OAM - IEEE 802.3ah',
            'Edge OAM',
            'Port Mirroring  RSPAN-Remote Switched Port Analysis',
            'Reserved Multicast',
            'Multicast Table',
            'Diagnostic'
        ]
    },
    {
        id: 'industrial', label: '工業 / 軌道協定', icon: '⚡', color: '#f472b6',
        dbCategories: [
            'Industrial Protocol - Modbus TCP',
            'Industrial Service Express',
            'ITxPT',
            'IEC 61375-2-3 TRDP',
            'IEC 61375-2-5 TTDP'
        ]
    },
    {
        id: 'hw', label: '硬體規格', icon: '□', color: '#a8a29e',
        dbCategories: [
            'Hardware Feature',  // Has_PoE, Has_Fiber, Has_RJ-45, Temp_Wide
            'Application'        // 應用場景（動態載入）
        ]
    }
    // ── 未來新增大分類，在此加入 object ──
];

// ================================================================
// FS_HIDDEN_FEATURES — 不在選擇器中顯示的功能（簡化 UI 用）
//
// 格式：DB key = 'category|||feat_key'
//   → 在瀏覽器開啟 /api/searchProdType?q= 可查詢所有可用 key
//
// 維護方式：
//   ‣ 新增要隱藏的功能 → 在 Set 中加一行字串
//   ‣ 恢復顯示       → 從 Set 中刪除該行
//
// 注意：隱藏只影響前端顯示，功能仍存在於 DB。
//       使用者仍可透過 Search Inventory 文字搜尋找到並選取。
// ================================================================
const FS_HIDDEN_FEATURES = new Set([
    // 範例：
    // 'Standard MIB|||MIB-II',
    // 'NTP Client  NTP Server  SNTP Client|||Local Time',
]);

// ================================================================
// 以下為運作邏輯，一般維護不需修改
// ================================================================

/** 從 API 載入的資料：{ gid: { dbCat: [{label, key}] } } */
let fsData = {};

/** 目前已勾選的項目：{ dbKey: { label, gid } } */
let fsSelected = {};

/** 目前展開的 Group id */
let fsActiveGid = null;

/** 搜尋關鍵字 */
let fsSearchQ = '';

/** 是否已初始化（避免重複呼叫 API） */
let fsReady = false;

// ── 初始化：呼叫一次 API，之後全前端處理 ───────────────────────
async function fsInit() {
    if (fsReady) { fsRender(); return; }

    const loadingEl = document.getElementById('fs-cat-grid');
    if (loadingEl) loadingEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:20px 0">載入功能清單中…</div>';

    try {
        // 空白查詢 = 回傳全部（由 selection.py 的修改支援）
        const items = await fetch(`${API_BASE}/api/searchProdType?q=`).then(r => r.json());
        _fsDistributeItems(items);
        fsReady = true;
        fsRender();
    } catch (e) {
        if (loadingEl) loadingEl.innerHTML = '<div style="color:#b91c1c;font-size:0.85rem;padding:20px 0">⚠ 功能清單載入失敗，請重試</div>';
        console.error('[FeatureSelector] init error:', e);
    }
}

/** 將 API 回傳的 items 分配到各 Group */
function _fsDistributeItems(items) {
    // 建立 dbCategory → groupId 的 lookup
    const catToGid = {};
    FS_GROUPS.forEach(g => {
        fsData[g.id] = {};
        g.dbCategories.forEach(cat => {
            catToGid[cat] = g.id;
            fsData[g.id][cat] = [];
        });
    });

    // 未分類 Group（自動產生，不在 FS_GROUPS 中）
    fsData['other'] = {};

    items.forEach(item => {
        // 略過隱藏功能（在 FS_HIDDEN_FEATURES 中的 key 不顯示）
        if (FS_HIDDEN_FEATURES.has(item.key)) return;

        const gid = catToGid[item.category];
        if (gid) {
            fsData[gid][item.category].push({ label: item.label, key: item.key });
        } else {
            // 未對應的 category → 歸入 'other'
            if (!fsData['other'][item.category]) fsData['other'][item.category] = [];
            fsData['other'][item.category].push({ label: item.label, key: item.key });
        }
    });
}

// ── 互動函數 ────────────────────────────────────────────────────

/** 切換單一功能的勾選 */
function fsToggleItem(key, label, gid, checked) {
    if (checked) {
        fsSelected[key] = { label, gid };
    } else {
        delete fsSelected[key];
    }
    fsRenderChips();
    // 更新「全選」按鈕狀態
    const cat = _fsFindCatByKey(gid, key);
    if (cat) _fsUpdateSelAllBtn(gid, cat);
}

/** 切換整個 dbCategory 的全選/取消全選 */
function fsToggleCat(gid, cat) {
    const items = (fsData[gid] || {})[cat] || [];
    const allSelected = items.every(i => fsSelected[i.key]);
    items.forEach(i => {
        if (allSelected) {
            delete fsSelected[i.key];
        } else {
            fsSelected[i.key] = { label: i.label, gid };
        }
    });
    fsRender();
}

/** 展開/收合大分類卡片 */
function fsToggleCard(gid) {
    fsActiveGid = (fsActiveGid === gid) ? null : gid;
    fsSearchQ = '';
    const searchEl = document.getElementById('fs-search');
    if (searchEl) { searchEl.value = ''; }
    const clearEl = document.getElementById('fs-s-clear');
    if (clearEl) clearEl.style.display = 'none';
    fsRender();
}

/** 從 chip bar 移除整個 Group 的選取 */
function fsRemoveGroupChip(gid) {
    Object.keys(fsSelected).forEach(key => {
        if (fsSelected[key].gid === gid) delete fsSelected[key];
    });
    fsRender();
}

/** 從 chip bar 移除單一 category 的選取 */
function fsRemoveCatChip(gid, cat) {
    const items = (fsData[gid] || {})[cat] || [];
    items.forEach(i => delete fsSelected[i.key]);
    fsRender();  // 完整重渲染，確保 checkbox 視覺同步更新
}

// ── 輔助函數 ────────────────────────────────────────────────────

function _fsGetGroup(gid) { return FS_GROUPS.find(g => g.id === gid); }

function _fsFindCatByKey(gid, key) {
    const groupData = fsData[gid] || {};
    return Object.keys(groupData).find(cat => groupData[cat].some(i => i.key === key));
}

function _fsCatSelCount(gid, cat) {
    return ((fsData[gid] || {})[cat] || []).filter(i => fsSelected[i.key]).length;
}

function _fsGrpSelCount(gid) {
    return Object.keys(fsSelected).filter(k => fsSelected[k].gid === gid).length;
}

function _fsGrpTotal(gid) {
    return Object.values(fsData[gid] || {}).reduce((s, arr) => s + arr.length, 0);
}

function _fsUpdateSelAllBtn(gid, cat) {
    const items = (fsData[gid] || {})[cat] || [];
    const allSel = items.length > 0 && items.every(i => fsSelected[i.key]);
    document.querySelectorAll(`.fs-sel-all-btn[data-gid="${gid}"][data-cat="${CSS.escape(cat)}"]`).forEach(btn => {
        btn.textContent = allSel ? '取消全選' : '全選此分類';
        btn.classList.toggle('on', allSel);
    });
}

// ── 輸出函數（供 app.js 橋接） ──────────────────────────────────

/**
 * 回傳目前已選取的功能陣列，格式：[{ key, label }]
 * key 即為後端所需的 DB key（category|||feat_key 格式）
 */
function fsGetSelected() {
    return Object.entries(fsSelected).map(([key, val]) => {
        const g = _fsGetGroup(val.gid);
        const displayLabel = g ? `[${g.label}] ${val.label}` : val.label;
        return { key, label: displayLabel };
    });
}

// ── Modal 控制 ───────────────────────────────────────────────────

function openFeatureSelector() {
    document.getElementById('fs-modal-overlay').classList.add('open');
    fsInit();
}

function closeFeatureSelector() {
    document.getElementById('fs-modal-overlay').classList.remove('open');
}

/** 清除所有已選取的功能，供主頁 resetAll() 呼叫 */
function fsReset() {
    fsSelected = {};
    fsActiveGid = null;
    fsSearchQ = '';
    const searchEl = document.getElementById('fs-search');
    if (searchEl) searchEl.value = '';
    const clearEl = document.getElementById('fs-s-clear');
    if (clearEl) clearEl.style.display = 'none';
    // 若 Modal 已初始化，同步更新畫面
    if (fsReady) fsRender();
}

// ── 渲染主函數 ───────────────────────────────────────────────────

function fsRender() {
    fsRenderChips();
    if (fsSearchQ) {
        _fsHideGrid();
        fsRenderSearch();
    } else {
        fsRenderGrid();
        fsRenderSub();
    }
}

/** 渲染已選功能的 Chip 列 */
function fsRenderChips() {
    const bar = document.getElementById('fs-chip-bar');
    const hint = document.getElementById('fs-chip-hint');
    if (!bar) return;

    // 清除舊 chips
    bar.querySelectorAll('.fs-chip').forEach(c => c.remove());

    // 按 category 分組產生 chips
    const catMap = {};
    Object.entries(fsSelected).forEach(([key, val]) => {
        const cat = _fsFindCatByKey(val.gid, key) || '其他';
        if (!catMap[`${val.gid}|||${cat}`]) catMap[`${val.gid}|||${cat}`] = [];
        catMap[`${val.gid}|||${cat}`].push({ key, label: val.label, gid: val.gid });
    });

    const hasAny = Object.keys(catMap).length > 0;
    if (hint) hint.style.display = hasAny ? 'none' : '';

    Object.entries(catMap).forEach(([composite, items]) => {
        const [gid, cat] = composite.split('|||');
        const g = _fsGetGroup(gid);
        const color = g ? g.color : '#999';
        const total = ((fsData[gid] || {})[cat] || []).length;
        const selCount = items.length;
        const catLabel = selCount >= total ? cat : `${cat} (${selCount}/${total})`;

        const chip = document.createElement('div');
        chip.className = 'fs-chip';
        chip.style.borderLeftColor = color;
        chip.innerHTML =
            `<span class="fs-chip-grp" style="color:${color}">${g ? g.label : '其他'}</span>` +
            `<span>${catLabel}</span>` +
            `<span class="fs-chip-x" title="移除此分類所有選取">×</span>`;
        chip.querySelector('.fs-chip-x').addEventListener('click', () => fsRemoveCatChip(gid, cat));
        bar.appendChild(chip);
    });
}

/** 渲染大分類卡片格 */
function fsRenderGrid() {
    const el = document.getElementById('fs-cat-grid');
    if (!el) return;
    el.style.display = 'grid';

    const allGroups = [...FS_GROUPS];
    const hasOther = Object.values(fsData['other'] || {}).some(arr => arr.length > 0);

    el.innerHTML = allGroups.map(g => {
        const selCount = _fsGrpSelCount(g.id);
        const total = _fsGrpTotal(g.id);
        const hasSel = selCount > 0;
        const isActive = fsActiveGid === g.id;
        const cntTxt = hasSel ? `${selCount}/${total} 項` : `${total} 項`;
        const cntColor = hasSel ? `color:${g.color};font-weight:700` : '';
        const borderStyle = isActive
            ? `border-left-color:${g.color};border-color:${g.color};`
            : `border-left-color:${g.color};`;

        return `<div class="fs-cat-card${isActive ? ' active' : ''}${hasSel ? ' has-sel' : ''}"
                     data-gid="${g.id}" style="${borderStyle}">
            <span class="fs-cat-icon" style="color:${g.color}">${g.icon}</span>
            <div class="fs-cat-name">${g.label}</div>
            <div class="fs-cat-cnt" style="${cntColor}">${cntTxt}</div>
        </div>`;
    }).join('') + (hasOther ? _fsOtherCardHTML() : '');

    // 綁定點擊事件
    el.querySelectorAll('.fs-cat-card').forEach(card => {
        card.addEventListener('click', () => fsToggleCard(card.dataset.gid));
    });
}

function _fsOtherCardHTML() {
    const total = Object.values(fsData['other'] || {}).reduce((s, arr) => s + arr.length, 0);
    const isActive = fsActiveGid === 'other';
    return `<div class="fs-cat-card uncategorized${isActive ? ' active' : ''}" data-gid="other"
                 style="border-left-color:#aab;">
        <span class="fs-cat-icon" style="color:#aab">⚠</span>
        <div class="fs-cat-name">其他（未分類）</div>
        <div class="fs-cat-cnt">${total} 項</div>
    </div>`;
}

function _fsHideGrid() {
    const el = document.getElementById('fs-cat-grid');
    if (el) el.style.display = 'none';
}

/** 渲染展開的子功能清單 */
function fsRenderSub() {
    const el = document.getElementById('fs-sub-area');
    if (!el) return;

    if (!fsActiveGid) { el.style.display = 'none'; return; }
    el.style.display = 'block';

    const isOther = fsActiveGid === 'other';
    const g = isOther ? null : _fsGetGroup(fsActiveGid);
    const groupData = fsData[fsActiveGid] || {};
    const total = Object.values(groupData).reduce((s, arr) => s + arr.length, 0);
    const color = g ? g.color : '#aab';
    const label = g ? g.label : '其他（未分類）';

    let html = `<div class="fs-sub-grp-title" style="color:${color}">
        ${label}
        <span class="fs-sub-grp-total">${total} 項功能</span>
    </div>`;

    if (isOther) {
        html += `<div class="fs-uncategorized-notice">
            ⚠ 以下功能尚未分配到分類。如需整理，請 PM 更新
            <code>frontend/js/feature-selector.js</code> 的 <code>FS_GROUPS</code> 設定。
        </div>`;
    }

    html += _fsSubHTML(fsActiveGid, groupData);
    el.innerHTML = html;
    _fsBindSubEvents(el, fsActiveGid);
}

/** 產生子功能 HTML */
function _fsSubHTML(gid, groupData) {
    const g = _fsGetGroup(gid);
    const color = g ? g.color : '#aab';
    let html = '';

    Object.entries(groupData).forEach(([cat, items]) => {
        if (!items.length) return;
        const allSel = items.every(i => fsSelected[i.key]);
        const selCount = _fsCatSelCount(gid, cat);

        html += `<div class="fs-sub-hdr">
            <span class="fs-sub-hdr-name" style="color:${color}">${cat}</span>
            <button class="fs-sel-all-btn${allSel ? ' on' : ''}"
                    data-gid="${gid}" data-cat="${cat.replace(/"/g, '&quot;')}">
                ${allSel ? '取消全選' : '全選此分類'}
            </button>
        </div>`;

        items.forEach(item => {
            const uid = 'fs_' + Math.random().toString(36).slice(2);
            const checked = !!fsSelected[item.key];
            const isHw = gid === 'hw';
            html += `<div class="fs-feat-row">
                <input type="checkbox" id="${uid}" ${checked ? 'checked' : ''}
                    data-gid="${gid}" data-key="${item.key}"
                    data-label="${item.label.replace(/"/g, '&quot;')}"
                    style="accent-color:${color}">
                <label for="${uid}">${item.label}</label>
                ${isHw ? `<span class="fs-hw-badge">HW</span>` : ''}
            </div>`;
        });
    });

    return html;
}

/** 綁定子功能區域的事件 */
function _fsBindSubEvents(el, gid) {
    el.querySelectorAll('.fs-sel-all-btn').forEach(btn => {
        btn.addEventListener('click', () => fsToggleCat(btn.dataset.gid, btn.dataset.cat));
    });
    el.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            fsToggleItem(cb.dataset.key, cb.dataset.label, cb.dataset.gid, cb.checked);
        });
    });
}

/** 渲染搜尋結果（前端過濾，無 API 呼叫） */
function fsRenderSearch() {
    const sub = document.getElementById('fs-sub-area');
    if (!sub) return;
    sub.style.display = 'block';

    const q = fsSearchQ;
    let html = '';
    let hasAny = false;

    const searchTargets = [
        ...FS_GROUPS.map(g => ({ g, data: fsData[g.id] || {} })),
        { g: { id: 'other', label: '其他（未分類）', color: '#aab', icon: '⚠' }, data: fsData['other'] || {} }
    ];

    searchTargets.forEach(({ g, data }) => {
        const matchedCats = {};
        Object.entries(data).forEach(([cat, items]) => {
            const matchedItems = items.filter(i =>
                i.label.toLowerCase().includes(q) ||
                cat.toLowerCase().includes(q) ||
                g.label.toLowerCase().includes(q)
            );
            if (matchedItems.length) matchedCats[cat] = matchedItems;
        });

        if (!Object.keys(matchedCats).length) return;
        hasAny = true;
        html += `<div class="fs-sr-grp-hdr" style="color:${g.color}">
            ${g.icon}&nbsp; ${g.label}
        </div>`;
        html += _fsSubHTML(g.id, matchedCats);
    });

    sub.innerHTML = hasAny ? html : '<div class="fs-no-result">無符合結果</div>';
    if (hasAny) {
        _fsBindSubEvents(sub, null);
        // 搜尋結果中的事件需逐一綁定
        sub.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => {
                fsToggleItem(cb.dataset.key, cb.dataset.label, cb.dataset.gid, cb.checked);
            });
        });
        sub.querySelectorAll('.fs-sel-all-btn').forEach(btn => {
            btn.addEventListener('click', () => fsToggleCat(btn.dataset.gid, btn.dataset.cat));
        });
    }
}

// ── 搜尋框事件（在 DOMContentLoaded 後由 app.js 綁定） ──────────
// 以下函數供外部呼叫，不直接綁定 DOM
function fsOnSearchInput(val) {
    fsSearchQ = val.trim().toLowerCase();
    const clearEl = document.getElementById('fs-s-clear');
    if (clearEl) clearEl.style.display = fsSearchQ ? 'block' : 'none';
    if (fsReady) fsRender();
}

function fsOnSearchClear() {
    const searchEl = document.getElementById('fs-search');
    if (searchEl) searchEl.value = '';
    fsSearchQ = '';
    const clearEl = document.getElementById('fs-s-clear');
    if (clearEl) clearEl.style.display = 'none';
    if (fsReady) fsRender();
}
