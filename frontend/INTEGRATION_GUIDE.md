# RAG Chatbot 微服務 — 前端整合指南

這份文件是給主畫面前端團隊 (`172.16.12.86`) 的整合說明。
只需將以下三段程式碼融入你們的 HTML，即可將「AI 產品選型助手 (Chatbot)」嵌入到現有的 `select_ui_with_options.html` 中。

## ① 在 `<head>` 區塊新增的內容

```html
<!-- 宣告 RAG API 位址 (請改為 RAG 後台的真實 IP) -->
<script>
    const RAG_API = "http://172.16.12.99:8000"; 
</script>

<!-- 引入 marked.js 以美化表格和清單的顯示 -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<!-- 加入 Chatbot 面板的 CSS 樣式 -->
<style>
    /* ═══════════════════════════════════════════════════
       CHATBOT PANEL STYLES
    ═══════════════════════════════════════════════════ */
    :root {
        --chat-bg: #ffffff;
        --chat-user: #003366;
        --chat-ai: #f0f4f8;
        --chat-width: 380px;
    }

    #chatFab {
        position: fixed; bottom: 30px; right: 30px; width: 56px; height: 56px;
        background: var(--adv-blue, #003366); color: #fff; border: none; border-radius: 50%;
        font-size: 1.5rem; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000; transition: transform 0.2s; display: flex; align-items: center; justify-content: center;
    }
    #chatFab:hover { transform: scale(1.05); }

    #chatPanel {
        position: fixed; bottom: 0; right: 0; width: var(--chat-width); height: 100vh;
        background: var(--chat-bg); border-left: 1px solid var(--adv-border, #d1d4d7);
        box-shadow: -4px 0 16px rgba(0,0,0,0.12); display: flex; flex-direction: column;
        z-index: 999; transform: translateX(100%); transition: transform 0.3s ease;
    }
    #chatPanel.open { transform: translateX(0); }

    #chatHeader {
        background: var(--adv-blue, #003366); color: #fff; padding: 14px 16px;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    #chatCloseBtn { background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer; }

    #contextBar {
        background: var(--adv-light-blue, #e6f0fa); padding: 8px 14px; font-size: 0.78rem;
        color: #555; border-bottom: 1px solid var(--adv-border, #d1d4d7); flex-shrink: 0; min-height: 30px;
    }

    #chatMessages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

    .msg-bubble { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 0.88rem; line-height: 1.5; word-break: break-word; }
    .msg-bubble.user { background: var(--adv-blue, #003366); color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
    .msg-refs { font-size: 0.75rem; color: #777; margin-top: 6px; padding-left: 2px; }
    
    /* Markdown 樣式修正 */
    .msg-bubble p { margin-top: 0; margin-bottom: 8px; }
    .msg-bubble p:last-child { margin-bottom: 0; }
    .msg-bubble table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.8rem; }
    .msg-bubble th, .msg-bubble td { border: 1px solid #ccc; padding: 6px; text-align: left; }
    .msg-bubble th { background: rgba(0,0,0,0.05); }

    .msg-bubble.loading { color: #999; font-style: italic; }

    #quickPrompts { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px; border-top: 1px solid var(--adv-border, #d1d4d7); flex-shrink: 0; }
    .quick-btn { background: var(--adv-light-blue, #e6f0fa); border: 1px solid var(--adv-border, #d1d4d7); color: var(--adv-blue, #003366); padding: 4px 10px; border-radius: 12px; font-size: 0.78rem; cursor: pointer; transition: background 0.15s; }
    .quick-btn:hover { background: #d0e3f5; }

    #chatInputBar { display: flex; padding: 12px; gap: 8px; border-top: 1px solid var(--adv-border, #d1d4d7); flex-shrink: 0; }
    #chatInput { flex: 1; padding: 10px 12px; border: 1px solid #ccc; border-radius: 20px; font-size: 0.88rem; outline: none; resize: none; font-family: inherit; }
    #chatInput:focus { border-color: var(--adv-blue, #003366); }
    #chatSendBtn { background: var(--adv-blue, #003366); color: #fff; border: none; border-radius: 50%; width: 38px; height: 38px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #chatSendBtn:disabled { background: #aaa; cursor: not-allowed; }
</style>
```

