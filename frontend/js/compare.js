/* ═══════════════════════════════════════════════════════════
   Advantech Switch Selection Tool — Product Comparison Module
   ═══════════════════════════════════════════════════════════

   架構說明：
   ┌─────────────────────────────────────────────────────────┐
   │  可擴充設計 (CMP_SECTIONS)                               │
   │  每個 Section 描述一組規格欄位，新增比較維度只需:         │
   │  1. 在 CMP_SECTIONS 陣列新增一個 section object          │
   │  2. 在 item → value 提取函式 (extractValue) 加上對應邏輯 │
   │  無需修改渲染引擎或差異計算邏輯。                         │
   └─────────────────────────────────────────────────────────┘

   公開介面（供 app.js 使用）：
   - compareToggle(pid)       → 勾選/取消勾選一台產品
   - compareReset()           → 清除全部比較狀態（Reset All 時呼叫）
   - compareOnNewResults()    → 搜尋新結果時重置（因卡片 DOM 重建）
   ═══════════════════════════════════════════════════════════ */



// ─────────────────────────────────────────────
// 常數設定
// ─────────────────────────────────────────────
const CMP_MAX = 5;    // 最多同時比較幾台

// ─────────────────────────────────────────────
// 規格欄位定義（可擴充的核心設定）
// ─────────────────────────────────────────────
// 每個 section：{ id, label, fields[] }
// 每個 field：  { id, label, extract(item) → string|number, type: 'num'|'str' }
//
// type='num'：  顯示時 0 以 '—' 替代，非 0 以粗體數字顯示
// type='str'：  原樣顯示，空字串以 '—' 替代
//
// 未來擴充範例（軟體功能）：
//   只需在 CMP_SECTIONS 末尾 push 一個新的 section object：
//   { id: 'software', label: '軟體功能', fields: [ { id:'vlan', label:'VLAN', extract: item => item.sw_vlan, type:'str' }, ... ] }
// ─────────────────────────────────────────────
const CMP_SECTIONS = [
    {
        id: 'basic',
        label: 'Basic Info',
        fields: [
            { id: 'model',       label: 'Model Name',           type: 'str', extract: i => i.prod_model || '' },
            { id: 'type',        label: 'Management',        type: 'str', extract: i => i.prod_type || '' },
            { id: 'portnum',     label: 'Total Ports',          type: 'num', extract: i => i.prod_portnum || 0 },
            { id: 'temp_grade',  label: 'Temp Grade',        type: 'str', extract: i => (i.prod_w_n || 'Normal').trim() },
            { id: 'temp_range',  label: 'Operating Temp',    type: 'str', extract: i => (i.prod_temp_range || '—').trim() },
            { id: 'power',       label: 'Power Input',        type: 'str', extract: i => (i.prod_power_input || '—').trim() },
            { id: 'application', label: 'Application',        type: 'str', extract: i => (i.prod_application || '—').trim() },
        ]
    },
    {
        id: 'ports',
        label: 'Port Specification',
        fields: [
            { id: 'rj_100',         label: 'RJ-45 10/100M',        type: 'num', extract: i => i.prod_rj_100 || 0 },
            { id: 'rj_giga',        label: 'RJ-45 GbE',             type: 'num', extract: i => i.prod_rj_giga || 0 },
            { id: 'poe_rj_100',     label: 'PoE RJ-45 100M',        type: 'num', extract: i => i.prod_poe_rj_100 || 0 },
            { id: 'poe_rj_giga',    label: 'PoE RJ-45 GbE',         type: 'num', extract: i => i.prod_poe_rj_giga || 0 },
            { id: 'fiber_100',      label: 'Fiber 100M',             type: 'num', extract: i => i.prod_fiber_100 || 0 },
            { id: 'fiber_giga',     label: 'Fiber GbE (SFP)',        type: 'num', extract: i => i.prod_fiber_giga || 0 },
            { id: 'fiber_10g',      label: 'Fiber 10G (SFP+)',       type: 'num', extract: i => i.prod_fiber_10g || 0 },
            { id: 'rj_combo',       label: 'RJ-45 / SFP Combo',     type: 'num', extract: i => i.prod_rj_100_combo || 0 },
            { id: 'm12_100',        label: 'M12 D-code 100M',        type: 'num', extract: i => i.prod_m12_100 || 0 },
            { id: 'm12_giga',       label: 'M12 X-code GbE',         type: 'num', extract: i => i.prod_m12_giga || 0 },
            { id: 'm12_multi',      label: 'M12 X-code Multi-Giga',  type: 'num', extract: i => i.prod_m12_multi_giga || 0 },
            { id: 'poe_m12_100',    label: 'PoE M12 D-code',         type: 'num', extract: i => i.prod_poe_m12_100 || 0 },
            { id: 'poe_m12_giga',   label: 'PoE M12 X-code',         type: 'num', extract: i => i.prod_poe_m12_giga || 0 },
            { id: 'bypass_100',     label: 'LAN Bypass D-code',       type: 'num', extract: i => i.prod_bypass_m12_100 || 0 },
            { id: 'bypass_giga',    label: 'LAN Bypass X-code',       type: 'num', extract: i => i.prod_bypass_m12_giga || 0 },
        ]
    },
    {
        id: 'fiber',
        label: 'Fiber Specification',
        fields: [
            { id: 'fiber_type', label: 'Fiber Slot Type', type: 'str', extract: i => (i.prod_fiber_type || '—').trim() },
            { id: 'fiber_conn', label: 'Fixed Connector', type: 'str', extract: i => (i.prod_fiber_conn || '—').trim() },
        ]
    }
    // ─── 未來擴充區（軟體功能規格、認證等）────────────────────
    // 範例：
    // {
    //     id: 'software',
    //     label: '軟體功能',
    //     fields: [
    //         { id: 'vlan', label: 'VLAN', type: 'str', extract: i => i.sw_vlan || '—' },
    //         ...
    //     ]
    // }
];

