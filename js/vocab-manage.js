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
// 動態單字列（輸入視窗與編輯視窗共用）
// containerId 明確指定要放進哪個容器
// ------------------------------------------
function addVocabRow(word = '', meaning = '', reading = '', containerId = 'vocab-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('找不到單字列容器：', containerId);
        return;
    }

    const row = document.createElement('div');
    row.className = 'vocab-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    // 用 DOM 屬性設定 value，單字含引號或 < > 時也不會破壞 HTML
    [
        ['input-word', '單字', word],
        ['input-meaning', '意思', meaning],
        ['input-reading', '讀音/補充', reading]
    ].forEach(([cls, placeholder, value]) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = cls;
        input.placeholder = placeholder;
        input.value = value || '';
        input.style.cssText = 'flex: 1; min-width: 0; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);';
        row.appendChild(input);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'width: 34px; height: 32px; background: #ff4d4f; color: white; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0;';
    delBtn.onclick = () => row.remove();
    row.appendChild(delBtn);

    container.appendChild(row);
}

// 讀取容器內所有列 → [{word, meaning, reading}]（全空的列略過）
function collectVocabRows(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const result = [];
    container.querySelectorAll('.vocab-row').forEach(row => {
        const word = row.querySelector('.input-word')?.value.trim() || '';
        const meaning = row.querySelector('.input-meaning')?.value.trim() || '';
        const reading = row.querySelector('.input-reading')?.value.trim() || '';
        if (word || meaning || reading) result.push({ word, meaning, reading });
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
    list.forEach(w => addVocabRow(w.word, w.meaning, w.reading, containerId));
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

function updateCardDOMContent() {
    const session = activeVocabSession;
    if (!session || session.currentIndex >= session.unlearnedWords.length) return;

    const item = session.unlearnedWords[session.currentIndex];
    const wordText = item.word || '';
    const meaningText = item.meaning || '（無填寫意思）';
    const readingText = item.reading || '';

    const vocabFont = session.vocabFont || 'default';

    const wordEl = document.getElementById('card-word-text');
    const meaningEl = document.getElementById('card-meaning-text');
    const readingEl = document.getElementById('card-reading-text');

    if (wordEl) {
        wordEl.innerText = wordText;
        wordEl.className = `flashcard-word ${getCustomFontClass(vocabFont)}`;
    }
    if (meaningEl) meaningEl.innerHTML = parseMixedFontText(meaningText, vocabFont);
    if (readingEl) readingEl.innerHTML = parseMixedFontText(readingText, vocabFont);

    const card = document.getElementById('main-flashcard');
    if (card) card.classList.toggle('font-jp', vocabFont === 'jp');
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

// 刷完結算：原任務標為完成；有不熟的單字就在當天新增「待複習單字」任務
function finishVocabSession() {
    closeModal('vocab-flashcard-modal');

    if (!activeVocabSession || !activeVocabSession.taskId) return;

    const currentTask = tasks.find(t => t.id === activeVocabSession.taskId);
    const unlearnedCount = activeVocabSession.unlearnedNext.length;

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
                unlearnedWords: [...activeVocabSession.unlearnedNext], // 只有不熟的單字
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

    if (unlearnedCount > 0) {
        alert(`🎉 測驗完成！已自動為 ${unlearnedCount} 個不熟單字新增「待複習單字」任務。`);
    } else {
        alert('🎉 太棒了！所有單字皆已掌握，無須新增待複習卡片！');
    }
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
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
                <strong>📁 ${escapeHtml(group.groupName || '未命名群組')}</strong>
                <span style="font-size: 0.85rem; opacity: 0.7; margin-left: 6px;">(${unitCount} 個單元)</span>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                <button class="action-btn" onclick="openVocabUnitsModal('${group.groupId}')">檢視單元</button>
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
                    <button class="action-btn" onclick="deleteVocabUnit('${unit.id}')" style="color: #ff3b30; border-color: rgba(255, 59, 48, 0.3);">刪除</button>
                </div>
            `;
            listContainer.appendChild(row);
        });
    }

    openModal('vocab-units-modal');
}

// 刪除單元：移除單字庫，並處理引用它的任務
function deleteVocabUnit(unitId) {
    const unit = doubleFind(unitId);
    if (!unit) return;

    if (!confirm(`確定要刪除「${unit.name}」這個單字庫嗎？\n（該單元的「待複習單字」任務也會一併移除，其餘任務會變成一般任務）`)) return;

    // 1. 從所屬群組移除；群組空了就整組移除
    vocabBanks.forEach(g => { g.units = (g.units || []).filter(u => u.id !== unitId); });
    vocabBanks = vocabBanks.filter(g => (g.units || []).length > 0);
    saveVocabBanks();

    // 2. 處理任務
    tasks = tasks.filter(t => !(t.vocabBankId === unitId && t.type === 'vocab_review'));
    tasks.forEach(t => {
        if (t.vocabBankId === unitId) {
            t.vocabBankId = null;
            t.enableVocab = false;
            t.isVocab = false;
            delete t.vocabState;
        }
    });
    saveAndRefresh();

    // 3. 重新整理畫面
    if (vocabBanks.some(g => g.groupId === currentSelectedGroupId)) {
        openVocabUnitsModal(currentSelectedGroupId);
    } else {
        closeModal('vocab-units-modal');
        openVocabManager();
    }
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
