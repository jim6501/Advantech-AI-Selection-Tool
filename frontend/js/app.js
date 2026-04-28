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
    return window.location.origin;
}

const API_BASE = detectApiBase();
console.log(`[API] 後台連線位址: ${API_BASE}`);

// ═══════════════════════════════════════════════
// 共用狀態
// ═══════════════════════════════════════════════
let selectedItemsMap = {};   // { key: label } 儲存已選取的特徵
let acquiredModels    = [];  // 後端回傳的型號清單（供 Chatbot context 使用）
let lastSuccessSnapshot = null; // 上一次有結果的條件快照 { mgmt, port, items: Set }

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
                div.textContent = `[${item.category}] ${item.label}`;
                div.onclick = () => addItem(item);
                resultDiv.appendChild(div);
            });
        });
});

function addItem(item) {
    if (selectedItemsMap[item.key]) return;
    selectedItemsMap[item.key] = item.label;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    renderSelected();
}

function removeItem(itemKey) {
    delete selectedItemsMap[itemKey];
    renderSelected();
}

// ═══════════════════════════════════════════════
// 條件快照（用於「零結果」警告判斷）
// ═══════════════════════════════════════════════
function getSnapshotNow() {
    return {
        mgmt: document.getElementById('mgmtType').value,
        port: document.getElementById('numInput').value,
        items: new Set(Object.keys(selectedItemsMap))
    };
}

