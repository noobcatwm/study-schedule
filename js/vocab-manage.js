// ==========================================
// vocab-manage.js：單字輸入、刷單字、單字庫管理
// 資料來源一律是全域 vocabBanks（config-state.js），
// 修改後呼叫 saveVocabBanks() 寫回 localStorage。
// ==========================================

let currentSelectedGroupId = null; // 單字庫管理：目前選中的主題 groupId

// ------------------------------------------
// 取得任務對應的單字
// ------------------------------------------
function getWordsForTask(task) {
    // 待複習單字任務：直接使用自己的 unlearnedWords
    if (task.type === 'vocab_review') {
        return task.unlearnedWords || [];
    }
    // 一般任務：透過 vocabBankId 找單字庫
    if (task.vocabBankId) {
        const bank = doubleFind(task.vocabBankId);
        return bank ? (bank.words || []) : [];
    }
    return [];
}

function getVocabWordbankForTask(task) {
    if (task.vocabBankId) return doubleFind(task.vocabBankId);
    return null;
}

// ------------------------------------------
// 學習模式（每個單字庫 / 主題一種）：flashcard 單字卡 | choice 選擇題
// 設定存在主題（group）物件的 studyMode 欄位，沒設定視為單字卡
// ------------------------------------------
function findGroupByUnitId(unitId) {
    if (!unitId) return null;
    return vocabBanks.find(g => (g.units || []).some(u => u.id === unitId)) || null;
}

function getVocabModeForTask(task) {
    const group = findGroupByUnitId(task.vocabBankId);
    return (group && group.studyMode === 'choice') ? 'choice' : 'flashcard';
}

function vocabModeLabel(mode) {
    return mode === 'choice' ? '選擇題' : '單字卡';
}

// 進階工具 > 單字庫 > 單元列表上方的下拉選單
function changeVocabGroupMode() {
    const group = vocabBanks.find(g => g.groupId === currentSelectedGroupId);
    if (!group) return;
    const mode = document.getElementById('vocab-mode-select').value;
    group.studyMode = (mode === 'choice') ? 'choice' : 'flashcard';
    saveVocabBanks();
}

// ------------------------------------------
// 單字列版面：直排檢視(row) / 橫排檢視(stack)
//   直排：一個單字一行，單字 | 意思 | 讀音 並排
//   橫排：一個單字三橫行，單字 / 意思 / 讀音(可換行) 上下排列
// 版面只靠容器的 layout-stack class 切換，不重建資料列，所以切換不會遺失已輸入內容。
// 偏好存在 localStorage，輸入視窗與編輯視窗共用。
// ------------------------------------------
const VOCAB_ROW_CONTAINERS = ['vocab-input-rows-container', 'vocab-rows-container'];

// 直排欄位較窄，提示文字用短版，避免折成兩行把空白列撐高
function readingPlaceholder() {
    return getVocabLayout() === 'stack' ? '讀音/補充（可直接換行）' : '讀音/補充';
}

function getVocabLayout() {
    return localStorage.getItem(DB_VOCAB_LAYOUT) === 'stack' ? 'stack' : 'row';
}

function applyVocabLayout() {
    const isStack = getVocabLayout() === 'stack';

    VOCAB_ROW_CONTAINERS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('layout-stack', isStack);
    });

    // 欄位標題行只在直排檢視需要（橫排時每個欄位有自己的 placeholder）
    ['vocab-input-header', 'vocab-detail-header'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', isStack);
    });

    // 按鈕文字顯示「按下後會切換成什麼」
    ['vocab-input-layout-btn', 'vocab-detail-layout-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = isStack ? '切換為直排檢視' : '切換為橫排檢視';
    });

    document.querySelectorAll('.vocab-row .input-reading').forEach(ta => { ta.placeholder = readingPlaceholder(); });
    refreshVocabTextareas(); // 版面改變後欄寬不同，重算讀音欄高度
}