// ─────────────────────────────────────────────
// 狀態
// ─────────────────────────────────────────────
let _compareSet = new Set();   // pid 集合，如 'pc-0', 'pc-3'

// ─────────────────────────────────────────────
// 公開：切換勾選
// ─────────────────────────────────────────────
function compareToggle(pid) {
    if (_compareSet.has(pid)) {
        _compareSet.delete(pid);
    } else {
        if (_compareSet.size >= CMP_MAX) {
            _showToast(`Can compare up to ${CMP_MAX} products`);
            // 讓 checkbox 視覺維持未勾選
            const cb = document.getElementById(`cmp-cb-${pid}`);
            if (cb) cb.checked = false;
            return;
        }
        _compareSet.add(pid);
    }
    _updateCheckboxVisual(pid);
    _renderBar();
}

// ─────────────────────────────────────────────
// 公開：查詢某 pid 是否在比較清單中
// ─────────────────────────────────────────────
function compareIsSelected(pid) {
    return _compareSet.has(pid);
}

// ─────────────────────────────────────────────
// 公開：清除所有比較狀態（Reset All 時呼叫）
// ─────────────────────────────────────────────
function compareReset() {
    _compareSet.clear();
    // 重置所有卡片上的比較按鈕視覺
    document.querySelectorAll('.cmp-cb-wrap.checked').forEach(btn => btn.classList.remove('checked'));
    _renderBar();
    _closePanel();
}

// ─────────────────────────────────────────────
// 公開：搜尋新結果時呼叫（DOM 重建，舊 pid 失效）
// ─────────────────────────────────────────────
function compareOnNewResults() {
    _compareSet.clear();
    // DOM 重建後舊按鈕已不存在，只需清狀態
    _renderBar();
    _closePanel();
}

// ─────────────────────────────────────────────
// 內部：更新單一卡片 checkbox 視覺
// ─────────────────────────────────────────────
function _updateCheckboxVisual(pid) {
    const btn = document.getElementById(`cmp-cb-btn-${pid}`);
    if (!btn) return;
    const checked = _compareSet.has(pid);
    btn.classList.toggle('checked', checked);
}