## ② 在 `<body>` 結尾處新增的 HTML 結構（浮動按鈕與側邊欄）

請貼在你們原有 HTML 的 `<script>` 腳本之前、`</body>` 之內：

```html
<!-- ═══════════════ CHATBOT PANEL ═══════════════ -->
<button id="chatFab" onclick="toggleChat()" title="AI 選型助手">💬</button>

<div id="chatPanel">
    <div id="chatHeader">
        <span>🤖 AI 選型助手</span>
        <button id="chatCloseBtn" onclick="toggleChat()">✕</button>
    </div>
    <div id="contextBar">尚未選擇任何型號</div>
    <div id="chatMessages">
        <div class="msg-bubble assistant">
            您好！我是 Advantech 工業交換機選型 AI 助手。<br>
            請先在左側選擇型號後再詢問，或直接描述您的應用需求。
        </div>
    </div>
    <div id="quickPrompts">
        <button class="quick-btn" onclick="sendQuick('這些設備的工作溫度範圍是？')">🌡️ 溫度規格</button>
        <button class="quick-btn" onclick="sendQuick('哪款支援 PoE？功率是多少？')">⚡ PoE 功能</button>
        <button class="quick-btn" onclick="sendQuick('比較這些型號的 Port 數量與類型')">🔌 Port 比較</button>
        <button class="quick-btn" onclick="sendQuick('適合哪些工業應用場景？')">🏭 應用場景</button>
    </div>
    <div id="chatInputBar">
        <textarea id="chatInput" rows="1" placeholder="輸入問題…（Enter 送出）"></textarea>
        <button id="chatSendBtn" onclick="sendMessage()">➤</button>
    </div>
</div>
```

## ③ Javascript 的更新（兩種修改）

### 3-1. 更新你們現有的 `addItem()` 與 `removeItem()`：
需在裡面呼叫 `updateContextBar()`，讓 UI 即時顯示 Chatbot 在鎖定哪些型號：

```javascript
// 在現有程式碼中加入呼叫 updateContextBar()
// 並且宣告一個變數存放從後端篩選來的型號
let acquiredModels = [];

function addItem(item) {
    if (selectedItems.includes(item)) return;
    selectedItems.push(item);
    renderSelected();
    updateContextBar();  // <- 新增這行
}

function removeItem(item) {
    selectedItems = selectedItems.filter(i => i !== item);
    renderSelected();
    updateContextBar();  // <- 新增這行
}

// 假設這是你們原本發送篩選條件的 function
function submitItems() {
    fetch("你們的後端 API", { /* ... */ })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            const data_list = data.products;
            
            // ⭐️ 新增：擷取回傳的產品名稱到 acquiredModels
            // 因為你們的 JSON 是 [{"prod_name": "EKI-..."}, ...]
            acquiredModels = data_list.map(item => item.prod_name);
            
            // 渲染表格...
            
            // ⭐️ 新增：送出過濾後也要更新 Chatbot 面板的上下文
            updateContextBar();
        }
    });
}
```

### 3-2. 貼上 Chatbot 專屬邏輯：

將以下程式碼加在你們原本的 `<script>` 區塊內：