function toggleVocabLayout() {
    localStorage.setItem(DB_VOCAB_LAYOUT, getVocabLayout() === 'stack' ? 'row' : 'stack');
    applyVocabLayout();
}

// ------------------------------------------
// 讀音/補充：換行處理
// ------------------------------------------
function normalizeReadingText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\\n/g, '\n'); // 舊資料若手打了字面上的 \n，一律視為換行
}

// 讀音欄是 textarea，依內容自動增高（最高 160px，超過改為捲動）
function autoGrowTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    const h = ta.scrollHeight;
    if (!h) return; // 所在視窗目前是隱藏的，之後開啟時會再重算
    const MAX = 160;
    ta.style.height = Math.min(h + 2, MAX) + 'px'; // +2 = 上下邊框
    ta.style.overflowY = (h + 2 > MAX) ? 'auto' : 'hidden';
}

function refreshVocabTextareas() {
    document.querySelectorAll('.vocab-row .input-reading').forEach(autoGrowTextarea);
}

// ------------------------------------------
// 動態單字列（輸入視窗與編輯視窗共用）
// containerId 明確指定要放進哪個容器
// ------------------------------------------
// 意思欄：每個單字可有多個意思（一字多義）
function refreshMeaningUI(meaningsEl) {
    const items = meaningsEl.querySelectorAll('.vocab-meaning-item');
    meaningsEl.classList.toggle('single', items.length <= 1); // 只剩一個時隱藏刪除鈕
    items.forEach((item, i) => {
        const input = item.querySelector('.input-meaning');
        if (input) input.placeholder = items.length > 1 ? `意思 ${i + 1}` : '意思';
    });
}

function addMeaningField(meaningsEl, value = '') {
    const item = document.createElement('div');
    item.className = 'vocab-meaning-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vocab-field input-meaning';
    input.value = value || '';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'vocab-meaning-del';
    del.textContent = '✕';
    del.title = '刪除這個意思';
    del.onclick = () => {
        if (meaningsEl.querySelectorAll('.vocab-meaning-item').length <= 1) return; // 至少保留一欄
        item.remove();
        refreshMeaningUI(meaningsEl);
    };

    item.appendChild(input);
    item.appendChild(del);

    const addBtn = meaningsEl.querySelector('.vocab-meaning-add');
    if (addBtn) meaningsEl.insertBefore(item, addBtn);
    else meaningsEl.appendChild(item);

    refreshMeaningUI(meaningsEl);
    return input;
}

// meaning 可傳字串（單一意思）或陣列（多個意思）
function addVocabRow(word = '', meaning = '', reading = '', containerId = 'vocab-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('找不到單字列容器：', containerId);
        return null;
    }

    const row = document.createElement('div');
    row.className = 'vocab-row';

    // 用 DOM 屬性設定 value，單字含引號或 < > 時也不會破壞 HTML
    const wordInput = document.createElement('input');
    wordInput.type = 'text';
    wordInput.className = 'vocab-field input-word';
    wordInput.placeholder = '單字';
    wordInput.value = word || '';

    // 意思區：至少一欄，可用「＋ 意思」新增
    const meaningsEl = document.createElement('div');
    meaningsEl.className = 'vocab-meanings';

    const addMeaningBtn = document.createElement('button');
    addMeaningBtn.type = 'button';
    addMeaningBtn.className = 'vocab-meaning-add';
    addMeaningBtn.textContent = '＋ 意思';
    addMeaningBtn.onclick = () => addMeaningField(meaningsEl, '').focus();
    meaningsEl.appendChild(addMeaningBtn);

    let meaningList = (Array.isArray(meaning) ? meaning : [meaning])
        .map(m => String(m ?? '')).filter(m => m.trim() !== '');
    if (meaningList.length === 0) meaningList = [''];
    meaningList.forEach(m => addMeaningField(meaningsEl, m));

    // 讀音/補充用 textarea：可直接按 Enter 換行，刷卡時會照樣換行
    const readingInput = document.createElement('textarea');
    readingInput.className = 'vocab-field input-reading';
    readingInput.rows = 1;
    readingInput.placeholder = readingPlaceholder();
    readingInput.value = normalizeReadingText(reading);
    readingInput.addEventListener('input', () => autoGrowTextarea(readingInput));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'vocab-del-btn';
    delBtn.textContent = '✕';
    delBtn.onclick = () => row.remove();

    row.appendChild(wordInput);
    row.appendChild(meaningsEl);
    row.appendChild(readingInput);
    row.appendChild(delBtn);
    container.appendChild(row);

    autoGrowTextarea(readingInput);
    return row;
}