// ─────────────────────────────────────────────
// 渲染：底部浮動 Compare Bar
// ─────────────────────────────────────────────
function _renderBar() {
    let bar = document.getElementById('cmp-bar');
    if (!bar) return;

    const count = _compareSet.size;

    if (count === 0) {
        bar.classList.remove('visible');
        document.getElementById('prodList').style.paddingBottom = '';
        return;
    }

    // 收集已選產品的型號名稱
    const chips = [..._compareSet].map(pid => {
        const item = window._sfpItemCache && window._sfpItemCache[pid];
        const label = item ? item.prod_model : pid;
        return `<span class="cmp-bar-chip">${label}
                    <span class="cmp-bar-chip-x" onclick="compareToggle('${pid}')">×</span>
                </span>`;
    }).join('');

    const canCompare = count >= 1;

    bar.innerHTML = `
        <div class="cmp-bar-inner">
            <span class="cmp-bar-label">
                <span class="cmp-bar-count">${count}</span> selected
            </span>
            <div class="cmp-bar-chips">${chips}</div>
            <div class="cmp-bar-actions">
                <button class="cmp-bar-btn" onclick="openComparePanel()"
                    ${canCompare ? '' : 'disabled'} title="${canCompare ? 'View / Compare' : 'Select at least 1 product'}">
                    ⇄ View / Compare
                </button>
                <button class="cmp-bar-clear" onclick="compareReset()">Clear</button>
            </div>
        </div>`;

    bar.classList.add('visible');
    document.getElementById('prodList').style.paddingBottom = '70px';
}

// ─────────────────────────────────────────────
// 開啟比較側拉面板
// ─────────────────────────────────────────────
function openComparePanel() {
    if (_compareSet.size < 1) return;

    // 取得所選產品的資料
    const items = [..._compareSet].map(pid =>
        window._sfpItemCache && window._sfpItemCache[pid]
    ).filter(Boolean);

    if (items.length < 1) {
        _showToast('Products not found, please search again');
        return;
    }

    _buildPanel(items);

    const panel = document.getElementById('cmp-panel');
    if (panel) panel.classList.add('open');
}

// ─────────────────────────────────────────────
// 關閉比較側拉面板（保留勾選狀態）
// ─────────────────────────────────────────────
function _closePanel() {
    const panel = document.getElementById('cmp-panel');
    if (panel) panel.classList.remove('open');
}

// 公開，讓 HTML onclick 可以呼叫
function closeComparePanel() {
    _closePanel();
}

// ─────────────────────────────────────────────
// 核心：建立比較面板內容
// ─────────────────────────────────────────────
function _buildPanel(items) {
    const panel = document.getElementById('cmp-panel');
    if (!panel) return;

    const colCount = items.length;

    // ── 標頭 ──
    const headerHtml = `
        <div class="cmp-panel-header">
            <div class="cmp-panel-title">
                <span class="cmp-panel-icon">⇄</span>
                Compare Specs
                <span class="cmp-panel-count">${colCount} items</span>
            </div>
            <div class="cmp-panel-actions">
                <button class="cmp-panel-dl" onclick="downloadCompareCSV()" title="Download CSV">📥 CSV</button>
                <button class="cmp-panel-dl" onclick="downloadComparePDF()" title="Download PDF">📥 PDF</button>
                <button class="cmp-panel-close" onclick="closeComparePanel()">✕</button>
            </div>
        </div>`;

    // ── 比較表格 ──
    const tableHtml = _buildTable(items);

    panel.innerHTML = headerHtml + `<div class="cmp-panel-body">${tableHtml}</div>`;
}