// ═══════════════════════════════════════════════
// 渲染：已選特徵 tags
// ═══════════════════════════════════════════════
function renderSelected(culpritItems = new Set()) {
    const container = document.getElementById('selectedItems');
    container.innerHTML = '';
    Object.keys(selectedItemsMap).forEach(key => {
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
function renderFilterTags(culprits = {}) {
    const filterDiv = document.getElementById('filterTags');
    filterDiv.innerHTML = '';

    const mgmtVal = document.getElementById('mgmtType').value;
    const portVal = document.getElementById('numInput').value;

    if (mgmtVal) {
        const label = mgmtVal === 'managed' ? 'Managed' : 'Unmanaged';
        const tag = document.createElement('span');
        tag.className = 'filter-tag' + (culprits.mgmt ? ' culprit' : '');
        tag.innerHTML = `<span class="filter-icon">⚙</span> Type: ${label}`;
        filterDiv.appendChild(tag);
    }
    if (portVal) {
        const tag = document.createElement('span');
        tag.className = 'filter-tag' + (culprits.port ? ' culprit' : '');
        tag.innerHTML = `<span class="filter-icon">🔌</span> Port: ${portVal}`;
        filterDiv.appendChild(tag);
    }
    if (!mgmtVal && !portVal) {
        filterDiv.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted);font-style:italic;">No filters applied yet</span>';
    }
}

// 下拉條件變動時，即時更新 filter tags
document.getElementById('mgmtType').addEventListener('change', () => renderFilterTags());
document.getElementById('numInput').addEventListener('change', () => renderFilterTags());

// 初始化
renderFilterTags();

// ═══════════════════════════════════════════════
// 送出篩選條件 → 呼叫後端 API
// ═══════════════════════════════════════════════
function submitItems() {
    let typeVal = document.getElementById('mgmtType').value || 'ALL';
    if (typeVal === 'managed')   typeVal = 'Managed';
    if (typeVal === 'unmanaged') typeVal = 'Unmanaged';

    let portVal = parseInt(numInput.value);
    if (isNaN(portVal)) portVal = -1;

    const thisSnapshot = getSnapshotNow();

    // 移除舊的 zero-result hint
    const oldHint = document.getElementById('zeroResultHint');
    if (oldHint) oldHint.remove();

    fetch(`${API_BASE}/api/submitProdType`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: Object.keys(selectedItemsMap),
            type: typeVal,
            portnum: portVal,
            application: 'ALL'
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.detail && !data.products) {
            alert('API Error: ' + JSON.stringify(data.detail));
            return;
        }
        if (!data.products) return;

        const data_list  = data.products;
        const tableBody  = document.getElementById('tableBody');
        const itemCount  = document.getElementById('itemCount');
        itemCount.textContent = data_list.length;
        tableBody.innerHTML   = '';

        // 更新 Chatbot context 用的型號清單
        acquiredModels = data_list.map(item => item.prod_name || item);

        if (data_list.length === 0 && lastSuccessSnapshot) {
            // 有歷史快照 → 找出哪些條件是新增的（標紅）
            const culprits     = {};
            const culpritItems = new Set();
            if (thisSnapshot.mgmt !== lastSuccessSnapshot.mgmt) culprits.mgmt = true;
            if (thisSnapshot.port !== lastSuccessSnapshot.port) culprits.port = true;
            thisSnapshot.items.forEach(key => {
                if (!lastSuccessSnapshot.items.has(key)) culpritItems.add(key);
            });
            renderSelected(culpritItems);
            renderFilterTags(culprits);
            _appendZeroHint('⚠ 無符合產品。標示為紅色的條件是本次新增且可能導致無結果的篩選項。');

        } else if (data_list.length > 0) {
            // 有結果 → 更新快照，清除警告，渲染表格
            lastSuccessSnapshot = {
                mgmt: thisSnapshot.mgmt,
                port: thisSnapshot.port,
                items: new Set(thisSnapshot.items)
            };
            renderSelected();
            renderFilterTags();

            data_list.forEach((item, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${item.prod_model}</td>
                    <td>${item.prod_type}</td>
                    <td>${item.prod_portnum || 0}</td>
                    <td>${item.prod_rj_100 || 0}</td>
                    <td>${item.prod_rj_giga || 0}</td>
                    <td>${item.prod_rj_100_combo || 0}</td>
                    <td>${item.prod_fiber_100 || 0}</td>
                    <td>${item.prod_fiber_giga || 0}</td>
                    <td>${item.prod_fiber_ge_combo || 0}</td>
                    <td>${item.prod_w_n}</td>
                `;
                tableBody.appendChild(row);
            });

        } else {
            // 第一次搜尋就無結果 → 全部條件標紅
            const allCulprits     = { mgmt: !!thisSnapshot.mgmt, port: !!thisSnapshot.port };
            const allCulpritItems = new Set(thisSnapshot.items);
            renderSelected(allCulpritItems);
            renderFilterTags(allCulprits);
            _appendZeroHint('⚠ 無符合產品。標示為紅色的條件是可能導致無結果的篩選項，請嘗試放寬條件。');
        }

        updateContextBar();
    })
    .catch(err => {
        console.error(err);
        alert('連線後端發生錯誤！');
    });
}

function _appendZeroHint(text) {
    const hint = document.createElement('div');
    hint.id        = 'zeroResultHint';
    hint.className = 'zero-result-hint';
    hint.innerHTML = text;
    document.querySelector('.lower-part.card').appendChild(hint);
}

// ═══════════════════════════════════════════════
// 重置全部條件
// ═══════════════════════════════════════════════
function resetAll() {
    document.getElementById('mgmtType').value    = '';
    document.getElementById('numInput').value     = '';
    document.getElementById('searchInput').value  = '';
    document.getElementById('searchResults').innerHTML = '';

    selectedItemsMap = {};
    renderSelected();

    acquiredModels = [];
    document.getElementById('itemCount').textContent = '0';
    document.getElementById('tableBody').innerHTML   = '';

    lastSuccessSnapshot = null;
    const hint = document.getElementById('zeroResultHint');
    if (hint) hint.remove();

    updateContextBar();
    clearChat();
}

// ═══════════════════════════════════════════════
// Chatbot — 狀態
// ═══════════════════════════════════════════════
let chatHistory = [];
let chatOpen    = false;
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
        chip.className   = 'ctx-model-chip';
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
    const input   = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    input.value        = '';
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
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        loadingEl.remove();
        appendMessage('assistant', data.answer, false, data);
        chatHistory.push({ role: 'assistant', content: data.answer });

    } catch (err) {
        loadingEl.remove();
        appendMessage('assistant', `⚠️ 發生錯誤：${err.message}`);
    } finally {
        document.getElementById('chatSendBtn').disabled = false;
    }
}

// ── 渲染訊息泡泡 ──────────────────────────────
function appendMessage(role, text, isLoading = false, responseData = null) {
    const msgs    = document.getElementById('chatMessages');
    const wrapper = document.createElement('div');
    wrapper.style.display       = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems    = role === 'user' ? 'flex-end' : 'flex-start';

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
        const models  = responseData.referenced_models;
        const detailsEl = document.createElement('details');
        detailsEl.style.cssText = 'font-size:0.74rem;color:var(--text-muted);margin-top:6px;';
        const summaryEl = document.createElement('summary');
        summaryEl.style.cssText = 'cursor:pointer;list-style:none;display:flex;align-items:center;gap:5px;user-select:none;';
        summaryEl.innerHTML =
            '<span style="color:var(--adv-teal);">\u{1F4C4}</span>' +
            '<span>\u53c3\u8003\u578b\u865f <strong style="color:var(--adv-blue);">('+models.length+' \u6b3e)</strong></span>' +
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
        summaryEl.style.cursor   = 'pointer';
        summaryEl.textContent    = '🔍 查看 AI 參考的原廠規格片段';
        detailsEl.appendChild(summaryEl);

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'margin-top:6px;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px;max-height:150px;overflow-y:auto;';
        responseData.sources.forEach((src, idx) => {
            const p         = document.createElement('div');
            p.style.marginBottom = '6px';
            const similarity     = (1 - src.distance).toFixed(2);
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