// 「＋ 新增一行單字」按鈕：新增空白列、捲到可見處並聚焦單字欄
function appendBlankVocabRow(containerId) {
    const row = addVocabRow('', '', '', containerId);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const first = row.querySelector('.input-word');
    if (first) first.focus();
}

// 讀取容器內所有列 → [{word, meanings, reading}]（全空的列略過；空白的意思欄忽略）
function collectVocabRows(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const result = [];
    container.querySelectorAll('.vocab-row').forEach(row => {
        const word = row.querySelector('.input-word')?.value.trim() || '';
        const meanings = Array.from(row.querySelectorAll('.input-meaning'))
            .map(input => input.value.trim())
            .filter(m => m !== '');
        const reading = normalizeReadingText(row.querySelector('.input-reading')?.value || '')
            .replace(/[ \t]+\n/g, '\n') // 每行行尾空白去掉
            .trim();                    // 頭尾空行去掉，中間換行保留
        if (word || meanings.length > 0 || reading) result.push({ word, meanings, reading });
    });
    return result;
}

// 把單字陣列填進容器（沒有單字時給一行空白）
function fillVocabRows(containerId, words) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const list = ensureUpgradedWords(words || []);
    if (list.length === 0) {
        addVocabRow('', '', '', containerId);
        return;
    }
    list.forEach(w => addVocabRow(w.word, w.meanings, w.reading, containerId));
}

// ------------------------------------------
// 任務 → 輸入單字
// ------------------------------------------
function openVocabInput(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    currentWorkingTask = task;

    const titleEl = document.getElementById('vocab-input-title');
    if (titleEl) titleEl.textContent = `輸入單字：${task.title}`;

    fillVocabRows('vocab-input-rows-container', getWordsForTask(task));
    openModal('vocab-input-modal');
    applyVocabLayout();
}

function saveVocabInput() {
    const newWords = collectVocabRows('vocab-input-rows-container');

    if (currentWorkingTask) {
        const bankId = currentWorkingTask.vocabBankId;
        const bank = bankId ? doubleFind(bankId) : null;

        if (!bank) {
            alert('找不到對應的單字庫，無法儲存。');
            return;
        }

        bank.words = newWords;
        saveVocabBanks();

        // 同一單元的第一階段任務：有單字才算「可開始」
        tasks.forEach(t => {
            if (t.vocabBankId === bankId && t.stage === 1 && t.type !== 'vocab_review') {
                t.vocabState = newWords.length > 0 ? 'ready' : 'need_input';
            }
        });

        saveAndRefresh();
    }

    closeModal('vocab-input-modal');
}

// ------------------------------------------
// 刷單字（熟 / 不熟）
// ------------------------------------------
function startVocabSession(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const wordsList = getWordsForTask(task);
    if (wordsList.length === 0) {
        alert('這個單元還沒有單字喔！請先輸入單字。');
        return;
    }

    // 選擇題模式：交給 vocab-quiz.js
    if (getVocabModeForTask(task) === 'choice') {
        startQuizSession(task);
        return;
    }

    const bank = getVocabWordbankForTask(task);

    activeVocabSession = {
        taskId: task.id,
        unlearnedWords: ensureUpgradedWords(wordsList),
        unlearnedNext: [],
        currentIndex: 0,
        vocabFont: (bank && bank.vocabFont) || 'default'
    };

    openModal('vocab-flashcard-modal');
    showNextWord();
}