// ─────────────────────────────────────────────
// 核心：建立比較表格 HTML
// ─────────────────────────────────────────────
function _buildTable(items) {
    const colCount = items.length;

    // ── 產品型號標頭列 ──
    let headerRow = `<tr class="cmp-header-row">
        <th class="cmp-label-col cmp-th-sticky">Specs</th>`;
    items.forEach((item, idx) => {
        const prodUrl = item.prod_url ||
            `https://www.advantech.com/en/search?q=${encodeURIComponent(item.prod_model)}`;
        // 將第一台（左側）加上獨立的 css 類別，供可能的特殊上色使用
        headerRow += `<th class="cmp-prod-col ${idx === 0 ? 'cmp-prod-first' : ''}">
            <div class="cmp-prod-header">
                <div class="cmp-prod-name">${item.prod_model}</div>
                <div class="cmp-prod-pn">${item.prod_name || ''}</div>
                <a class="cmp-prod-link" href="${prodUrl}" target="_blank" rel="noopener noreferrer"
                   title="View on Advantech website: ${item.prod_model}">
                    Advantech Page <span class="cmp-ext-icon">↗</span>
                </a>
            </div>
        </th>`;
    });
    headerRow += '</tr>';

    // ── 各 Section 的資料列 ──
    let bodyRows = '';

    CMP_SECTIONS.forEach(section => {
        // 篩選出「至少有一台產品有值」的欄位（0 或 '—' 的全部相同則隱藏）
        const visibleFields = section.fields.filter(field => {
            const vals = items.map(item => field.extract(item));
            if (field.type === 'num') {
                return vals.some(v => v > 0);
            } else {
                return vals.some(v => v && v !== '—' && v !== '');
            }
        });

        if (visibleFields.length === 0) return; // 整個 section 都沒有值，跳過

        // Section 標頭列
        bodyRows += `<tr class="cmp-section-row">
            <td class="cmp-section-label cmp-label-col" colspan="${colCount + 1}">
                ${section.label}
            </td>
        </tr>`;

        // 各規格欄位列
        visibleFields.forEach(field => {
            const vals = items.map(item => field.extract(item));
            const isDiff = _hasDiff(vals, field.type);

            let rowClass = 'cmp-data-row';
            if (!isDiff) rowClass += ' cmp-row-same';

            bodyRows += `<tr class="${rowClass}">
                <td class="cmp-label-col cmp-field-label">${field.label}</td>`;

            vals.forEach(v => {
                const { display, highlight } = _formatCell(v, field.type, vals, isDiff);
                const cellClass = 'cmp-data-cell' + (highlight ? ' cmp-cell-diff' : '');
                bodyRows += `<td class="${cellClass}">${display}</td>`;
            });

            bodyRows += '</tr>';
        });
    });

    return `
        <div class="cmp-table-wrap">
            <table class="cmp-table">
                <thead>${headerRow}</thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
        <div class="cmp-legend">
            <span class="cmp-legend-diff">▪</span> Highlight = Difference
            &nbsp;&nbsp;
            <span class="cmp-legend-same">—</span> Dim = Same
        </div>`;
}

// ─────────────────────────────────────────────
// 工具：判斷一列中是否有差異
// ─────────────────────────────────────────────
function _hasDiff(vals, type) {
    if (vals.length <= 1) return false;
    const normalized = vals.map(v =>
        type === 'num' ? (v || 0) : String(v || '—').trim().toLowerCase()
    );
    return !normalized.every(v => v === normalized[0]);
}

// ─────────────────────────────────────────────
// 工具：格式化單一格顯示與是否高亮
// ─────────────────────────────────────────────
function _formatCell(val, type, allVals, isDiff) {
    if (type === 'num') {
        const n = val || 0;
        const display = n === 0
            ? '<span class="cmp-val-zero">—</span>'
            : `<span class="cmp-val-num">${n}</span>`;

        // 高亮：與其他值不同（只在有差異的列中高亮「不是最多的那些」）
        const maxVal = Math.max(...allVals.map(v => v || 0));
        const highlight = isDiff && n < maxVal;
        return { display, highlight };
    } else {
        const s = String(val || '—').trim();
        let display = '';
        
        if (s === '—' || s === '') {
            display = '<span class="cmp-val-zero">—</span>';
        } else if (s === '✓' || s === 'V') {
            display = '<span class="cmp-val-check">✓</span>';
        } else if (s === 'X' || s === 'x') {
            display = '<span class="cmp-val-cross">X</span>';
        } else {
            display = `<span class="cmp-val-str">${s}</span>`;
        }

        // 字串：與第一台不同即高亮
        const base = String(allVals[0] || '—').trim().toLowerCase();
        const highlight = isDiff && s.toLowerCase() !== base;
        return { display, highlight };
    }
}