```javascript
// ═══════════════════════════════════════════════
// Chatbot 邏輯
// ═══════════════════════════════════════════════
let chatHistory = [];
let chatOpen = false;

function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chatPanel').classList.toggle('open', chatOpen);
    // 當側邊欄打開時，隱藏浮動按鈕避免擋住輸入框
    document.getElementById('chatFab').style.display = chatOpen ? 'none' : 'flex';
    if (chatOpen) updateContextBar();
}

function updateContextBar() {
    const bar = document.getElementById('contextBar');
    // 將「手動選擇」與「後端回傳」的型號聯集
    const combinedModels = Array.from(new Set([...selectedItems, ...acquiredModels]));

    if (combinedModels.length === 0) {
        bar.textContent = '尚未鎖定任何型號（將進行全庫搜尋）';
    } else {
        bar.textContent = `AI 已鎖定分析：${combinedModels.join('、')}`;
    }
}

function sendQuick(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    input.value = "";
    input.style.height = "auto";

    appendMessage("user", message);
    chatHistory.push({ role: "user", content: message });

    const loadingEl = appendMessage("assistant", "思考中…", true);
    document.getElementById('chatSendBtn').disabled = true;

    try {
        const payload = {
            message: message,
            context: {
                // 將使用者手動選的 + 後端篩選出來的聯集
                selected_models: Array.from(new Set([...selectedItems, ...acquiredModels])), 
                filters: {
                    type: document.getElementById('mgmtType') ? document.getElementById('mgmtType').value : "",
                    port: document.getElementById('numInput') ? document.getElementById('numInput').value : "",
                }
            },
            history: chatHistory.slice(-12).slice(0, -1), // 留最近 6 輪對話
        };

        // 呼叫 AI 團隊的 RAG API Endpoint
        const resp = await fetch(`${RAG_API}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        loadingEl.remove();
        appendMessage("assistant", data.answer, false, data);
        chatHistory.push({ role: "assistant", content: data.answer });

    } catch (err) {
        loadingEl.remove();
        appendMessage("assistant", `⚠️ 發生錯誤：${err.message}`);
    } finally {
        document.getElementById('chatSendBtn').disabled = false;
    }
}

function appendMessage(role, text, isLoading = false, responseData = null) {
    const msgs = document.getElementById('chatMessages');
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role}${isLoading ? ' loading' : ''}`;
    
    // 如果是 HTML 內容（例如 Markdown 解析後的結果）就直接塞，否則純文字換行
    if (typeof marked !== 'undefined') {
        bubble.innerHTML = marked.parse(text);
    } else {
        bubble.innerHTML = text.replace(/\n/g, '<br>');
    }
    
    wrapper.appendChild(bubble);

    if (responseData && responseData.referenced_models && responseData.referenced_models.length > 0) {
        const refEl = document.createElement('div');
        refEl.className = 'msg-refs';
        refEl.textContent = `📄 參考型號：${responseData.referenced_models.join('、')}`;
        wrapper.appendChild(refEl);
    }

    if (responseData && responseData.sources && responseData.sources.length > 0) {
        const detailsEl = document.createElement('details');
        detailsEl.style.cssText = 'font-size: 0.75rem; color: #777; margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 4px;';
        
        const summaryEl = document.createElement('summary');
        summaryEl.style.cursor = 'pointer';
        summaryEl.textContent = '🔍 查看 AI 參考的原廠規格片段';
        detailsEl.appendChild(summaryEl);
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.04); border-radius: 4px; max-height: 150px; overflow-y: auto;';
        
        responseData.sources.forEach((src, idx) => {
            const p = document.createElement('div');
            p.style.marginBottom = '6px';
            const similarity = (1 - src.distance).toFixed(2);
            p.innerHTML = `<strong>[${idx+1}] ${src.model}</strong> (相似度: ${similarity})<br>${src.content.replace(/\\n/g, ' ')}`;
            contentDiv.appendChild(p);
        });
        
        detailsEl.appendChild(contentDiv);
        wrapper.appendChild(detailsEl);
    }

    msgs.appendChild(wrapper);
    msgs.scrollTop = msgs.scrollHeight;
    return wrapper;
}

// 監聽 Enter 送出（Shift+Enter 換行）
document.getElementById('chatInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});
```

恭喜！整合完成，可以直接呼叫 RAG 後台的 API 提供 AI 選型服務了！