function getCustomFontClass(vocabFont) {
    return vocabFont === 'jp' ? 'font-jp' : 'font-default';
}

// 切到下一張：瞬間翻回正面（不播放動畫），之後點擊仍有 3D 翻面
function showNextWord() {
    const session = activeVocabSession;
    if (!session) return;

    if (session.currentIndex >= session.unlearnedWords.length) {
        finishVocabSession();
        return;
    }

    const card = document.getElementById('main-flashcard');
    if (card) {
        card.style.transition = 'none';
        card.classList.remove('is-flipped');
        void card.offsetWidth; // 強制 reflow，讓關閉動畫立即生效
        card.style.transition = '';
    }

    updateCardDOMContent();

    const progressEl = document.getElementById('vocab-progress');
    if (progressEl) {
        progressEl.innerText = `${session.currentIndex + 1} / ${session.unlearnedWords.length}`;
    }
}

// 一般單字卡各元素的 id；選擇題答題後出現的卡片使用另一組 id
const FLASHCARD_IDS = {
    word: 'card-word-text',
    meaning: 'card-meaning-text',
    reading: 'card-reading-text',
    card: 'main-flashcard'
};

// 把一個單字填進單字卡（正面單字、背面意思與讀音）
function renderFlashcardContent(entry, vocabFont, ids = FLASHCARD_IDS) {
    const item = normalizeWordEntry(entry);
    const readingText = normalizeReadingText(item.reading || '');

    const wordEl = document.getElementById(ids.word);
    const meaningEl = document.getElementById(ids.meaning);
    const readingEl = document.getElementById(ids.reading);

    if (wordEl) {
        wordEl.innerText = item.word || '';
        wordEl.className = `flashcard-word ${getCustomFontClass(vocabFont)}`;
    }
    if (meaningEl) {
        meaningEl.innerHTML = renderMeaningsHtml(item.meanings, vocabFont);
        meaningEl.style.fontSize = item.meanings.length > 1 ? '1.25rem' : '1.5rem';
    }
    if (readingEl) readingEl.innerHTML = parseMixedFontText(readingText, vocabFont);

    const card = document.getElementById(ids.card);
    if (card) card.classList.toggle('font-jp', vocabFont === 'jp');
}

function updateCardDOMContent() {
    const session = activeVocabSession;
    if (!session || session.currentIndex >= session.unlearnedWords.length) return;
    renderFlashcardContent(session.unlearnedWords[session.currentIndex], session.vocabFont || 'default');
}

// 意思的顯示：沒有 → 提示文字；一個 → 直接顯示；多個 → 分行並加編號
function renderMeaningsHtml(meanings, vocabFont) {
    if (!meanings || meanings.length === 0) {
        return escapeHtml('（無填寫意思）');
    }
    if (meanings.length === 1) {
        return parseMixedFontText(meanings[0], vocabFont);
    }
    return meanings.map((m, i) =>
        `<div class="meaning-line"><span class="meaning-index">${i + 1}.</span> ${parseMixedFontText(m, vocabFont)}</div>`
    ).join('');
}

function answerVocab(isKnown) {
    const session = activeVocabSession;
    if (!session || session.currentIndex >= session.unlearnedWords.length) return;

    if (!isKnown) {
        session.unlearnedNext.push(session.unlearnedWords[session.currentIndex]);
    }
    session.currentIndex++;
    showNextWord();
}