// ─────────────────────────────────────────────
// Toast 提示（輕量替代 alert）
// ─────────────────────────────────────────────
function _showToast(msg) {
    let toast = document.getElementById('cmp-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cmp-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────
// 下載：CSV
// ─────────────────────────────────────────────
function downloadCompareCSV() {
    const items = [..._compareSet].map(pid =>
        window._sfpItemCache && window._sfpItemCache[pid]
    ).filter(Boolean);
    if (items.length === 0) return;

    let csv = '\uFEFF'; // BOM
    const headers = ['Specification', ...items.map(i => i.prod_model)];
    csv += headers.map(h => `"${h}"`).join(',') + '\n';

    CMP_SECTIONS.forEach(section => {
        const visibleFields = section.fields.filter(field => {
            const vals = items.map(item => field.extract(item));
            if (field.type === 'num') return vals.some(v => v > 0);
            return vals.some(v => v && v !== '—' && v !== '');
        });
        if (visibleFields.length === 0) return;

        // Section header
        csv += `"${section.label}"\n`;

        visibleFields.forEach(field => {
            const row = [field.label];
            items.forEach(item => {
                let val = field.extract(item);
                if (field.type === 'num' && !val) val = '—';
                else if (field.type === 'str' && (!val || val === '')) val = '—';
                row.push(val);
            });
            csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
        });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Advantech_Switch_Comparison.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// 下載：PDF
// ─────────────────────────────────────────────
async function downloadComparePDF() {
    if (typeof _compareSet === 'undefined' || _compareSet.size === 0) {
        _showToast("No product selected");
        return;
    }
    
    // 從 _sfpItemCache 取出對應的 PN
    const pns = [..._compareSet].map(pid => {
        const item = window._sfpItemCache && window._sfpItemCache[pid];
        return item ? item.prod_name : null;
    }).filter(Boolean);

    if (pns.length === 0) {
        _showToast("Corresponding product PN not found, please search again");
        return;
    }
    
    // 如果有全域保存條件 (例如 currentCriteria) 可以傳入，否則傳空 {}
    let criteria = window.currentCriteria ? JSON.parse(JSON.stringify(window.currentCriteria)) : {};
    
    // 確保 l2_managed 和 l3_managed 等傳給後端時顯示為友善名稱
    if (criteria.type) {
        let t = criteria.type.toLowerCase();
        if (t === "l2_managed" || t === "l2 managed") {
            criteria.type = "L2 Managed";
        } else if (t === "l3_managed" || t === "l3 managed") {
            criteria.type = "L3 Managed";
        } else if (t === "managed") {
            criteria.type = "Managed (L2 + L3)";
        } else if (t === "unmanaged") {
            criteria.type = "Unmanaged";
        }
    }

    try {
        _showToast("Generating PDF, please wait...");
        const res = await fetch(`${typeof API_BASE !== 'undefined' ? API_BASE : ''}/api/exportReport`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_pns: pns,
                criteria: criteria
            })
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }
        
        // 取得 blob 並觸發下載（明確指定 type，用 setAttribute 確保副檔名正確）
        const rawBlob = await res.blob();
        const url = URL.createObjectURL(
            new Blob([rawBlob], { type: 'application/pdf' })
        );
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.setAttribute('download', 'selection_report.pdf');
        document.body.appendChild(a);
        a.click();
        // 延遲清理，確保下載已觸發
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 1000);
        _showToast("PDF download complete");
    } catch (err) {
        console.error(err);
        _showToast("PDF generation failed, please try again later");
    }
}
