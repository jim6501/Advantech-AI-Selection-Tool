/* ═══════════════════════════════════════════════════════════
   Advantech Switch Selection Tool — Main Application Script
   ═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// API 位址自動偵測
// 規則：
//   1. file:// 或 localhost → 使用本機後台 (預設 8000 port)
//   2. 其他網域 → 使用相同主機的相同 port，自動對齊部署環境
// 若本機後台使用非 8000 的 port，請修改下方的 LOCAL_PORT 常數。
// ─────────────────────────────────────────────
const LOCAL_PORT = 8000;

function detectApiBase() {
    const { protocol, hostname } = window.location;
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://127.0.0.1:${LOCAL_PORT}`;
    }
    // GitHub Pages 或其他外部主機 → 使用 config.js 設定的 Cloudflare Tunnel URL
    if (typeof CLOUDFLARE_API_URL !== 'undefined' && CLOUDFLARE_API_URL) {
        return CLOUDFLARE_API_URL;
    }
    return window.location.origin;
}

const API_BASE = detectApiBase();
console.log(`[API] 後台連線位址: ${API_BASE}`);

// ═══════════════════════════════════════════════
// 共用狀態
// ═══════════════════════════════════════════════
let selectedItemsMap = {};   // { key: label } 儲存已選取的特徵
let acquiredModels = [];  // 後端回傳的型號清單（供 Chatbot context 使用）
let lastSuccessSnapshot = null; // 上一次有結果的條件快照 { mgmt, port, items: Set }
let currentDataList = []; // 目前搜尋結果的完整資料清單，供排序使用

// ── 場景模板狀態 ──────────────────────────────
let activeScene = null;       // 目前啟用的場景 id
let removedSugKeys = new Set();  // 使用者移除的建議條件 key
let sceneOwnedItemKeys = new Set();  // 場景帶入 selectedItemsMap 的 key（避免雙重顯示）
let fsAppliedKeys = new Set();   // 上次透過 Advanced Filter Apply 帶入的 key（用於同步移除）

const numInput = document.getElementById('numInput');

// ═══════════════════════════════════════════════
// 工具列表搜尋 (即時 API)
// ═══════════════════════════════════════════════
document.getElementById('searchInput').addEventListener('input', function () {
    const query = this.value;
    if (query.length === 0) {
        document.getElementById('searchResults').innerHTML = '';
        return;
    }
    fetch(`${API_BASE}/api/searchProdType?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            const resultDiv = document.getElementById('searchResults');
            resultDiv.innerHTML = '';
            data.forEach(item => {
                const div = document.createElement('div');
                let groupLabel = item.category;
                if (typeof fsGetCategoryGroupLabel === 'function') {
                    groupLabel = fsGetCategoryGroupLabel(item.category);
                }
                div.textContent = `[${groupLabel}] ${item.label}`;
                div.onclick = () => addItem(item);
                resultDiv.appendChild(div);
            });
        });
});

function addItem(item) {
    if (selectedItemsMap[item.key]) return;

    let groupLabel = item.category;
    if (typeof fsGetCategoryGroupLabel === 'function') {
        groupLabel = fsGetCategoryGroupLabel(item.category);
    }

    selectedItemsMap[item.key] = `[${groupLabel}] ${item.label}`;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    renderSelected();
}

function removeItem(itemKey) {
    delete selectedItemsMap[itemKey];

    // 同步清除 Advanced Filter 中對應的勾選狀態
    if (typeof fsSelected !== 'undefined' && fsSelected[itemKey]) {
        delete fsSelected[itemKey];
        // 若 Feature Selector 已初始化，刷新其 UI（chip bar + checkbox）
        if (typeof fsRender === 'function' && typeof fsReady !== 'undefined' && fsReady) {
            fsRender();
        }
    }

    // 同步清除追蹤集合，避免下次 Apply 時誤刪
    if (typeof fsAppliedKeys !== 'undefined') {
        fsAppliedKeys.delete(itemKey);
    }

    renderSelected();
}

// ═══════════════════════════════════════════════
// 條件快照（用於「零結果」警告判斷）
// ═══════════════════════════════════════════════
function getSnapshotNow(extraItems = []) {
    return {
        mgmt: document.getElementById('mgmtType').value,
        port: document.getElementById('numInput').value,
        items: new Set([...Object.keys(selectedItemsMap), ...extraItems])
    };
}

// ═══════════════════════════════════════════════
// 渲染：已選特徵 tags
// ═══════════════════════════════════════════════
function renderSelected(culpritItems = new Set()) {
    const container = document.getElementById('selectedItems');
    container.innerHTML = '';
    Object.keys(selectedItemsMap)
        .filter(key => !sceneOwnedItemKeys.has(key)) // 場景帶入的 item 由 filter tags 區顯示，不重複
        .forEach(key => {
            const div = document.createElement('div');
            div.className = 'selected-item' + (culpritItems.has(key) ? ' culprit' : '');
            const remove = document.createElement('span');
            remove.textContent = '✖';
            remove.className = 'remove-btn';
            remove.onclick = () => removeItem(key);
            div.appendChild(remove);
            div.appendChild(document.createTextNode(selectedItemsMap[key]));
            container.appendChild(div);
        });
    renderFilterTags();
}

// ═══════════════════════════════════════════════
// 渲染：Filter Tags（管理類型 + Port 數）
// ═══════════════════════════════════════════════
function renderFilterTags(culprits = {}, culpritItems = new Set()) {
    const filterDiv = document.getElementById('filterTags');
    filterDiv.innerHTML = '';

    if (activeScene) {
        // ── 場景模式：場景 tag + 必選/建議 tag ────────────
        const scene = SCENE_TEMPLATES.find(s => s.id === activeScene);
        if (!scene) return;

        // 場景來源 tag（深藍）— 有條件被刪除或值被修改時加上 (已修改) 標記
        const isSceneModified = removedSugKeys.size > 0 || scene.conditions.some(cond => {
            if (cond.key === 'mgmtType') return document.getElementById('mgmtType').value !== cond.value;
            if (cond.key === 'numPorts') return document.getElementById('numInput').value !== String(cond.value);
            return false;
        });
        const sceneTag = document.createElement('span');
        sceneTag.className = 'filter-tag-scene';
        const modifiedBadge = isSceneModified
            ? ' <span style="font-size:0.68rem;font-weight:400;opacity:0.85;">(Modified)</span>'
            : '';
        sceneTag.innerHTML = `<span class="filter-icon">${scene.icon}</span> ${scene.label} Template${modifiedBadge}`;
        filterDiv.appendChild(sceneTag);

        // 各條件 tag
        scene.conditions.forEach(cond => {
            if (removedSugKeys.has(cond.key)) return;

            // 對於有 DOM 對應的欄位（mgmtType / numPorts），
            // 使用實際的下拉選單值，確保 tag 顯示與實際查詢一致
            let effectiveCond = cond;
            let isValueModified = false;
            if (cond.key === 'mgmtType') {
                const v = document.getElementById('mgmtType').value;
                if (v) {
                    effectiveCond = { ...cond, value: v };
                    if (v !== cond.value) isValueModified = true;
                }
            } else if (cond.key === 'numPorts') {
                const v = document.getElementById('numInput').value;
                if (v) {
                    effectiveCond = { ...cond, value: parseInt(v) || cond.value };
                    if (v !== String(cond.value)) isValueModified = true;
                }
            }

            const label = getConditionDisplayLabel(effectiveCond);
            const tag = document.createElement('span');
            const displayText = isValueModified ? `${label} (Mod)` : label;
            tag.className = isValueModified ? 'filter-tag-modified' : 'filter-tag-sug';
            tag.innerHTML = `${displayText} <span class="tag-remove" onclick="removeSuggestedCondition('${cond.key}')">×</span>`;
            filterDiv.appendChild(tag);
        });

        // ── 補渲染使用者手動調整的欄位（不在場景條件或已移除建議時）──
        const sceneMgmtActive = scene.conditions.some(c => c.key === 'mgmtType' && !removedSugKeys.has('mgmtType'));
        const scenePortActive = scene.conditions.some(c => c.key === 'numPorts' && !removedSugKeys.has('numPorts'));

        const mgmtManual = document.getElementById('mgmtType').value;
        if (mgmtManual && !sceneMgmtActive) {
            const lblMap = { 'managed': 'Managed (All)', 'l2_managed': 'L2 Managed', 'l3_managed': 'L3 Managed', 'unmanaged': 'Unmanaged' };
            const lbl = lblMap[mgmtManual] || 'Unmanaged';
            const t = document.createElement('span');
            t.className = 'filter-tag';
            t.textContent = `Type: ${lbl}`;
            filterDiv.appendChild(t);
        }

        const portManual = document.getElementById('numInput').value;
        if (portManual && !scenePortActive) {
            const t = document.createElement('span');
            t.className = 'filter-tag';
            t.textContent = `Port: ≥${portManual}`;
            filterDiv.appendChild(t);
        }

        // 場景說明注解
        let note = document.getElementById('sceneStateNote');
        if (!note) {
            note = document.createElement('div');
            note.id = 'sceneStateNote';
            note.className = 'scene-state-note';
            filterDiv.parentElement.appendChild(note);
        }
        const activeCount = scene.conditions.filter(c => !removedSugKeys.has(c.key)).length;
        const certNote = scene.conditions.some(c => c.key === 'certifications')
            ? 'Certification conditions are currently for display only and will be queried once DB fields are confirmed.' : '';
        note.textContent = `Applying "${scene.label}" template: contains ${activeCount} preset condition(s). ${certNote}`;

        // 偵測場景是否已被使用者修改
        checkSceneModified();

    } else {
        // ── 手動模式：含 × 移除按鈕的 tag ──────────────
        const mgmtVal = document.getElementById('mgmtType').value;
        const portVal = document.getElementById('numInput').value;

        if (mgmtVal) {
            const labelMap = { 'managed': 'Managed (All)', 'l2_managed': 'L2 Managed', 'l3_managed': 'L3 Managed', 'unmanaged': 'Unmanaged' };
            const label = labelMap[mgmtVal] || 'Unmanaged';
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (culprits.mgmt ? ' culprit' : '');
            tag.innerHTML = `Type: ${label} <span class="filter-tag-x" onclick="ftRemoveMgmt()">×</span>`;
            filterDiv.appendChild(tag);
        }
        if (portVal) {
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (culprits.port ? ' culprit' : '');
            tag.innerHTML = `Port: ≥${portVal} <span class="filter-tag-x" onclick="ftRemovePort()">×</span>`;
            filterDiv.appendChild(tag);
        }
        // Max Port Speed
        const activeSpeedChip = document.querySelector('#speedChips .dp-chip.active');
        if (activeSpeedChip) {
            const speedKeyMap = { '100M': 'Speed_100M', '1G': 'Speed_GbE', '10G+': 'Speed_10G' };
            const speedCulprit = culpritItems.has(speedKeyMap[activeSpeedChip.dataset.val]);
            const speedVal = activeSpeedChip.dataset.val;
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (speedCulprit ? ' culprit' : '');
            tag.innerHTML = `Speed: ${activeSpeedChip.textContent.trim()} <span class="filter-tag-x" onclick="ftRemoveChip('#speedChips','${speedVal}')">×</span>`;
            filterDiv.appendChild(tag);
        }

        // PoE Required
        if (document.getElementById('poeToggle')?.checked) {
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (culpritItems.has('Has_PoE') ? ' culprit' : '');
            tag.innerHTML = `PoE: Required <span class="filter-tag-x" onclick="ftRemovePoe()">×</span>`;
            filterDiv.appendChild(tag);
        }

        // Interface Type
        const ifaceKeyMap = { 'rj45': 'Has_RJ-45', 'fiber': 'Has_Fiber' };
        document.querySelectorAll('#ifaceChips .dp-chip.active').forEach(c => {
            const val = c.dataset.val;
            const isCulprit = culpritItems.has(ifaceKeyMap[val]);
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (isCulprit ? ' culprit' : '');
            tag.innerHTML = `Interface: ${c.textContent.trim()} <span class="filter-tag-x" onclick="ftRemoveChip('#ifaceChips','${val}')">×</span>`;
            filterDiv.appendChild(tag);
        });

        // Certifications
        document.querySelectorAll('#certChips .dp-chip.active').forEach(c => {
            const val = c.dataset.val;
            const tag = document.createElement('span');
            tag.className = 'filter-tag' + (culpritItems.has(val) ? ' culprit' : '');
            tag.innerHTML = `Cert: ${c.textContent.trim()} <span class="filter-tag-x" onclick="ftRemoveChip('#certChips','${val}')">×</span>`;
            filterDiv.appendChild(tag);
        });

        if (filterDiv.children.length === 0) {
            filterDiv.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted);font-style:italic;">No filters applied yet</span>';
        }

        // 清除場景注解（如果有的話）
        const note = document.getElementById('sceneStateNote');
        if (note) note.remove();
    }
}

// 下拉條件變動時，即時更新 filter tags
document.getElementById('mgmtType').addEventListener('change', () => renderFilterTags());
document.getElementById('numInput').addEventListener('change', () => renderFilterTags());

// 初始化
renderFilterTags();

// ═══════════════════════════════════════════════
// 產品卡片列表渲染引擎
// ═══════════════════════════════════════════════
const portLabels = {
    rj45_100: 'RJ-45 10/100', rj45_gbe: 'RJ-45 GbE', rj45_combo: 'RJ-45/SFP Combo',
    fiber_100: 'Fiber 10/100', fiber_gbe: 'Fiber GbE', fiber_10g: 'Fiber 10G (SFP+)',
    m12_100: 'M12 D-code 10/100', m12_gbe: 'M12 X-code GbE', m12_multi: 'M12 X-code Multi-Giga (2.5/5/10G)',
    bypass_100: 'Bypass (D-code)', bypass_gbe: 'Bypass (X-code)'
};
const portColors = {
    rj45_100: 'pv-rj45', rj45_gbe: 'pv-rj45-gbe', rj45_combo: 'pv-combo',
    fiber_100: 'pv-fiber', fiber_gbe: 'pv-fiber-gbe', fiber_10g: 'pv-fiber-10g',
    m12_100: 'pv-m12', m12_gbe: 'pv-m12-gbe', m12_multi: 'pv-m12-multi',
    bypass_100: 'pv-bypass', bypass_gbe: 'pv-bypass-gbe'
};
// PoE ports: 保留接頭底色，以 pv-poe class 疊加閃電指示點
const poeBaseColor = {
    rj45_100: 'pv-rj45', rj45_gbe: 'pv-rj45-gbe',
    m12_100: 'pv-m12', m12_gbe: 'pv-m12-gbe', m12_multi: 'pv-m12-multi'
};
const poeLabelMap = {
    rj45_100: 'RJ-45 10/100 w/PoE', rj45_gbe: 'RJ-45 GbE w/PoE',
    m12_100: 'M12 D-code w/PoE', m12_gbe: 'M12 X-code w/PoE', m12_multi: 'M12 X-code Multi-Giga w/PoE'
};
// 規格欄位定義
const specDef = [
    { key: 'power', label: 'Power Input' },
    { key: 'temp', label: 'Operating Temp' },
];
const tabsDef = [
    { id: 'port', icon: 'ti-plug-connected', label: 'Port' },
    { id: 'spec', icon: 'ti-list-details', label: 'Specs' },
    { id: 'sfp', icon: 'ti-wave-sine', label: 'SFP Guide' },
];

// 解決部分型號資料庫中 RJ-45 欄位已包含 PoE 數量，而部分型號卻未包含的不一致問題
function resolveTotal(rj, poe) {
    if (rj === 0) return poe;
    if (poe === 0) return rj;
    if (rj >= poe) return rj; // rj 已經包含了 poe
    return rj + poe;          // rj 只是 non-poe 埠
}

// 將 API 資料映射成內部使用的 ports 物件
function apiToPortObj(item) {
    const poe_rj_100 = item.prod_poe_rj_100 || 0;
    const poe_rj_gbe = item.prod_poe_rj_giga || 0;
    const poe_m12_100 = item.prod_poe_m12_100 || 0;
    const poe_m12_gbe = item.prod_poe_m12_giga || 0;

    return {
        rj45_100: resolveTotal(item.prod_rj_100 || 0, poe_rj_100),
        rj45_gbe: resolveTotal(item.prod_rj_giga || 0, poe_rj_gbe),
        rj45_combo: item.prod_rj_100_combo || 0,
        fiber_100: item.prod_fiber_100 || 0,
        fiber_gbe: item.prod_fiber_giga || 0,
        fiber_10g: item.prod_fiber_10g || 0,
        fiber_combo: item.prod_fiber_ge_combo || 0,
        m12_100: resolveTotal(item.prod_m12_100 || 0, poe_m12_100),
        m12_gbe: resolveTotal(item.prod_m12_giga || 0, poe_m12_gbe),
        m12_multi: item.prod_m12_multi_giga || 0,
        bypass_100: item.prod_bypass_m12_100 || 0,
        bypass_gbe: item.prod_bypass_m12_giga || 0,
        poe_100: poe_rj_100 + poe_m12_100,
        poe_gbe: poe_rj_gbe + poe_m12_gbe,
    };
}

function totalPorts(ports) {
    // fiber_combo 與 rj45_combo 是同一實體埠，不重複計算
    return ['rj45_100', 'rj45_gbe', 'rj45_combo', 'fiber_100', 'fiber_gbe', 'fiber_10g', 'm12_100', 'm12_gbe', 'm12_multi', 'bypass_100', 'bypass_gbe']
        .reduce((s, k) => s + (ports[k] || 0), 0);
}

function buildVis(ports) {
    // 閃電 SVG（viewBox 0 0 5 7，6×9px，辨識度最佳比例）
    const POE_SVG = `<svg width="6" height="9" viewBox="0 0 5 7" fill="white" xmlns="http://www.w3.org/2000/svg" style="pointer-events:none;display:block"><polygon points="3,0 0,3.5 2,3.5 2,7 5,3.5 3,3.5"/></svg>`;

    // ─── 1. 收集所有 port 區塊物件 ──────────────────────────────
    // 每個物件：{ colorClass, isPoe, label }
    const blockList = [];
    const legSet = new Map();   // key → { colorClass, label }（去重，僅非-PoE 類型）
    let hasAnyPoe = false;
    let left_poe_100 = ports.poe_100 || 0;
    let left_poe_gbe = ports.poe_gbe || 0;

    const copperGroups = [
        { key: 'rj45_100', isGbE: false },
        { key: 'm12_100', isGbE: false },
        { key: 'rj45_gbe', isGbE: true },
        { key: 'm12_gbe', isGbE: true },
        { key: 'm12_multi', isGbE: true },
        { key: 'bypass_100', isGbE: false, noPoE: true },
        { key: 'bypass_gbe', isGbE: true, noPoE: true },
        { key: 'rj45_combo', isGbE: false, noPoE: true }
    ];

    copperGroups.forEach(grp => {
        const k = grp.key;
        const n = ports[k] || 0;
        if (n <= 0) return;

        let poeHere = 0;
        if (!grp.noPoE) {
            if (grp.isGbE) {
                poeHere = Math.min(left_poe_gbe, n);
                left_poe_gbe -= poeHere;
            } else {
                poeHere = Math.min(left_poe_100, n);
                left_poe_100 -= poeHere;
            }
        }

        // 非 PoE 埠
        for (let i = 0; i < n - poeHere; i++) {
            blockList.push({ colorClass: portColors[k], isPoe: false, label: portLabels[k] });
        }
        // PoE 埠：保留接頭底色 + badge
        for (let j = 0; j < poeHere; j++) {
            blockList.push({ colorClass: poeBaseColor[k] || portColors[k], isPoe: true, label: poeLabelMap[k] });
            hasAnyPoe = true;
        }

        // Legend：僅記錄接頭類型（去重）
        if (!legSet.has(k)) legSet.set(k, { colorClass: portColors[k], label: portLabels[k] });
    });

    // fiber_combo 是同一實體埠，不重複；渲染 fiber_100 / fiber_gbe / fiber_10g
    ['fiber_100', 'fiber_gbe', 'fiber_10g'].forEach(k => {
        const n = ports[k] || 0;
        if (n <= 0) return;
        for (let i = 0; i < n; i++) {
            blockList.push({ colorClass: portColors[k], isPoe: false, label: portLabels[k] });
        }
        if (!legSet.has(k)) legSet.set(k, { colorClass: portColors[k], label: portLabels[k] });
    });

    // ─── 2. 分組渲染（每 8 個一組 → 2×4 faceplate grid）────────
    const GROUP_SIZE = 8;
    let groupsHtml = '';
    for (let i = 0; i < blockList.length; i += GROUP_SIZE) {
        const slice = blockList.slice(i, i + GROUP_SIZE);
        const inner = slice.map(b =>
            b.isPoe
                ? `<div class="pv-block ${b.colorClass}" title="${b.label}"><span class="pv-poe-badge">${POE_SVG}</span></div>`
                : `<div class="pv-block ${b.colorClass}" title="${b.label}"></div>`
        ).join('');
        groupsHtml += `<div class="pv-faceplate-group">${inner}</div>`;
    }

    // ─── 3. Legend（參考圖樣：彩色色塊 + 標籤，PoE 獨立一條目）───────
    let legItems = '';
    legSet.forEach(({ colorClass, label }) => {
        legItems += `<span class="pv-leg-item"><span class="pv-leg-swatch ${colorClass}"></span>${label}</span>`;
    });
    // PoE 條目：獨立 amber badge，與埠上 badge 視覺一致
    if (hasAnyPoe) {
        legItems += `<span class="pv-leg-item"><span class="pv-leg-poe-badge">${POE_SVG}</span>PoE</span>`;
    }

    return `<div class="port-vis">${groupsHtml}</div><div class="pv-legend">${legItems}</div>`;
}

function buildPortRows(ports) {
    let rj = '', combo = '', m12 = '', fb = '', bp = '';
    let left_poe_100 = ports.poe_100 || 0;
    let left_poe_gbe = ports.poe_gbe || 0;

    // RJ-45 純銅埠（不含 Combo）
    ['rj45_100', 'rj45_gbe'].forEach(k => {
        const n = ports[k] || 0;
        let poeN = 0;
        if (n > 0) {
            if (k === 'rj45_gbe') {
                poeN = Math.min(left_poe_gbe, n);
                left_poe_gbe -= poeN;
            } else if (k === 'rj45_100') {
                poeN = Math.min(left_poe_100, n);
                left_poe_100 -= poeN;
            }
            const right = `<span class="port-val">${n}</span>${poeN > 0 ? `<span class="port-poe-badge">${poeN} PoE</span>` : ''}`;
            rj += `<div class="port-row"><span class="port-type">${portLabels[k]}</span><span style="display:flex;align-items:center">${right}</span></div>`;
        }
    });

    if ((ports.rj45_combo || 0) > 0) {
        const n = ports.rj45_combo;
        combo += `<div class="port-row">
            <span class="port-type" style="display:flex;flex-direction:column;gap:1px">
                <span>RJ-45/SFP</span>
                <span style="font-size:9px;color:#94a3b8">Either RJ-45 or SFP</span>
            </span>
            <span class="port-val">${n}</span>
        </div>`;
    }

    ['m12_100', 'm12_gbe', 'm12_multi'].forEach(k => {
        const n = ports[k] || 0;
        let poeN = 0;
        if (n > 0) {
            if (k === 'm12_gbe' || k === 'm12_multi') {
                poeN = Math.min(left_poe_gbe, n);
                left_poe_gbe -= poeN;
            } else if (k === 'm12_100') {
                poeN = Math.min(left_poe_100, n);
                left_poe_100 -= poeN;
            }
            const right = `<span class="port-val">${n}</span>${poeN > 0 ? `<span class="port-poe-badge">${poeN} PoE</span>` : ''}`;
            m12 += `<div class="port-row"><span class="port-type">${portLabels[k]}</span><span style="display:flex;align-items:center">${right}</span></div>`;
        }
    });

    ['fiber_100', 'fiber_gbe', 'fiber_10g'].forEach(k => {
        const n = ports[k] || 0;
        if (n > 0) {
            fb += `<div class="port-row"><span class="port-type">${portLabels[k]}</span><span class="port-val">${n}</span></div>`;
        }
    });

    ['bypass_100', 'bypass_gbe'].forEach(k => {
        const n = ports[k] || 0;
        if (n > 0) {
            bp += `<div class="port-row"><span class="port-type">${portLabels[k]}</span><span class="port-val">${n}</span></div>`;
        }
    });

    return { rj, combo, m12, fb, bp };
}

function buildPortPane(item) {
    const ports = apiToPortObj(item);
    const total = totalPorts(ports);
    const rows = buildPortRows(ports);
    const vis = buildVis(ports);
    const poeParts = [];
    if (ports.poe_gbe > 0) poeParts.push(`${ports.poe_gbe} GbE PoE`);
    if (ports.poe_100 > 0) poeParts.push(`${ports.poe_100} FE PoE`);
    const poeInfo = poeParts.length > 0
        ? ` &nbsp;<span style="font-size:11px;color:#EA580C;font-weight:600">· ${poeParts.join(' · ')}</span>`
        : '';

    const hasCombo = (ports.rj45_combo || 0) > 0;
    const comboInfo = hasCombo ? ` &nbsp;<span class="sfp-combo-note" style="margin-left:8px;">Combo — RJ45 disabled when SFP is inserted</span>` : '';

    let colCount = 0;
    if (rows.rj) colCount++;
    if (rows.combo) colCount++;
    if (rows.m12) colCount++;
    if (rows.fb) colCount++;
    if (rows.bp) colCount++;
    colCount = colCount || 1;
    const gridStyle = `grid-template-columns: repeat(${colCount + 1}, minmax(0,1fr))`;

    return `<div class="port-total-row"><span class="port-total-num">${total}</span><span class="port-total-label">ports total</span>${poeInfo}${comboInfo}</div>
        <div class="port-grid" style="${gridStyle}">
            ${rows.rj ? `<div class="port-group"><div class="port-group-label">RJ-45</div>${rows.rj}</div>` : ''}
            ${rows.combo ? `<div class="port-group port-group-combo"><div class="port-group-label">Combo</div>${rows.combo}</div>` : ''}
            ${rows.m12 ? `<div class="port-group"><div class="port-group-label">M12</div>${rows.m12}</div>` : ''}
            ${rows.fb ? `<div class="port-group"><div class="port-group-label">Fiber</div>${rows.fb}</div>` : ''}
            ${rows.bp ? `<div class="port-group"><div class="port-group-label">Bypass</div>${rows.bp}</div>` : ''}
            <div class="port-group"><div class="port-group-label">Port Map</div>${vis}</div>
        </div>`;
}

function buildSpecPane(item) {
    const rows = [
        { label: 'Power Input', val: item.prod_power_input || '—' },
        { label: 'Operating Temp', val: item.prod_temp_range || '—' }
    ].map(def =>
        `<div class="spec-row"><span class="spec-key">${def.label}</span><span class="spec-val">${def.val}</span></div>`
    ).join('');
    return `<div class="spec-group"><div class="spec-group-label">Basic Specs</div>${rows}</div>`;
}

function checkHasSfp(item) {
    if (!item) return false;
    if (item.prod_fiber_type) return true;
    if (item.prod_fiber_giga > 0) return true;
    if (item.prod_fiber_100 > 0) return true;
    if (item.prod_fiber_ge_combo > 0) return true;
    if (item.prod_rj_100_combo > 0) return true;
    if (item.prod_fiber_10g > 0) return true;
    return false;
}

function buildTabBar(pid, activeTab, item) {
    const hasFiber = checkHasSfp(item);
    return tabsDef
        .filter(t => t.id !== 'sfp' || hasFiber)  // SFP tab 僅在有光纖 port 時顯示
        .map(t =>
            `<button class="tab-btn${t.id === activeTab ? ' active' : ''}" onclick="pcSwitchTab('${pid}','${t.id}')">
                <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`
        ).join('');
}

function buildTabPanes(item, pid) {
    const hasFiber = checkHasSfp(item);
    return tabsDef
        .filter(t => t.id !== 'sfp' || hasFiber)
        .map(t => {
            let content = '';
            if (t.id === 'port') content = buildPortPane(item);
            else if (t.id === 'spec') content = buildSpecPane(item);
            else if (t.id === 'sfp') content = `<div class="sfp-loading" id="sfp-content-${pid}"><span class="sfp-loading-dot"></span> Loading...</div>`;
            return `<div class="tab-pane${t.id === 'port' ? ' active' : ''}" id="pane-${pid}-${t.id}">${content}</div>`;
        }).join('');
}

function pcToggleDetail(pid) {
    const detail = document.getElementById(`detail-${pid}`);
    const btn = document.getElementById(`expand-btn-${pid}`);
    const card = document.getElementById(pid);          // .pc 父容器
    const isOpen = detail.classList.contains('open');

    // 關閉其他已展開的卡片，保持同一時間只有一張展開
    document.querySelectorAll('.pc.is-expanded').forEach(c => {
        if (c.id !== pid) {
            c.classList.remove('is-expanded');
            const otherDetail = document.getElementById(`detail-${c.id}`);
            const otherBtn = document.getElementById(`expand-btn-${c.id}`);
            if (otherDetail) otherDetail.classList.remove('open');
            if (otherBtn) otherBtn.classList.remove('open');
        }
    });
    // 切換設備時重置 SFP accordion 收合狀態
    if (typeof sfpResetAllAccordions === 'function') sfpResetAllAccordions();

    detail.classList.toggle('open', !isOpen);
    btn.classList.toggle('open', !isOpen);
    if (card) card.classList.toggle('is-expanded', !isOpen);

    // 展開時，平滑捲動讓卡片頂部對齊視窗（留一點上邊距）
    if (!isOpen && card) {
        setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

function pcSwitchTab(pid, tabId) {
    tabsDef.forEach(t => {
        const pane = document.getElementById(`pane-${pid}-${t.id}`);
        if (pane) pane.classList.toggle('active', t.id === tabId);
    });
    const bar = document.getElementById(`tabbar-${pid}`);
    if (bar) bar.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.onclick?.toString().includes(`'${tabId}'`));
    });
    // 切換到 SFP tab 時，非同步載入選型面板
    if (tabId === 'sfp') {
        const sfpContentId = `sfp-content-${pid}`;
        // 取得對應 item（從快取中找）
        const itemData = window._sfpItemCache && window._sfpItemCache[pid];
        if (itemData && typeof buildSfpPaneAsync === 'function') {
            buildSfpPaneAsync(itemData, sfpContentId);
        }
    }
}

// ── badge 捷徑：展開卡片 + 直接切換到 SFP 選型 tab ─────────
function pcOpenSfpTab(pid) {
    const detail = document.getElementById(`detail-${pid}`);
    if (!detail) return;
    // 若卡片尚未展開，先展開
    if (!detail.classList.contains('open')) {
        pcToggleDetail(pid);
    }
    // 切換到 SFP tab（略微延遲讓 DOM 展開後再切換）
    setTimeout(() => pcSwitchTab(pid, 'sfp'), 80);
}


function renderProductCards(data_list) {
    const container = document.getElementById('prodList');

    if (!container) return;
    if (data_list.length === 0) {
        container.innerHTML = '<div class="placeholder-text">No matching products found</div>';
        return;
    }
    // 建立 SFP item 快取，供 pcSwitchTab 非同步呼叫使用
    window._sfpItemCache = {};

    container.innerHTML = data_list.map((item, idx) => {
        const pid = `pc-${idx}`;
        // 快取 item 供 SFP tab 使用
        window._sfpItemCache[pid] = item;

        const rawType = (item.prod_type || '');
        const prodTypeLower = rawType.toLowerCase();
        const isM = prodTypeLower.includes('manage') && !prodTypeLower.includes('unmanage');
        const displayType = rawType || (isM ? 'Managed' : 'Unmanaged');
        const isW = (item.prod_w_n || '').toLowerCase() === 'wide';
        const resolveCardTotal = (rj, poe) => {
            if (rj === 0) return poe;
            if (poe === 0) return rj;
            if (rj >= poe) return rj;
            return rj + poe;
        };

        const totalRjGiga = resolveCardTotal(item.prod_rj_giga || 0, item.prod_poe_rj_giga || 0);
        const totalRj100 = resolveCardTotal(item.prod_rj_100 || 0, item.prod_poe_rj_100 || 0);
        const totalM12Giga = resolveCardTotal(item.prod_m12_giga || 0, item.prod_poe_m12_giga || 0);
        const totalM12100 = resolveCardTotal(item.prod_m12_100 || 0, item.prod_poe_m12_100 || 0);
        const totalM12Multi = item.prod_m12_multi_giga || 0;
        const totalBypass = (item.prod_bypass_m12_100 || 0) + (item.prod_bypass_m12_giga || 0);

        const sub = [
            totalRjGiga > 0 ? `${totalRjGiga}GE` : '',
            totalRj100 > 0 ? `${totalRj100}FE` : '',
            totalM12Multi > 0 ? `${totalM12Multi}Multi-Giga(2.5/5/10G)` : '',
            totalM12Giga > 0 ? `${totalM12Giga}GE(M12)` : '',
            totalM12100 > 0 ? `${totalM12100}FE(M12)` : '',
            item.prod_fiber_10g > 0 ? `${item.prod_fiber_10g}SFP+(10G)` : '',
            item.prod_fiber_giga > 0 ? `${item.prod_fiber_giga}SFP(GbE)` : '',
            item.prod_fiber_100 > 0 ? `${item.prod_fiber_100}FX` : '',
            totalBypass > 0 ? `${totalBypass}Bypass` : ''
        ].filter(Boolean).join(' + ');
        const poeTotal = (item.prod_poe_rj_100 || 0) + (item.prod_poe_rj_giga || 0) + (item.prod_poe_m12_100 || 0) + (item.prod_poe_m12_giga || 0);

        // SFP badge：依 Fiber Type 顯示對應標籤
        const fiberType = (item.prod_fiber_type || '').trim();
        const sfpBadge = (() => {
            if (fiberType === 'SFP' || fiberType === 'SFP+' || (!fiberType && checkHasSfp(item))) {
                const label = fiberType || 'SFP';
                return `<span class="pb pb-sfp" title="Click to view SFP modules"
                    onclick="event.stopPropagation();pcOpenSfpTab('${pid}')">${label} Guide</span>`;
            }
            if (fiberType && !fiberType.includes('SFP')) {
                // fixed 接頭：Multi-mode / Single-mode / SC
                const fiberConn = (item.prod_fiber_conn || '').trim();
                const connPart = fiberConn ? ` ${fiberConn}` : '';
                const modeShort = fiberType.includes('Multi') ? 'MM' : 'SM';
                return `<span class="pb pb-fiber-fixed" title="Fixed ${fiberType} ${connPart}"
                    onclick="event.stopPropagation();pcOpenSfpTab('${pid}')" style="cursor:pointer">${modeShort}${connPart}</span>`;
            }
            return '';
        })();

        // 場景驗證 badge
        const sceneVerifiedBadge = (() => {
            if (!activeScene) return '';
            const scene = SCENE_TEMPLATES.find(s => s.id === activeScene);
            if (!scene || !scene.appKeywords || !scene.appKeywords.length) return '';
            const appStr = (item.prod_application || '').toLowerCase();
            const matched = scene.appKeywords.some(kw => appStr.includes(kw.toLowerCase()));
            if (!matched) return '';
            return `<span class="pb pb-scene-verified" title="Product spec sheet indicates suitability for ${scene.label} applications">✓ Scene Verified</span>`;
        })();

        const badgeHtml =
            `<span class="pb ${isM ? 'pb-type-m' : 'pb-type-u'}">${displayType}</span>` +
            (isW ? '<span class="pb pb-temp">Wide Temp</span>' : '') +
            (poeTotal > 0 ? `<span class="pb" style="background:#FEF3C7;color:#92400E;border-color:#FCD34D">PoE x${poeTotal}</span>` : '') +
            sfpBadge +
            sceneVerifiedBadge;

        // 組合研華官網搜尋 URL（使用 prod_url 欄位，或自動組合）
        const prodUrl = item.prod_url || `https://www.advantech.com/en/search?q=${encodeURIComponent(item.prod_model)}`;

        // 照片 URL（PNG 優先，onerror 嘗試 JPG，再失敗則隱藏區塊）
        const photoBase = `${API_BASE}/data/pics/${encodeURIComponent(item.prod_model)}`;
        const photoHtml = `<div class="pc-photo" onclick="event.stopPropagation()">
                    <img class="pc-photo-thumb"
                         src="${photoBase}.png"
                         onerror="this.onerror=null;this.src='${photoBase}.jpg';this.onerror=function(){this.closest('.pc-photo').style.display='none';}"
                         alt="${item.prod_model}">
                    <div class="pc-photo-popup">
                        <img src="${photoBase}.png"
                             onerror="this.onerror=null;this.src='${photoBase}.jpg';this.onerror=null;"
                             alt="${item.prod_model}">
                    </div>
                </div>`;

        return `
        <div class="pc" id="${pid}">
            <div class="pc-main" onclick="pcToggleDetail('${pid}')">
                <div class="pc-thumb" style="font-size:12px;font-weight:700;color:#9ca3af;width:24px;text-align:center;">${idx + 1}</div>
                <div class="pc-info">
                    <div class="pc-name">
                        <a class="pc-name-link" href="${prodUrl}" target="_blank" rel="noopener noreferrer"
                            onclick="event.stopPropagation()" title="View ${item.prod_model} on Advantech website">
                            ${item.prod_model}
                            <span class="ext-icon">&#8599;</span>
                        </a>
                    </div>
                    <div class="pc-sub">${sub}</div>
                    <div class="pc-badges">${badgeHtml}</div>
                </div>
                <div class="pc-right">
                    ${photoHtml}
                    <!-- 比較按鈕（用 button 避免 label+checkbox 雙重觸發問題） -->
                    <button class="cmp-cb-wrap" id="cmp-cb-btn-${pid}"
                            onclick="event.stopPropagation(); compareToggle('${pid}')"
                            title="Add to Compare">
                        <span class="cmp-cb-icon">✓</span>
                        <span>Compare</span>
                    </button>
                    <button class="expand-btn" id="expand-btn-${pid}" aria-label="Expand Details"
                        onclick="event.stopPropagation();pcToggleDetail('${pid}')">
                        ⌄
                    </button>
                </div>
            </div>
            <div class="prod-detail" id="detail-${pid}">
                <div class="tab-bar" id="tabbar-${pid}">${buildTabBar(pid, 'port', item)}</div>
                ${buildTabPanes(item, pid)}
                <div class="pc-product-link-bar">
                    <a class="pc-product-link" href="${prodUrl}" target="_blank" rel="noopener noreferrer"
                        onclick="event.stopPropagation()">
                        Go to Product Page
                        <span class="link-arrow">→</span>
                    </a>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════
// 送出篩選條件 → 呼叫後端 API
// ═══════════════════════════════════════════════
function submitItems() {
    let typeVal = document.getElementById('mgmtType').value || 'ALL';
    if (typeVal === 'managed') typeVal = 'Managed';
    if (typeVal === 'unmanaged') typeVal = 'Unmanaged';

    let portVal = parseInt(numInput.value);
    if (isNaN(portVal)) portVal = -1;

    // 移除舊的 zero-result hint
    const oldHint = document.getElementById('zeroResultHint');
    if (oldHint) oldHint.remove();

    // 收集 dark-panel UI 額外條件（需在 snapshot 前計算）
    const extraItems = [];

    // Max Port Speed
    const speedMap = { '100M': 'Speed_100M', '1G': 'Speed_GbE', '10G+': 'Speed_10G' };
    const activeSpeedChip = document.querySelector('#speedChips .dp-chip.active');
    if (activeSpeedChip) {
        const key = speedMap[activeSpeedChip.dataset.val];
        if (key) extraItems.push(key);
    }

    // PoE Required
    if (document.getElementById('poeToggle')?.checked) {
        extraItems.push('Has_PoE');
    }

    // Interface Type (multi-select)
    const ifaceMap = { 'rj45': 'Has_RJ-45', 'fiber': 'Has_Fiber' };
    document.querySelectorAll('#ifaceChips .dp-chip.active').forEach(c => {
        const key = ifaceMap[c.dataset.val];
        if (key) extraItems.push(key);
    });

    // Certifications (multi-select chips)
    document.querySelectorAll('#certChips .dp-chip.active').forEach(c => {
        extraItems.push(c.dataset.val);
    });

    const thisSnapshot = getSnapshotNow(extraItems);

    const requestBody = {
        items: [...Object.keys(selectedItemsMap), ...extraItems],
        type: typeVal,
        portnum: portVal,
        application: 'ALL'
    };

    // 儲存目前的選型條件，供 PDF 報表使用
    window.currentCriteria = {
        ...requestBody,
        // 將 items key 陣列補充友善標籤
        itemLabels: Object.fromEntries(
            Object.keys(selectedItemsMap).map(k => [k, selectedItemsMap[k]])
        )
    };

    fetch(`${API_BASE}/api/submitProdType`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    })
        .then(res => res.json())
        .then(data => {
            if (data.detail && !data.products) {
                alert('API Error: ' + JSON.stringify(data.detail));
                return;
            }
            if (!data.products) return;

            const data_list = data.products;
            currentDataList = data_list;
            const prodList = document.getElementById('prodList');
            const itemCount = document.getElementById('itemCount');
            itemCount.textContent = data_list.length;
            if (prodList) prodList.innerHTML = '';
            // acquiredModels 將在 applySort 中更新

            if (data_list.length === 0 && lastSuccessSnapshot) {
                // 有歷史快照 → 找出哪些條件是新增的（標紅）
                const culprits = {};
                const culpritItems = new Set();
                if (thisSnapshot.mgmt !== lastSuccessSnapshot.mgmt) culprits.mgmt = true;
                if (thisSnapshot.port !== lastSuccessSnapshot.port) culprits.port = true;
                thisSnapshot.items.forEach(key => {
                    if (!lastSuccessSnapshot.items.has(key)) culpritItems.add(key);
                });
                renderSelected(culpritItems);
                renderFilterTags(culprits, culpritItems);
                _appendZeroHint('⚠ No products found. The highlighted condition(s) are newly added and may be causing this.');

            } else if (data_list.length > 0) {
                // 有結果 → 更新快照，清除警告，渲染表格
                lastSuccessSnapshot = {
                    mgmt: thisSnapshot.mgmt,
                    port: thisSnapshot.port,
                    items: new Set(thisSnapshot.items)
                };
                renderSelected();
                renderFilterTags();

                // 搜尋新結果，清除上一次的比較狀態（pid 失效）
                if (typeof compareOnNewResults === 'function') compareOnNewResults();

                applySort();

            } else {
                // 第一次搜尋就無結果 → 全部條件標紅
                const allCulprits = { mgmt: !!thisSnapshot.mgmt, port: !!thisSnapshot.port };
                const allCulpritItems = new Set(thisSnapshot.items);
                renderSelected(allCulpritItems);
                renderFilterTags(allCulprits, allCulpritItems);
                _appendZeroHint('⚠ No products found. The highlighted condition(s) may be causing this. Please broaden your search criteria.');
            }

            updateContextBar();
        })
        .catch(err => {
            console.error(err);
            alert('Error communicating with backend!');
        });
}

// ═══════════════════════════════════════════════
// 排序邏輯
// ═══════════════════════════════════════════════
function applySort() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect || currentDataList.length === 0) {
        acquiredModels = currentDataList.map(item => item.prod_name || item.prod_model);
        tvPage = 1;
        _renderCurrentView(currentDataList);
        return;
    }

    const sortValue = sortSelect.value;
    let sortedList = [...currentDataList];

    // 網管功能權重 (基本 -> 進階)
    const getMgmtWeight = (typeStr) => {
        const lower = (typeStr || '').toLowerCase();
        if (lower.includes('unmanage')) return 0;
        if (lower.includes('smart') || lower.includes('web')) return 1;
        if (lower.includes('l2')) return 2;
        if (lower.includes('l3')) return 4;
        if (lower.includes('manage')) return 3; // 一般 Managed 介於 L2/L3 之間或當作 L3 以下
        return 0;
    };

    sortedList.sort((a, b) => {
        if (sortValue === 'port_asc') {
            return tvCalcTotalPorts(a) - tvCalcTotalPorts(b);
        } else if (sortValue === 'port_desc') {
            return tvCalcTotalPorts(b) - tvCalcTotalPorts(a);
        } else if (sortValue === 'model_asc') {
            return (a.prod_model || '').localeCompare(b.prod_model || '');
        } else if (sortValue === 'model_desc') {
            return (b.prod_model || '').localeCompare(a.prod_model || '');
        } else if (sortValue === 'mgmt_asc') {
            return getMgmtWeight(a.prod_type) - getMgmtWeight(b.prod_type);
        } else if (sortValue === 'mgmt_desc') {
            return getMgmtWeight(b.prod_type) - getMgmtWeight(a.prod_type);
        }
        return 0; // default
    });

    // 更新 Chatbot context 使用的順序
    acquiredModels = sortedList.map(item => item.prod_name || item.prod_model);

    // 依結果內容自動調整 Table 欄位可見性
    autoAdjustTableCols(sortedList);

    // 依目前視圖模式渲染
    tvPage = 1;
    _renderCurrentView(sortedList);
}

function _appendZeroHint(text) {
    const hint = document.createElement('div');
    hint.id = 'zeroResultHint';
    hint.className = 'zero-result-hint';
    hint.innerHTML = text;
    document.querySelector('.lower-part.card').appendChild(hint);
}

// ═══════════════════════════════════════════════
// 重置全部條件
// ═══════════════════════════════════════════════
function resetAll() {
    clearScene();  // 先清除場景（會 restore 場景帶入的 form 值）

    document.getElementById('mgmtType').value = '';
    document.getElementById('numInput').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';

    selectedItemsMap = {};
    fsAppliedKeys = new Set();
    renderSelected();

    // 同步清除 Feature Selector 的選取狀態
    fsReset();

    // 清除比較狀態
    if (typeof compareReset === 'function') compareReset();

    acquiredModels = [];
    document.getElementById('itemCount').textContent = '0';
    const prodList = document.getElementById('prodList');
    if (prodList) prodList.innerHTML = '';

    lastSuccessSnapshot = null;
    const hint = document.getElementById('zeroResultHint');
    if (hint) hint.remove();

    updateContextBar();
    clearChat();
    if (typeof dpResetAll === 'function') dpResetAll();
}

// ═══════════════════════════════════════════════
// Chatbot — 狀態
// ═══════════════════════════════════════════════
let chatHistory = [];
let chatOpen = false;
const CTX_PREVIEW_COUNT = 5;

// ── Chatbot 開關 ──────────────────────────────
function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chatPanel').classList.toggle('open', chatOpen);
    document.getElementById('chatFab').style.display = chatOpen ? 'none' : 'flex';
    if (chatOpen) updateContextBar();
}

// ── 清除對話 ──────────────────────────────────
function clearChat() {
    chatHistory = [];
    document.getElementById('chatMessages').innerHTML = `
        <div class="msg-bubble assistant">
            您好！我是 Advantech 工業交換機選型 AI 助手。<br>
            對話歷史已清除。請先在左側選擇型號後再詢問，或直接描述您的應用需求。
        </div>`;
}

// ── Context Bar 渲染 ──────────────────────────
function renderContextBar(models, expanded) {
    const bar = document.getElementById('contextBar');
    bar.innerHTML = '';
    bar.classList.toggle('expanded', expanded);

    if (models.length === 0) {
        bar.innerHTML = '<span class="ctx-prefix">尚未鎖定任何型號（將進行全庫搜尋）</span>';
        return;
    }

    const firstLine = document.createElement('div');
    firstLine.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

    const prefix = document.createElement('span');
    prefix.className = 'ctx-prefix';
    prefix.textContent = `AI 已鎖定分析 (共 ${models.length} 項)：`;
    firstLine.appendChild(prefix);

    if (models.length > CTX_PREVIEW_COUNT) {
        const btn = document.createElement('button');
        btn.className = 'ctx-expand-btn';
        if (expanded) {
            btn.textContent = '▲ 收起';
            btn.onclick = () => renderContextBar(models, false);
        } else {
            btn.textContent = `▼ +${models.length - CTX_PREVIEW_COUNT} 更多`;
            btn.onclick = () => renderContextBar(models, true);
        }
        firstLine.appendChild(btn);
    }
    bar.appendChild(firstLine);

    const chipLine = document.createElement('div');
    chipLine.style.cssText = 'display:flex; flex-wrap:wrap; gap:2px; margin-top:3px;';
    const displayModels = expanded ? models : models.slice(0, CTX_PREVIEW_COUNT);
    displayModels.forEach(m => {
        const chip = document.createElement('span');
        chip.className = 'ctx-model-chip';
        chip.textContent = m;
        chipLine.appendChild(chip);
    });
    bar.appendChild(chipLine);
}

function updateContextBar() {
    renderContextBar(Array.from(new Set([...acquiredModels])), false);
}

// ── Quick Prompt 捷徑 ─────────────────────────
function sendQuick(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
}

// ── 送出訊息 ──────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    input.style.height = 'auto';

    appendMessage('user', message);
    chatHistory.push({ role: 'user', content: message });

    const loadingEl = appendMessage('assistant', '思考中…', true);
    document.getElementById('chatSendBtn').disabled = true;

    try {
        const payload = {
            message,
            context: {
                selected_models: Array.from(new Set([...acquiredModels])),
                filters: {
                    type: document.getElementById('mgmtType').value,
                    port: numInput.value,
                }
            },
            history: chatHistory.slice(-12).slice(0, -1),
        };

        const resp = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        loadingEl.remove();
        appendMessage('assistant', data.answer, false, data);
        chatHistory.push({ role: 'assistant', content: data.answer });

        // 🌟 關鍵邏輯：延續篩選狀態
        // 如果這次對話有篩選出特定的型號，就把範圍縮小到這些型號中。
        // 這樣下一個問題就會基於這次的結果繼續篩選（And 邏輯）。
        if (data.referenced_models && data.referenced_models.length > 0) {
            acquiredModels = [...data.referenced_models];
        }
    } catch (err) {
        loadingEl.remove();
        appendMessage('assistant', `⚠️ 發生錯誤：${err.message}`);
    } finally {
        document.getElementById('chatSendBtn').disabled = false;
    }
}

// ── 渲染訊息泡泡 ──────────────────────────────
function appendMessage(role, text, isLoading = false, responseData = null) {
    const msgs = document.getElementById('chatMessages');
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role}${isLoading ? ' loading' : ''}`;

    if (typeof marked !== 'undefined') {
        bubble.innerHTML = marked.parse(text);
    } else {
        bubble.innerHTML = text.replace(/\n/g, '<br>');
    }
    wrapper.appendChild(bubble);

    // 參考型號（可收合）
    if (responseData?.referenced_models?.length > 0) {
        const models = responseData.referenced_models;
        const detailsEl = document.createElement('details');
        detailsEl.style.cssText = 'font-size:0.74rem;color:var(--text-muted);margin-top:6px;';
        const summaryEl = document.createElement('summary');
        summaryEl.style.cssText = 'cursor:pointer;list-style:none;display:flex;align-items:center;gap:5px;user-select:none;';
        summaryEl.innerHTML =
            '<span style="color:var(--adv-teal);">\u{1F4C4}</span>' +
            '<span>\u53c3\u8003\u578b\u865f <strong style="color:var(--adv-blue);">(' + models.length + ' \u6b3e)</strong></span>' +
            '<span class="ref-arrow" style="font-size:0.65rem;color:var(--adv-accent);margin-left:2px;">\u25bc \u5c55\u958b</span>';
        detailsEl.addEventListener('toggle', () => {
            const arrow = summaryEl.querySelector('.ref-arrow');
            arrow.textContent = detailsEl.open ? '\u25b2 \u6536\u8d77' : '\u25bc \u5c55\u958b';
        });
        detailsEl.appendChild(summaryEl);
        const chipWrap = document.createElement('div');
        chipWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;padding:4px 0;';
        models.forEach(m => {
            const chip = document.createElement('span');
            chip.className = 'ctx-model-chip';
            chip.textContent = m;
            chipWrap.appendChild(chip);
        });
        detailsEl.appendChild(chipWrap);
        wrapper.appendChild(detailsEl);
    }

    // 可展開的 Datasheet 原文片段
    if (responseData?.sources?.length > 0) {
        const detailsEl = document.createElement('details');
        detailsEl.style.cssText = 'font-size:0.75rem;color:#777;margin-top:8px;border-top:1px dashed #ccc;padding-top:4px;';
        const summaryEl = document.createElement('summary');
        summaryEl.style.cursor = 'pointer';
        summaryEl.textContent = '🔍 查看 AI 參考的原廠規格片段';
        detailsEl.appendChild(summaryEl);

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'margin-top:6px;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px;max-height:150px;overflow-y:auto;';
        responseData.sources.forEach((src, idx) => {
            const p = document.createElement('div');
            p.style.marginBottom = '6px';
            const similarity = (1 - src.distance).toFixed(2);
            p.innerHTML = `<strong>[${idx + 1}] ${src.model}</strong> (相似度: ${similarity})<br>${src.content.replace(/\\n/g, ' ')}`;
            contentDiv.appendChild(p);
        });
        detailsEl.appendChild(contentDiv);
        wrapper.appendChild(detailsEl);
    }

    msgs.appendChild(wrapper);
    msgs.scrollTop = msgs.scrollHeight;
    return wrapper;
}

// ── Enter 送出 / 自動調整高度 ────────────────
document.getElementById('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// ═══════════════════════════════════════════════
// 場景模板功能
// ═══════════════════════════════════════════════

// ── 初始化場景按鈕 ────────────────────────────
function initSceneGrid() {
    const grid = document.getElementById('sceneGrid');
    if (!grid || typeof SCENE_TEMPLATES === 'undefined') return;
    grid.innerHTML = SCENE_TEMPLATES.map(s => `
        <button class="scene-btn" id="scene-btn-${s.id}" onclick="selectScene('${s.id}')">
            <span class="scene-btn-icon">${s.icon}</span>
            <span class="scene-btn-name">${s.label}</span>
            <span class="scene-btn-desc">${s.description}</span>
        </button>
    `).join('');
}

// ── 選擇場景 ─────────────────────────────────
function selectScene(id) {
    if (activeScene === id) { clearScene(); return; } // 再點一次取消
    if (activeScene) clearScene(true);                // 切換場景時先靜默清除

    const scene = SCENE_TEMPLATES.find(s => s.id === id);
    if (!scene) return;

    activeScene = id;
    removedSugKeys = new Set();
    sceneOwnedItemKeys = new Set();

    // 高亮按鈕
    document.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`scene-btn-${id}`).classList.add('active');
    document.getElementById('sceneClearBtn').style.display = 'block';

    // 套用各條件
    scene.conditions.forEach(cond => {
        if (UNSUPPORTED_CONDITION_KEYS.includes(cond.key)) return; // 認證：僅顯示

        const cls = cond.priority === 'required' ? 'scene-prefilled' : 'scene-prefilled-sug';
        switch (cond.key) {
            case 'mgmtType': {
                const el = document.getElementById('mgmtType');
                el.value = cond.value;
                el.className = cls;
                if (typeof dpSyncMgmtChips === 'function') dpSyncMgmtChips();
                break;
            }
            case 'numPorts': {
                const el = document.getElementById('numInput');
                el.value = String(cond.value);
                el.className = cls;
                break;
            }
            case 'poe':
                if (cond.value === true) {
                    selectedItemsMap['Has_PoE'] = 'Has PoE';
                    sceneOwnedItemKeys.add('Has_PoE');
                }
                break;
            case 'tempGrade':
                if (cond.value === 'wide') {
                    selectedItemsMap['Temp_Wide'] = 'Wide Temp (−40°C)';
                    sceneOwnedItemKeys.add('Temp_Wide');
                }
                break;
        }
    });

    renderFilterTags();
    renderSelected();
}

// ── 清除場景 ─────────────────────────────────
function clearScene(silent = false) {
    if (!activeScene) return;

    const scene = SCENE_TEMPLATES.find(s => s.id === activeScene);
    if (scene) {
        scene.conditions.forEach(cond => {
            if (UNSUPPORTED_CONDITION_KEYS.includes(cond.key)) return;
            switch (cond.key) {
                case 'mgmtType': {
                    const el = document.getElementById('mgmtType');
                    if (el.classList.contains('scene-prefilled') || el.classList.contains('scene-prefilled-sug')) {
                        el.value = ''; el.className = '';
                        if (typeof dpSyncMgmtChips === 'function') dpSyncMgmtChips();
                    }
                    break;
                }
                case 'numPorts': {
                    const el = document.getElementById('numInput');
                    if (el.classList.contains('scene-prefilled') || el.classList.contains('scene-prefilled-sug')) {
                        el.value = ''; el.className = '';
                    }
                    break;
                }
            }
        });
    }

    // 移除場景帶入的 selectedItemsMap 項目
    sceneOwnedItemKeys.forEach(key => delete selectedItemsMap[key]);

    // 重置狀態
    activeScene = null;
    removedSugKeys = new Set();
    sceneOwnedItemKeys = new Set();

    document.querySelectorAll('.scene-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('scene-modified');
    });
    const clearBtn = document.getElementById('sceneClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    const restoreBtn = document.getElementById('sceneRestoreBtn');
    if (restoreBtn) restoreBtn.style.display = 'none';

    if (!silent) {
        renderFilterTags();
        renderSelected();
    }
}

// ── 移除建議條件 ──────────────────────────────
function removeSuggestedCondition(key) {
    removedSugKeys.add(key);
    switch (key) {
        case 'mgmtType': {
            const el = document.getElementById('mgmtType');
            el.value = ''; el.className = '';
            if (typeof dpSyncMgmtChips === 'function') dpSyncMgmtChips();
            break;
        }
        case 'numPorts': {
            const el = document.getElementById('numInput');
            el.value = ''; el.className = '';
            break;
        }
        case 'poe':
            delete selectedItemsMap['Has_PoE'];
            sceneOwnedItemKeys.delete('Has_PoE');
            break;
        case 'tempGrade':
            delete selectedItemsMap['Temp_Wide'];
            sceneOwnedItemKeys.delete('Temp_Wide');
            break;
    }
    renderFilterTags();
    renderSelected();
}

// ── 頁面載入後初始化場景按鈕 ─────────────────
initSceneGrid();

// ══════════════════════════════════════════════
// 場景已修改狀態偵測
// ══════════════════════════════════════════════

// 偵測目前場景條件是否與模板預設不同，並更新 UI 狀態
function checkSceneModified() {
    if (!activeScene) return false;
    const scene = SCENE_TEMPLATES.find(s => s.id === activeScene);
    if (!scene) return false;

    let isModified = false;

    // 建議條件被移除 → 已修改
    if (removedSugKeys.size > 0) isModified = true;

    // 比對 DOM 欄位值與場景預設值
    if (!isModified) {
        scene.conditions.forEach(cond => {
            if (UNSUPPORTED_CONDITION_KEYS.includes(cond.key)) return;
            if (cond.key === 'mgmtType') {
                if (document.getElementById('mgmtType').value !== cond.value) isModified = true;
            } else if (cond.key === 'numPorts') {
                if (document.getElementById('numInput').value !== String(cond.value)) isModified = true;
            }
        });
    }

    // 更新場景按鈕外觀（藍 = 正常，橘 = 已修改）
    const btn = document.getElementById(`scene-btn-${activeScene}`);
    if (btn) {
        btn.classList.toggle('scene-modified', isModified);
        btn.classList.toggle('active', !isModified);
    }

    // 顯示 / 隱藏「恢復預設」按鈕
    const restoreBtn = document.getElementById('sceneRestoreBtn');
    if (restoreBtn) restoreBtn.style.display = isModified ? 'block' : 'none';

    return isModified;
}

// 恢復場景至預設條件（重新套用原始模板）
function restoreSceneDefaults() {
    if (!activeScene) return;
    const id = activeScene;
    clearScene(true);   // 靜默清除目前狀態
    selectScene(id);    // 重新套用原始場景條件
}

// ═══════════════════════════════════════════════
// Feature Selector — 事件綁定與橋接
// ═══════════════════════════════════════════════

// ── Modal 開關事件 ────────────────────────────
document.getElementById('advancedFilterBtn')
    .addEventListener('click', openFeatureSelector);
document.getElementById('fs-modal-close')
    .addEventListener('click', closeFeatureSelector);
document.getElementById('fs-cancel-btn')
    .addEventListener('click', closeFeatureSelector);
document.getElementById('fs-apply-btn')
    .addEventListener('click', applyFeatureSelector);

// 點遮罩關閉 Modal
document.getElementById('fs-modal-overlay')
    .addEventListener('click', function (e) {
        if (e.target === this) closeFeatureSelector();
    });

// ── Feature Selector 內部搜尋事件 ────────────
document.getElementById('fs-search')
    .addEventListener('input', function () { fsOnSearchInput(this.value); });
document.getElementById('fs-s-clear')
    .addEventListener('click', fsOnSearchClear);

// ── 橋接函數：將 Feature Selector 結果注入 selectedItemsMap ──
function applyFeatureSelector() {
    const selected = fsGetSelected();
    const newKeys = new Set(selected.map(s => s.key));

    // 移除上次 Apply 帶入、但這次已取消勾選的項目
    fsAppliedKeys.forEach(key => {
        if (!newKeys.has(key)) {
            delete selectedItemsMap[key];
        }
    });

    // 新增或更新目前勾選的項目
    selected.forEach(({ key, label }) => {
        selectedItemsMap[key] = label;
    });

    // 更新追蹤集合
    fsAppliedKeys = newKeys;

    renderSelected();
    closeFeatureSelector();
}

// ═══════════════════════════════════════════════════════════
// TABLE VIEW — 表格視圖
// ═══════════════════════════════════════════════════════════

// ── 狀態 ──────────────────────────────────────────────────
let currentView = 'list';          // 'list' | 'table'
let tvSortCol = null;            // 目前排序欄
let tvSortDir = 1;               // 1=升冪, -1=降冪
let tvPage = 1;
const TV_PAGE_SIZE = 30;

// 所有可選欄位定義
const TV_ALL_COLS = [
    { key: 'totalPorts',  label: 'Total',          title: 'Total Ports',                    default: true,  sortable: true },
    { key: 'rjGiga',      label: 'RJ45-1G',        title: 'RJ-45 GbE ports',                default: true,  sortable: true },
    { key: 'rj100',       label: 'RJ45-FE',        title: 'RJ-45 Fast Ethernet ports',      default: true,  sortable: true },
    { key: 'fiberGiga',   label: 'Fiber-1G',       title: 'Fiber GbE (SFP) ports',          default: true,  sortable: true },
    { key: 'fiber10g',    label: 'Fiber-10G',      title: 'Fiber 10G (SFP+) ports',         default: true,  sortable: true },
    { key: 'fiber100',    label: 'Fiber-100M',     title: 'Fiber 100M fixed ports',         default: false, sortable: true },
    { key: 'fiberCombo',  label: 'Combo',          title: 'GE Combo (RJ45/Fiber shared)',   default: false, sortable: true },
    { key: 'm12Fe',       label: 'M12-FE',         title: 'M12 D-code 10/100M ports',      default: false, sortable: true },
    { key: 'm12Giga',     label: 'M12-1G',         title: 'M12 X-code GbE ports',          default: false, sortable: true },
    { key: 'm12Multi',    label: 'M12-MG',         title: 'M12 Multi-Giga (2.5/5/10G)',    default: false, sortable: true },
    { key: 'bypassFe',    label: 'M12-Bypass-FE',  title: 'LAN Bypass D-code 100M ports',  default: false, sortable: true },
    { key: 'bypassGiga',  label: 'M12-Bypass-1G',  title: 'LAN Bypass X-code GbE ports',   default: false, sortable: true },
    { key: 'poe', label: 'PoE', title: 'PoE port count', default: true, sortable: true },
    { key: 'mgmt', label: 'Mgmt', title: 'Management type', default: true, sortable: false },
    { key: 'temp', label: 'Temp', title: 'Temperature grade (Wide / Standard)', default: true, sortable: false },
    { key: 'power', label: 'Power', title: 'Power input voltage', default: false, sortable: false },
    { key: 'fiber_type', label: 'F.Type', title: 'Fiber connector type', default: false, sortable: false },
    { key: 'application', label: 'App', title: 'Application category', default: false, sortable: false },
];

let tvActiveCols = new Set(TV_ALL_COLS.filter(c => c.default).map(c => c.key));

function autoAdjustTableCols(list) {
    const hasRj      = list.some(i => (i.prod_rj_giga||0)+(i.prod_rj_100||0)+(i.prod_poe_rj_giga||0)+(i.prod_poe_rj_100||0) > 0);
    const hasM12Fe   = list.some(i => (i.prod_m12_100||0)+(i.prod_poe_m12_100||0) > 0);
    const hasM12G    = list.some(i => (i.prod_m12_giga||0)+(i.prod_poe_m12_giga||0) > 0);
    const hasM12MG   = list.some(i => (i.prod_m12_multi_giga||0) > 0);
    const hasBypFe   = list.some(i => (i.prod_bypass_m12_100||0) > 0);
    const hasBypGiga = list.some(i => (i.prod_bypass_m12_giga||0) > 0);

    if (hasRj)    { tvActiveCols.add('rjGiga');    tvActiveCols.add('rj100'); }
    else          { tvActiveCols.delete('rjGiga');  tvActiveCols.delete('rj100'); }

    if (hasM12Fe)   tvActiveCols.add('m12Fe');     else tvActiveCols.delete('m12Fe');
    if (hasM12G)    tvActiveCols.add('m12Giga');   else tvActiveCols.delete('m12Giga');
    if (hasM12MG)   tvActiveCols.add('m12Multi');  else tvActiveCols.delete('m12Multi');
    if (hasBypFe)   tvActiveCols.add('bypassFe');  else tvActiveCols.delete('bypassFe');
    if (hasBypGiga) tvActiveCols.add('bypassGiga');else tvActiveCols.delete('bypassGiga');
}

// ── 視圖切換入口 ───────────────────────────────
function switchView(view) {
    currentView = view;
    tvPage = 1;

    const listBtn = document.getElementById('view-btn-list');
    const tableBtn = document.getElementById('view-btn-table');
    if (listBtn) listBtn.classList.toggle('active', view === 'list');
    if (tableBtn) tableBtn.classList.toggle('active', view === 'table');

    // Col Picker 只在表格模式顯示
    const pickerBtn = document.getElementById('tv-col-picker-btn');
    if (pickerBtn) pickerBtn.style.display = view === 'table' ? '' : 'none';

    // 重新渲染
    _renderCurrentView(currentDataList.length > 0
        ? _getSortedList()
        : []);
}

function _getSortedList() {
    // 借用 applySort 的排序邏輯取得已排序清單
    const sortSelect = document.getElementById('sortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'default';
    let list = [...currentDataList];

    const getMgmtWeight = (t) => {
        const l = (t || '').toLowerCase();
        if (l.includes('unmanage')) return 0;
        if (l.includes('smart') || l.includes('web')) return 1;
        if (l.includes('l2')) return 2;
        if (l.includes('l3')) return 4;
        if (l.includes('manage')) return 3;
        return 0;
    };

    list.sort((a, b) => {
        if (sortValue === 'port_asc') return tvCalcTotalPorts(a) - tvCalcTotalPorts(b);
        if (sortValue === 'port_desc') return tvCalcTotalPorts(b) - tvCalcTotalPorts(a);
        if (sortValue === 'model_asc') return (a.prod_model || '').localeCompare(b.prod_model || '');
        if (sortValue === 'model_desc') return (b.prod_model || '').localeCompare(a.prod_model || '');
        if (sortValue === 'mgmt_asc') return getMgmtWeight(a.prod_type) - getMgmtWeight(b.prod_type);
        if (sortValue === 'mgmt_desc') return getMgmtWeight(b.prod_type) - getMgmtWeight(a.prod_type);
        return 0;
    });
    return list;
}

// ── 統一渲染入口（被 applySort 呼叫）─────────
function _renderCurrentView(list) {
    if (currentView === 'table') {
        renderProductTable(list);
    } else {
        renderProductCards(list);
    }
}

// ── 從各 port 欄位加總計算真實總 port 數 ────────
function tvCalcTotalPorts(item) {
    // Combo port 是共用 physical port，取較大值（不重複計算）
    const rjGiga  = (item.prod_rj_giga||0)  + (item.prod_poe_rj_giga||0);
    const rj100   = (item.prod_rj_100||0)   + (item.prod_poe_rj_100||0);
    const combo   = Math.max(item.prod_fiber_ge_combo||0, item.prod_rj_100_combo||0);
    const fiberG  = item.prod_fiber_giga  || 0;
    const fiber10g= item.prod_fiber_10g   || 0;
    const fiber100= item.prod_fiber_100   || 0;
    const m12G    = (item.prod_m12_giga||0)  + (item.prod_poe_m12_giga||0);
    const m12_100 = (item.prod_m12_100||0)   + (item.prod_poe_m12_100||0);
    const m12Multi= item.prod_m12_multi_giga || 0;
    const bypass  = (item.prod_bypass_m12_100||0) + (item.prod_bypass_m12_giga||0);
    const computed = rjGiga + rj100 + combo + fiberG + fiber10g + fiber100 +
        m12G + m12_100 + m12Multi + bypass;
    // 取計算值與 DB prod_portnum 的較大值：
    // - 計算值修正 DB prod_portnum 錯誤（如 EKI-7712 prod_portnum=4）
    // - prod_portnum 補足模組化產品個別欄位未填的情況（如 EKI-8528 prod_portnum=28）
    return Math.max(computed, item.prod_portnum || 0);
}

// ── 取得單一 item 的欄位值（數字 or 字串）──────
function tvGetVal(item, key) {
    const resolveCardTotal = (a, b) => {
        if (a === 0) return b; if (b === 0) return a;
        return Math.max(a, b);
    };
    switch (key) {
        case 'totalPorts': return tvCalcTotalPorts(item);
        case 'rjGiga':     return (item.prod_rj_giga||0)   + (item.prod_poe_rj_giga||0);
        case 'rj100':      return (item.prod_rj_100||0)    + (item.prod_poe_rj_100||0);
        case 'fiberGiga':  return item.prod_fiber_giga  || 0;
        case 'fiber10g':   return item.prod_fiber_10g   || 0;
        case 'fiber100':   return item.prod_fiber_100   || 0;
        case 'fiberCombo': return Math.max(item.prod_fiber_ge_combo||0, item.prod_rj_100_combo||0);
        case 'm12Fe':      return (item.prod_m12_100||0)   + (item.prod_poe_m12_100||0);
        case 'm12Giga':    return (item.prod_m12_giga||0)  + (item.prod_poe_m12_giga||0);
        case 'm12Multi':   return item.prod_m12_multi_giga || 0;
        case 'bypassFe':   return item.prod_bypass_m12_100  || 0;
        case 'bypassGiga': return item.prod_bypass_m12_giga || 0;
        case 'poe': return (item.prod_poe_rj_100 || 0) + (item.prod_poe_rj_giga || 0) + (item.prod_poe_m12_100 || 0) + (item.prod_poe_m12_giga || 0);
        case 'mgmt': return item.prod_type || '';
        case 'temp': return (item.prod_w_n || '').toLowerCase() === 'wide' ? 'Wide' : 'Standard';
        case 'power': return item.prod_power_input || '—';
        case 'fiber_type': return item.prod_fiber_type || '—';
        case 'application': return item.prod_application || '—';
        default: return '—';
    }
}

// ── 產生欄位的 HTML（格式化）─────────────────
function tvRenderCell(item, key) {
    const v = tvGetVal(item, key);
    if (['totalPorts','rjGiga','rj100','fiberGiga','fiber10g','fiber100',
         'fiberCombo','m12Fe','m12Giga','m12Multi','bypassFe','bypassGiga'].includes(key)) {
        if (v === 0) return `<span class="tv-dash">—</span>`;
        const labelMap = {
            totalPorts:'total',     rjGiga:'RJ45-1G',   rj100:'RJ45-FE',
            fiberGiga:'Fiber-1G',   fiber10g:'Fiber-10G', fiber100:'Fiber-100M',
            fiberCombo:'Combo',     m12Fe:'M12-FE',     m12Giga:'M12-1G',
            m12Multi:'M12-MG',      bypassFe:'Bypass-FE', bypassGiga:'Bypass-1G'
        };
        return `<span class="tv-port-num">${v}</span><span class="tv-port-label">${labelMap[key] || ''}</span>`;
    }
    if (key === 'poe') {
        if (v === 0) return `<span class="tv-dash">—</span>`;
        return `<span class="tv-tag tv-tag-poe">PoE ×${v}</span>`;
    }
    if (key === 'mgmt') {
        const isM = v.toLowerCase().includes('manage') && !v.toLowerCase().includes('unmanage');
        return `<span class="tv-tag ${isM ? 'tv-tag-m' : 'tv-tag-u'}">${v || '—'}</span>`;
    }
    if (key === 'temp') {
        if (v === 'Wide') return `<span class="tv-tag tv-tag-w">Wide Temp</span>`;
        return `<span class="tv-tag tv-tag-std">Standard</span>`;
    }
    if (key === 'fiber_type') {
        if (!v || v === '—') return `<span class="tv-dash">—</span>`;
        return `<span class="tv-tag tv-tag-sfp">${v}</span>`;
    }
    if (key === 'application') {
        if (!v || v === '—') return `<span class="tv-dash">—</span>`;
        return `<span class="tv-tag tv-tag-app">${v}</span>`;
    }
    return `<span>${v}</span>`;
}

// ── 渲染表格 ───────────────────────────────────
function renderProductTable(data_list) {
    const container = document.getElementById('prodList');
    if (!container) return;

    if (data_list.length === 0) {
        container.innerHTML = '<div class="tv-empty">No matching products found</div>';
        return;
    }

    const cols = TV_ALL_COLS.filter(c => tvActiveCols.has(c.key));

    // ── Col Picker UI ──
    let pickerHtml = `
    <div class="col-picker-panel" id="tv-col-panel">
        <div class="col-picker-label">Select columns to display</div>
        <div class="col-chips" id="tv-col-chips">
        ${TV_ALL_COLS.map(c => `
            <div class="col-chip ${tvActiveCols.has(c.key) ? 'on' : ''}"
                 onclick="tvToggleCol('${c.key}',this)">${c.label}</div>
        `).join('')}
        </div>
    </div>`;

    // ── 分頁 ──
    const totalPages = Math.ceil(data_list.length / TV_PAGE_SIZE);
    tvPage = Math.max(1, Math.min(tvPage, totalPages));
    const pageData = data_list.slice((tvPage - 1) * TV_PAGE_SIZE, tvPage * TV_PAGE_SIZE);

    // ── Table header ──
    const sortIconFor = (key) => {
        if (tvSortCol !== key) return `<span class="tv-sort-icon">⇅</span>`;
        return `<span class="tv-sort-icon">${tvSortDir > 0 ? '↑' : '↓'}</span>`;
    };

    let thead = `<tr>
        <th style="position:sticky;left:0;z-index:4;background:var(--adv-gray);width:36px;min-width:36px;text-align:center;padding:9px 6px;border-right:1px solid var(--adv-border);font-family:'IBM Plex Mono',monospace;font-size:0.7rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--adv-border);">#</th>
        <th style="position:sticky;left:37px;z-index:4;background:var(--adv-gray);min-width:160px;box-shadow:3px 0 8px -3px rgba(0,51,102,0.10);cursor:default;font-family:'IBM Plex Mono',monospace;font-size:0.7rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--adv-border);">Model</th>
        ${cols.map(c => `
        <th class="${c.sortable ? '' : 'tv-unsortable'} ${tvSortCol === c.key ? 'tv-sorted' : ''}"
            title="${c.title || c.label}"
            ${c.sortable ? `onclick="tvDoSort('${c.key}')"` : ''}>
            ${c.label}${c.sortable ? sortIconFor(c.key) : ''}
        </th>`).join('')}
        <th style="width:54px;text-align:center;" title="Add to compare panel">Cmp</th>
    </tr>`;

    // ── Table rows ──
    let tbody = pageData.map((item, idx) => {
        const globalIdx = (tvPage - 1) * TV_PAGE_SIZE + idx;
        const pid = `pc-${globalIdx}`;
        const prodUrl = item.prod_url || `https://www.advantech.com/en/search?q=${encodeURIComponent(item.prod_model)}`;

        const totalRj = Math.max(item.prod_rj_giga || 0, item.prod_poe_rj_giga || 0) +
            Math.max(item.prod_rj_100 || 0, item.prod_poe_rj_100 || 0);
        const totalFib = (item.prod_fiber_giga || 0) + (item.prod_fiber_10g || 0) + (item.prod_fiber_100 || 0);
        const totalM12 = Math.max(item.prod_m12_giga || 0, item.prod_poe_m12_giga || 0) +
            Math.max(item.prod_m12_100 || 0, item.prod_poe_m12_100 || 0) +
            (item.prod_m12_multi_giga || 0);
        const subParts = [
            totalRj > 0 ? `${totalRj}×RJ45` : '',
            totalFib > 0 ? `${totalFib}×Fiber` : '',
            totalM12 > 0 ? `${totalM12}×M12` : '',
        ].filter(Boolean).join(' · ');

        // 同步 compare bar 的 active 狀態
        const isCmpActive = typeof compareIsSelected === 'function' && compareIsSelected(pid);

        const rowBg = (globalIdx % 2 === 1) ? '#eef1f6' : '#ffffff';
        const hoverBg = '#ddeaf8';
        return `<tr
            onmouseenter="this.querySelectorAll('.tv-s').forEach(c=>c.style.background='${hoverBg}')"
            onmouseleave="this.querySelectorAll('.tv-s').forEach(c=>c.style.background='${rowBg}')">
            <td class="tv-s" style="position:sticky;left:0;z-index:2;background:${rowBg};width:36px;min-width:36px;text-align:center;font-size:0.72rem;font-family:'IBM Plex Mono',monospace;color:var(--text-muted);padding:9px 6px;border-right:1px solid var(--adv-border);box-shadow:2px 0 6px -2px rgba(0,51,102,0.08);">
                ${globalIdx + 1}
            </td>
            <td class="tv-s" style="position:sticky;left:37px;z-index:2;background:${rowBg};min-width:160px;max-width:210px;box-shadow:3px 0 8px -3px rgba(0,51,102,0.10);padding:9px 10px;">
                <div class="tv-model-name">
                    <a href="${prodUrl}" target="_blank" rel="noopener noreferrer"
                       title="View on Advantech website">${item.prod_model} <span style="font-size:9px;opacity:0.7">↗</span></a>
                </div>
                ${subParts ? `<div class="tv-model-sub">${subParts}</div>` : ''}
            </td>
            ${cols.map(c => `<td>${tvRenderCell(item, c.key)}</td>`).join('')}
            <td class="tv-cmp-cell">
                <button class="tv-cmp-btn ${isCmpActive ? 'selected' : ''}"
                    id="tv-cmp-${pid}"
                    onclick="tvToggleCompare('${pid}',${globalIdx})">
                    ${isCmpActive ? '✓' : '+'}
                </button>
            </td>
        </tr>`;
    }).join('');

    // ── Pagination ──
    let pagerHtml = '';
    if (totalPages > 1) {
        pagerHtml = `
        <div class="tv-pager">
            <span class="tv-pager-info">${data_list.length} results · Page ${tvPage} / ${totalPages}</span>
            <button class="tv-pager-btn" onclick="tvGoPage(${tvPage - 1})" ${tvPage === 1 ? 'disabled' : ''}>‹ Prev</button>
            <span class="tv-pager-page">${tvPage}</span>
            <button class="tv-pager-btn" onclick="tvGoPage(${tvPage + 1})" ${tvPage === totalPages ? 'disabled' : ''}>Next ›</button>
        </div>`;
    }

    container.innerHTML = `
        ${pickerHtml}
        <div class="tv-wrap">
            <table class="tv-table">
                <thead id="tv-thead">${thead}</thead>
                <tbody id="tv-tbody">${tbody}</tbody>
            </table>
        </div>
        ${pagerHtml}
    `;
}

// ── Col 開關 ──────────────────────────────────
function tvToggleCol(key, chipEl) {
    if (tvActiveCols.has(key)) {
        if (tvActiveCols.size <= 1) return; // 至少保留一欄
        tvActiveCols.delete(key);
    } else {
        tvActiveCols.add(key);
    }
    chipEl.classList.toggle('on', tvActiveCols.has(key));
    renderProductTable(_getSortedList());
    // 保持 panel 展開
    const panel = document.getElementById('tv-col-panel');
    if (panel) panel.classList.add('open');
}

// ── Table 內欄位排序 ──────────────────────────
function tvDoSort(key) {
    if (tvSortCol === key) tvSortDir *= -1;
    else { tvSortCol = key; tvSortDir = 1; }
    const list = _getSortedList();
    const col = TV_ALL_COLS.find(c => c.key === key);
    if (col && col.sortable) {
        list.sort((a, b) => {
            const av = tvGetVal(a, key), bv = tvGetVal(b, key);
            if (typeof av === 'number') return (av - bv) * tvSortDir;
            return String(av).localeCompare(String(bv)) * tvSortDir;
        });
    }
    tvPage = 1;
    const wasOpen = document.getElementById('tv-col-panel')?.classList.contains('open');
    renderProductTable(list);
    if (wasOpen) document.getElementById('tv-col-panel')?.classList.add('open');
}

// ── 分頁跳轉 ──────────────────────────────────
function tvGoPage(p) {
    tvPage = p;
    renderProductTable(_getSortedList());
    // scroll to results top
    const lowerPart = document.querySelector('.lower-part.card');
    if (lowerPart) lowerPart.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Compare 橋接 ──────────────────────────────
function tvToggleCompare(pid, globalIdx) {
    // 確保 _sfpItemCache 有對應 item（表格模式下也需要）
    if (!window._sfpItemCache) window._sfpItemCache = {};
    const list = _getSortedList();
    if (list[globalIdx]) window._sfpItemCache[pid] = list[globalIdx];

    if (typeof compareToggle === 'function') {
        compareToggle(pid);
    }
    // 更新按鈕狀態
    const btn = document.getElementById(`tv-cmp-${pid}`);
    if (btn) {
        const active = typeof compareIsSelected === 'function' && compareIsSelected(pid);
        btn.classList.toggle('selected', active);
        btn.textContent = active ? '✓' : '+';
    }
}

// ── Col-picker panel 開關 ─────────────────────
function tvToggleColPanel() {
    const panel = document.getElementById('tv-col-panel');
    if (panel) panel.classList.toggle('open');
}

// ═══════════════════════════════════════════════
// DARK PANEL — chip & toggle helpers
// ═══════════════════════════════════════════════

// Single-select chip (only one active per group)
function dpChipSelect(group, val, btn) {
    const container = btn.closest('.dp-chips');
    container.querySelectorAll('.dp-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');

    if (group === 'mgmt') {
        document.getElementById('mgmtType').value = val;
        document.getElementById('mgmtType').dispatchEvent(new Event('change'));
    } else if (group === 'speed') {
        window._dpSpeed = val;
        renderFilterTags();
    }
}

// Multi-select chip (toggle on/off)
function dpChipToggle(group, val, btn) {
    btn.classList.toggle('active');
    renderFilterTags();
}

// Single-select chip — also triggers renderFilterTags via dpChipSelect already

// PoE toggle label update
function dpUpdatePoE(checkbox) {
    document.getElementById('poeLabel').textContent = checkbox.checked ? 'Required' : 'Not Required';
    renderFilterTags();
}

// Sync MGMT chips to match the hidden select value (called by scene system)
function dpSyncMgmtChips() {
    const val = document.getElementById('mgmtType').value;
    document.querySelectorAll('#mgmtChips .dp-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.val === val);
    });
}

// Clear all dark-panel chips/toggles
function dpResetAll() {
    document.querySelectorAll('#mgmtChips .dp-chip, #speedChips .dp-chip, #ifaceChips .dp-chip, #certChips .dp-chip')
        .forEach(c => c.classList.remove('active'));
    const poe = document.getElementById('poeToggle');
    if (poe) { poe.checked = false; dpUpdatePoE(poe); }
    window._dpSpeed = null;
}

// ═══════════════════════════════════════════════
// Filter Tag × 移除按鈕 helpers
// ═══════════════════════════════════════════════
function ftRemoveMgmt() {
    document.getElementById('mgmtType').value = '';
    document.getElementById('mgmtType').dispatchEvent(new Event('change'));
    document.querySelectorAll('#mgmtChips .dp-chip').forEach(c => c.classList.remove('active'));
    renderFilterTags();
}

function ftRemovePort() {
    document.getElementById('numInput').value = '';
    renderFilterTags();
}

function ftRemovePoe() {
    const poe = document.getElementById('poeToggle');
    if (poe) { poe.checked = false; dpUpdatePoE(poe); }
}

function ftRemoveChip(containerSelector, val) {
    const chip = document.querySelector(`${containerSelector} .dp-chip[data-val="${val}"]`);
    if (chip) chip.classList.remove('active');
    renderFilterTags();
}