// 單字卡模式刷完：把「不熟」的單字交給共用結算
function finishVocabSession() {
    closeModal('vocab-flashcard-modal');

    if (!activeVocabSession || !activeVocabSession.taskId) return;

    const unlearnedCount = activeVocabSession.unlearnedNext.length;
    completeVocabTask(activeVocabSession.taskId, activeVocabSession.unlearnedNext, {
        withMiss: `測驗完成！已自動為 ${unlearnedCount} 個不熟單字新增「待複習單字」任務。`,
        allGood: '太棒了！所有單字皆已掌握，無須新增待複習卡片！'
    });
}

// 共用結算（單字卡 / 選擇題）：原任務標為完成；有沒學會的單字就在當天新增「待複習單字」任務
// unlearnedWords 為單字物件陣列；messages.withMiss / messages.allGood 為完成時的提示文字
function completeVocabTask(taskId, unlearnedWords, messages) {
    const currentTask = tasks.find(t => t.id === taskId);
    const unlearnedCount = unlearnedWords.length;

    if (currentTask) {
        currentTask.isCompleted = true;

        // 待複習任務做完就結束，不再衍生新任務
        if (currentTask.type === 'vocab_review') {
            saveAndRefresh();
            if (selectedDateStr) openDayModal(selectedDateStr);
            return;
        }

        if (unlearnedCount > 0) {
            const baseTitle = currentTask.groupName || currentTask.title.replace(/^待複習單字\s*\((.*)\)$/, '$1');

            tasks.push({
                id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString()),
                groupId: currentTask.groupId,
                groupName: baseTitle,
                type: 'vocab_review',
                title: `待複習單字 (${currentTask.title})`, // 帶有原單元名稱
                dueDate: selectedDateStr,
                stage: 1,
                vocabBankId: currentTask.vocabBankId,
                isVocab: true,
                unlearnedWords: unlearnedWords.map(w => normalizeWordEntry(w)), // 只有沒學會的單字
                vocabFont: currentTask.vocabFont,
                vocabState: 'ready',
                weight: 0,
                color: currentTask.color || '#4a90e2',
                isCompleted: false
            });
        }

        saveAndRefresh();
    }

    if (selectedDateStr) openDayModal(selectedDateStr);

    alert(unlearnedCount > 0 ? messages.withMiss : messages.allGood);
}

function toggleCardFlip(containerElement) {
    const card = containerElement.querySelector('.flashcard');
    if (card) card.classList.toggle('is-flipped');
}

// 先轉義，再把 *文字* 套上日文字體
function parseMixedFontText(rawText, vocabFont) {
    if (!rawText) return '';
    const escaped = escapeHtml(rawText);
    const fontClassName = getCustomFontClass(vocabFont);
    return escaped.replace(/\*([^*]+)\*/g, `<span class="${fontClassName}">$1</span>`);
}

// ------------------------------------------
// 任務 → 檢視 / 編輯該任務的單字
// ------------------------------------------
function viewVocabWords(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    reviewTask = (task.type === 'vocab_review') ? task : null;
    openVocabGroupDetail(taskId);
}

function openVocabGroupDetail(taskId) {
    closeModal('vocab-units-modal');

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('找不到對應的任務 ID:', taskId);
        return;
    }

    const bank = task.vocabBankId ? doubleFind(task.vocabBankId) : null;
    if (!bank) {
        alert('這個任務尚未綁定任何單字庫，或單字庫已被移除！');
        return;
    }

    currentWorkingBankId = bank.id;

    const titleEl = document.getElementById('vocab-detail-title');
    if (titleEl) {
        titleEl.innerText = (task.type === 'vocab_review')
            ? `編輯單字庫：待複習單字 (${bank.name})`
            : `編輯單字庫：${bank.name}`;
    }

    const fontSelect = document.getElementById('vocab-font-select');
    if (fontSelect) fontSelect.value = bank.vocabFont || 'default';

    fillVocabRows('vocab-rows-container', getWordsForTask(task));
    openModal('vocab-detail-modal');
    applyVocabLayout();
}

