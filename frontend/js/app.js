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
let acquiredModels = [];  // 後端回傳的型號清單（供 Chatbot context 使用）
let lastSuccessSnapshot = null; // 上一次有結果的條件快照 { mgmt, port, items: Set }

// ── 場景模板狀態 ──────────────────────────────
let activeScene = null;       // 目前啟用的場景 id
let removedSugKeys = new Set();  // 使用者移除的建議條件 key
let sceneOwnedItemKeys = new Set();  // 場景帶入 selectedItemsMap 的 key（避免雙重顯示）

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
function renderFilterTags(culprits = {}) {
    const filterDiv = document.getElementById('filterTags');
    filterDiv.innerHTML = '';

    if (activeScene) {
        // ── 場景模式：場景 tag + 必選/建議 tag ────────────
        const scene = SCENE_TEMPLATES.find(s => s.id === activeScene);
        if (!scene) return;

        // 場景來源 tag（深藍）
        const sceneTag = document.createElement('span');
        sceneTag.className = 'filter-tag-scene';
        sceneTag.textContent = `${scene.icon} ${scene.label} 模板`;
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
            if (isValueModified) {
                tag.className = 'filter-tag-modified';
                tag.textContent = `⚠ ${label}（已改）`;
            } else if (cond.priority === 'required') {
                tag.className = 'filter-tag-req';
                tag.textContent = `🔒 ${label}`;
            } else {
                tag.className = 'filter-tag-sug';
                tag.innerHTML = `${label} <span class="tag-remove" onclick="removeSuggestedCondition('${cond.key}')">×</span>`;
            }
            filterDiv.appendChild(tag);
        });

        // ── 補渲染使用者手動調整的欄位（不在場景條件或已移除建議時）──
        const sceneMgmtActive = scene.conditions.some(c => c.key === 'mgmtType' && !removedSugKeys.has('mgmtType'));
        const scenePortActive = scene.conditions.some(c => c.key === 'numPorts' && !removedSugKeys.has('numPorts'));

        const mgmtManual = document.getElementById('mgmtType').value;
        if (mgmtManual && !sceneMgmtActive) {
            const lbl = mgmtManual === 'managed' ? 'Managed' : 'Unmanaged';
            const t = document.createElement('span');
            t.className = 'filter-tag';
            t.textContent = `⚙ Type: ${lbl}`;
            filterDiv.appendChild(t);
        }

        const portManual = document.getElementById('numInput').value;
        if (portManual && !scenePortActive) {
            const t = document.createElement('span');
            t.className = 'filter-tag';
            t.textContent = `🔌 Port: ≥${portManual}`;
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
        const reqCount = scene.conditions.filter(c => c.priority === 'required' && !removedSugKeys.has(c.key)).length;
        const sugCount = scene.conditions.filter(c => c.priority === 'suggested' && !removedSugKeys.has(c.key)).length;
        const certNote = scene.conditions.some(c => c.key === 'certifications')
            ? '認證條件目前為顯示用，DB 欄位確認後將納入查詢。' : '';
        note.textContent = `套用「${scene.label}」模板：${reqCount} 項必選、${sugCount} 項建議條件。${certNote}`;

        // 偵測場景是否已被使用者修改
        checkSceneModified();

    } else {
        // ── 手動模式：原有綠色 tag 行為 ──────────────────
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
            tag.innerHTML = `<span class="filter-icon">🔌</span> Port: ≥${portVal}`;
            filterDiv.appendChild(tag);
        }
        if (!mgmtVal && !portVal) {
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
// 送出篩選條件 → 呼叫後端 API
// ═══════════════════════════════════════════════
function submitItems() {
    let typeVal = document.getElementById('mgmtType').value || 'ALL';
    if (typeVal === 'managed') typeVal = 'Managed';
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

            const data_list = data.products;
            const tableBody = document.getElementById('tableBody');
            const itemCount = document.getElementById('itemCount');
            itemCount.textContent = data_list.length;
            tableBody.innerHTML = '';

            // 更新 Chatbot context 用的型號清單
            acquiredModels = data_list.map(item => item.prod_name || item);

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
                const allCulprits = { mgmt: !!thisSnapshot.mgmt, port: !!thisSnapshot.port };
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
    renderSelected();

    acquiredModels = [];
    document.getElementById('itemCount').textContent = '0';
    document.getElementById('tableBody').innerHTML = '';

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
                    selectedItemsMap['has_poe'] = 'Has PoE';
                    sceneOwnedItemKeys.add('has_poe');
                }
                break;
            case 'tempGrade':
                if (cond.value === 'wide') {
                    selectedItemsMap['temp_wide'] = 'Wide Temp (−40°C)';
                    sceneOwnedItemKeys.add('temp_wide');
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
            break;
        }
        case 'numPorts': {
            const el = document.getElementById('numInput');
            el.value = ''; el.className = '';
            break;
        }
        case 'poe':
            delete selectedItemsMap['has_poe'];
            sceneOwnedItemKeys.delete('has_poe');
            break;
        case 'tempGrade':
            delete selectedItemsMap['temp_wide'];
            sceneOwnedItemKeys.delete('temp_wide');
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