// ------------------------------------------
// 進階工具 → 單字庫管理（三層：主題 → 單元 → 單字）
// ------------------------------------------

// 第一層：主題列表
function openVocabManagerFromTools() {
    closeModal('tools-modal');
    openVocabManager();
}

function openVocabManager() {
    const listContainer = document.getElementById('vocab-group-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (vocabBanks.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">目前沒有任何單字庫</p>';
    }

    vocabBanks.forEach(group => {
        const unitCount = (group.units || []).length;

        const row = document.createElement('div');
        row.className = 'vocab-item-row';
        row.innerHTML = `
            <div style="flex: 1; min-width: 0; margin-right: 10px; word-break: break-all;">
                <strong>${escapeHtml(group.groupName || '未命名群組')}</strong>
                <span style="display: block; font-size: 0.85rem; opacity: 0.7;">${unitCount} 個單元，${vocabModeLabel(group.studyMode)}</span>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                <button class="action-btn" onclick="openVocabUnitsModal('${group.groupId}')">檢視單元</button>
                <button class="action-btn delete-btn" onclick="deleteVocabGroup('${group.groupId}')">刪除</button>
            </div>
        `;
        listContainer.appendChild(row);
    });

    openModal('vocab-manager-modal');
}

// 第二層：某主題底下的單元列表
function openVocabUnitsModal(groupId) {
    currentSelectedGroupId = groupId;
    closeModal('vocab-manager-modal');

    const group = vocabBanks.find(g => g.groupId === groupId);

    const titleEl = document.getElementById('vocab-units-title');
    if (titleEl) titleEl.innerText = group ? group.groupName : '單元列表';

    const modeSelect = document.getElementById('vocab-mode-select');
    if (modeSelect) modeSelect.value = (group && group.studyMode === 'choice') ? 'choice' : 'flashcard';

    const listContainer = document.getElementById('vocab-unit-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const units = group ? (group.units || []) : [];

    if (units.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">此主題下無單元</p>';
    } else {
        units.forEach(unit => {
            const wordCount = (unit.words || []).length;
            const displayName = unit.name || unit.title || '未命名單元';

            const row = document.createElement('div');
            row.className = 'vocab-item-row';
            row.innerHTML = `
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
                    <strong>${escapeHtml(displayName)}</strong>
                    <span style="font-size: 0.85rem; opacity: 0.7; margin-left: 6px;">(${wordCount} 個單字)</span>
                </div>
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button class="action-btn" onclick="openVocabBankDetail('${unit.id}')">檢視/編輯</button>
                    <button class="action-btn delete-btn" onclick="deleteVocabUnit('${unit.id}')">刪除</button>
                </div>
            `;
            listContainer.appendChild(row);
        });
    }

    openModal('vocab-units-modal');
}

// 解除任務與單元的綁定：該單元的「待複習單字」任務移除，其餘任務變回一般任務
function detachTasksFromUnits(unitIds) {
    const ids = new Set(unitIds);
    tasks = tasks.filter(t => !(ids.has(t.vocabBankId) && t.type === 'vocab_review'));
    tasks.forEach(t => {
        if (ids.has(t.vocabBankId)) {
            t.vocabBankId = null;
            t.enableVocab = false;
            t.isVocab = false;
            delete t.vocabState;
        }
    });
}

function countTasksBoundToUnits(unitIds) {
    const ids = new Set(unitIds);
    return tasks.filter(t => t.vocabBankId && ids.has(t.vocabBankId)).length;
}

function boundTasksNote(count) {
    if (count <= 0) return '';
    return `\n\n行事曆中有 ${count} 個任務綁定了這些單字：「待複習單字」任務會一併移除，其餘任務會變成一般任務。`;
}

// 刪除單一單元
function deleteVocabUnit(unitId) {
    const unit = doubleFind(unitId);
    if (!unit) return;

    const msg = `確定要刪除單元「${unit.name}」嗎？\n共 ${(unit.words || []).length} 個單字，刪除後無法復原。`
        + boundTasksNote(countTasksBoundToUnits([unitId]));
    if (!confirm(msg)) return;

    // 從所屬群組移除；群組空了就整組移除
    vocabBanks.forEach(g => { g.units = (g.units || []).filter(u => u.id !== unitId); });
    vocabBanks = vocabBanks.filter(g => (g.units || []).length > 0);
    saveVocabBanks();

    detachTasksFromUnits([unitId]);
    saveAndRefresh();

    // 重新整理畫面
    if (vocabBanks.some(g => g.groupId === currentSelectedGroupId)) {
        openVocabUnitsModal(currentSelectedGroupId);
    } else {
        closeModal('vocab-units-modal');
        openVocabManager();
    }
}

// 刪除整個單字庫（主題，連同底下所有單元）
function deleteVocabGroup(groupId) {
    const group = vocabBanks.find(g => g.groupId === groupId);
    if (!group) return;

    const units = group.units || [];
    const unitIds = units.map(u => u.id);
    const wordCount = units.reduce((sum, u) => sum + (u.words || []).length, 0);

    const msg = `確定要刪除整個單字庫「${group.groupName || '未命名群組'}」嗎？\n包含 ${units.length} 個單元、共 ${wordCount} 個單字，刪除後無法復原。`
        + boundTasksNote(countTasksBoundToUnits(unitIds));
    if (!confirm(msg)) return;

    vocabBanks = vocabBanks.filter(g => g.groupId !== groupId);
    saveVocabBanks();

    detachTasksFromUnits(unitIds);
    saveAndRefresh();

    if (currentSelectedGroupId === groupId) currentSelectedGroupId = null;
    openVocabManager(); // 重新整理主題列表
}

// 第三層：從單元列表進入，檢視 / 編輯單字
function openVocabBankDetail(unitId) {
    reviewTask = null;

    const bank = doubleFind(unitId);
    if (!bank) {
        alert('找不到該單字庫！');
        return;
    }

    currentWorkingBankId = bank.id;

    const titleEl = document.getElementById('vocab-detail-title');
    if (titleEl) titleEl.innerText = `編輯單字庫：${bank.name}`;

    const fontSelect = document.getElementById('vocab-font-select');
    if (fontSelect) fontSelect.value = bank.vocabFont || 'default';

    fillVocabRows('vocab-rows-container', bank.words);
    openModal('vocab-detail-modal');
    applyVocabLayout();
}

function saveVocabDetailModal() {
    if (!currentWorkingBankId) {
        alert('找不到當前編輯的單字庫，請重新點擊編輯。');
        return;
    }

    const newWords = collectVocabRows('vocab-rows-container');

    if (reviewTask) {
        // 待複習任務：只改該任務自己的 unlearnedWords，不動單字庫母體
        reviewTask.unlearnedWords = newWords;
    } else {
        const bank = doubleFind(currentWorkingBankId);
        if (!bank) {
            alert('找不到單字庫，無法儲存。');
            return;
        }
        bank.words = newWords;
        saveVocabBanks();
    }

    saveAndRefresh();
    closeModal('vocab-detail-modal');

    // 若底下的單元列表還開著，刷新單字數量
    const unitsModal = document.getElementById('vocab-units-modal');
    if (unitsModal && unitsModal.classList.contains('active') && currentSelectedGroupId) {
        openVocabUnitsModal(currentSelectedGroupId);
    }
}

// 單字詳細視窗右上角：切換該單字庫的字體
function changeVocabGroupFont() {
    const font = document.getElementById('vocab-font-select').value;
    const bank = currentWorkingBankId ? doubleFind(currentWorkingBankId) : null;
    if (!bank) return;

    bank.vocabFont = font;
    saveVocabBanks();
}

// 載入時套用上次選擇的版面
applyVocabLayout();
