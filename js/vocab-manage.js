// 根據當前任務，取得對應的單字列表
function getWordsForTask(task) {
  // 1. 如果是「待複習單字」任務（vocab_review），它直接吃自己的 unlearnedWords
  if (task.type == 'vocab_review') {
    console.log(task.unlearnedWords);
    return task.unlearnedWords || [];
  }

  // 2. 如果是一般學習任務，透過 vocabBankId 去 vocabBanks_V5 撈出對應的單字母體
  if (task.vocabBankId) {
    const vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
    const targetBank = doubleFind(task.vocabBankId);
    
    // 回傳該單字庫的 words，找不到就回傳空陣列
    return targetBank ? targetBank.words : [];
  }

  // 3. 萬一都沒有，回傳空陣列
  return [];
}

function getVocabWordbankForTask(task) {
  if (task.vocabBankId) {
    const vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
    const targetBank = doubleFind(task.vocabBankId);
    
    // 回傳該單字庫的 words，找不到就回傳空陣列
    return targetBank;
  }

  // 3. 萬一都沒有，回傳空陣列
  return [];
}

function addVocabRow(word = '', meaning = '', reading = '', extra = '') {
    const container = document.getElementById('vocab-rows-container') || document.getElementById('vocab-words-list');
    if (!container) {
        console.error("❌ 找不到單字列表容器！");
        return;
    }

    const row = document.createElement('div');
    row.className = 'vocab-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px; width: 100%;';

    // 1. 建立外觀結構（不帶硬性 value 字串，避免屬性同步問題）
    row.innerHTML = `
        <input type="text" class="input-word" placeholder="單字" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #666; background: #2a2a2a; color: #ffffff; font-size: 14px;">
        <input type="text" class="input-meaning" placeholder="意思" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #666; background: #2a2a2a; color: #ffffff; font-size: 14px;">
        <input type="text" class="input-reading" placeholder="讀音/補充" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #666; background: #2a2a2a; color: #ffffff; font-size: 14px;">
        <button type="button" onclick="this.parentElement.remove()" style="width: 36px; height: 36px; background: #ff4d4f; color: white; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0; font-weight: bold;">✕</button>
    `;

    // 2. 直接透過 JS 指定 DOM 數值（雙保險，絕對寫入）
    const inputWord = row.querySelector('.input-word');
    const inputMeaning = row.querySelector('.input-meaning');
    const inputReading = row.querySelector('.input-reading');

    if (inputWord) inputWord.value = word || '';
    if (inputMeaning) inputMeaning.value = meaning || '';
    if (inputReading) inputReading.value = reading || '';

    container.appendChild(row);
}

// 點擊 [檢視] 按鈕時呼叫
function viewVocabWords(taskId) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return;

    if (task.type == "vocab_review") reviewTask = task;
    else reviewTask = null;
    openVocabGroupDetail(taskId);
}

// 3. 打開「輸入單字」視窗
function openVocabInput(taskId) {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    const targetTask = currentTask; // 如果找不到 stage 1 就退回用自己

    // 記錄目前正在編輯的任務 ID（或是記錄 targetTask 的 ID，看你後續儲存怎麼寫）
    currentWorkingTask = targetTask; 

    // 2. 處理字體選單與樣式（保留你原本的邏輯）
    const fontSelect = document.getElementById('vocab-font-type');
    if (fontSelect) {
        fontSelect.value = targetTask.vocabFont || 'default';
    }

    // 3. 清空並渲染動態清單表格
    const container = document.getElementById('vocab-rows-container');
    if (container) {
        container.innerHTML = ''; // 清空舊的行

        const wordsData = getWordsForTask(targetTask) || [];

        if (wordsData.length > 0) {
        wordsData.forEach(item => {
            // 相容舊資料：如果原本是純字串，就把它填進第一欄（單字）
            if (typeof item === 'string') {
            addVocabRow(item, '', '', '');
            } else {
            // 如果已經是物件格式，把各欄位填進去
            addVocabRow(
                item.word || '', 
                item.meaning || '', 
                item.reading || '', 
                item.extra || ''
            );
            }
        });
        } else {
        // 如果完全沒有單字，預設先給一行空白的讓使用者輸入
        addVocabRow();
        }
    }

    // 4. 開啟 Modal
    openModal('vocab-input-modal');
}

// 4. 儲存輸入的單字
function saveVocabInput() {
    // 1. 收集動態表格內所有行的資料
    const rows = document.querySelectorAll('#vocab-input-rows-container .vocab-row');
    const newWords = [];
    rows.forEach(row => {
        const word = row.querySelector('.input-word')?.value.trim() || '';
        const meaning = row.querySelector('.input-meaning')?.value.trim() || '';
        const reading = row.querySelector('.input-reading')?.value.trim() || '';
        const extra = row.querySelector('.input-extra')?.value.trim() || '';
        
        // 只要任一欄位有填寫，就保留這筆單字資料
        if (word || meaning || reading || extra) {
            newWords.push({ word: word, meaning: meaning, reading: reading, extra: extra });
        }
    });

    if (currentWorkingTask) {
        const targetBankId = currentWorkingTask.vocabBankId;
        if (targetBankId) {
            // 2. 讀取現有的雙層結構
            let vocabGroups = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
            
            // 3. 直接在載入的 vocabGroups 裡面穿透雙層尋找並更新！
            let found = false;
            for (const group of vocabGroups) {
                if (group.units && Array.isArray(group.units)) {
                    const targetUnit = group.units.find(u => u.id === targetBankId || u.bankId === targetBankId);
                    if (targetUnit) {
                        targetUnit.words = [...newWords]; // 直接修改物件屬性
                        found = true;
                        break;
                    }
                }
            }

            if (found) {
                // 4. 寫回 localStorage
                localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabGroups));
                console.log("✅ 單字成功存入雙層結構！");
            } else {
                console.warn("⚠️ 找不到對應的 unitId:", targetBankId);
            }
        }

        // 5. 如果任務本身需要更新狀態（例如 vocabState），可以同步更新同標題或當前任務
        const targetTitle = currentWorkingTask.title;
        tasks.forEach(t => {
            if (t.title === targetTitle && t.stage === 1) {
                t.vocabState = 'ready'; // 狀態轉為可開始
            }
        });
        
        saveAndRefresh();
    }
    
    closeModal('vocab-input-modal');
}

// 5. 開始「刷單字」（熟 / 不熟 UI）
function startVocabSession(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const wordsList = getWordsForTask(task) || [];

    if (wordsList.length === 0) {
        alert('這個單元還沒有單字喔！請先輸入單字。');
        return;
    }

    // 初始化複習階段物件，確保 unlearnedWords 絕對有值
    activeVocabSession = {
        taskId: task.id,
        unlearnedWords: getWordsForTask(task),
        unlearnedNext: [],
        currentIndex: 0,
        vocabFont: getVocabWordbankForTask(task).vocabFont || 'default'
    };

    // 打開背單字卡片 Modal (請依你專案中實際的 modal id 調整)
    openModal('vocab-flashcard-modal'); 
    showNextWord();
    }

    function getCustomFontClass(vocabFont) {
    if (vocabFont === 'jp') {
        return 'font-jp';
    }
    return 'font-deafault';
}

// ==========================================
// 1. 核心：完美淡入淡出的 showNextWord
// ==========================================
// ==========================================
// 點「熟了」或「不熟」切換到下一張（瞬間切換到正面，保留平時點擊的 3D 動畫）
// ==========================================
function showNextWord() {
    const session = activeVocabSession;
    if (!session) return;

    if (session.currentIndex >= session.unlearnedWords.length) {
        // 全部刷完！
        finishVocabSession();
        return;
    }

    const cardContainer = document.getElementById('main-flashcard');

    if (cardContainer) {
        // 🌟 1. 瞬間切換技巧：先把動畫 transition 關掉，強制移除翻面狀態回到正面
        cardContainer.style.transition = 'none';
        cardContainer.classList.remove('is-flipped');

        // 🌟 2. 強制讓瀏覽器重繪 (Force Reflow)，確保拔掉動畫的狀態瞬間生效
        void cardContainer.offsetWidth;

        // 🌟 3. 恢復你原本點擊卡片時需要的 3D 翻面動畫 transition（通常是 transform 0.6s 左右，依你 CSS 為主）
        cardContainer.style.transition = ''; 
    }

    // 4. 更新下一張卡的內容與字體
    updateCardDOMContent();

    // 5. 更新進度顯示
    const progressEl = document.getElementById('vocab-progress');
    if (progressEl) {
        progressEl.innerText = `${session.currentIndex + 1} / ${session.unlearnedWords.length}`;
    }
}
// ==========================================
// 2. 更新卡片 DOM 內容
// ==========================================
function updateCardDOMContent() {
    const session = activeVocabSession;
    if (!session) return;
    if (session.currentIndex >= session.unlearnedWords.length) return;

    const currentItem = session.unlearnedWords[session.currentIndex];

    const wordText = typeof currentItem === 'object' ? (currentItem.word || '') : currentItem;
    const meaningText = typeof currentItem === 'object' ? (currentItem.meaning || '（無填寫意思）') : '';
    const readingText = typeof currentItem === 'object' ? (currentItem.reading || '') : '';

    const vocabFont = session.vocabFont || 'jp';
    const customFontClass = getCustomFontClass(vocabFont);

    const wordEl = document.getElementById('card-word-text');
    const meaningEl = document.getElementById('card-meaning-text');
    const readingEl = document.getElementById('card-reading-text');

    // 1. 正面單字
    if (wordEl) {
        wordEl.innerText = wordText;
        wordEl.className = `flashcard-word ${customFontClass}`;
    }

    // 2. 背面意思
    if (meaningEl) {
        meaningEl.className = 'font-serif-main';
        meaningEl.innerHTML = parseMixedFontText(meaningText, vocabFont);
    }

    // 3. 背面讀音/補充
    if (readingEl) {
        readingEl.className = 'font-serif-main';
        const formattedReading = readingText ? `${readingText}` : '';
        readingEl.innerHTML = parseMixedFontText(formattedReading, vocabFont);
    }

    // 容器字體切換
    const cardContainer = document.getElementById('main-flashcard');
    if (cardContainer) {
        if (vocabFont === 'jp' || vocabFont === 'japanese') {
        cardContainer.classList.add('font-jp');
        } else {
        cardContainer.classList.remove('font-jp');
        }
    }
}

// 按下「熟」或「不熟」
function answerVocab(isKnown) {
    const session = activeVocabSession;
    // 🌟 修正為從當前正在刷的 unlearnedWords 陣列中抓取
    const currentWord = session.unlearnedWords[session.currentIndex];

    if (!isKnown) {
        session.unlearnedNext.push(currentWord); // 標記為不熟
    }

    session.currentIndex++;
    showNextWord();
}

// 刷完單字結算：當場 push 一個全新的「待複習單字」 Task 到任務陣列中
function finishVocabSession() {
    closeModal('vocab-flashcard-modal');

    if (!activeVocabSession || !activeVocabSession.taskId) {
        return;
    }

    const currentTask = tasks.find(t => t.id === activeVocabSession.taskId);

    if (currentTask) {
        currentTask.isCompleted = true; // 原任務標記完成

        // 🌟 如果當前已經是「待複習單字」任務，做完直接結束，不重複生成
        if (currentTask.type === 'vocab_review') {
            saveAndRefresh();
            if (typeof openDayModal === 'function' && selectedDateStr) openDayModal(selectedDateStr);
            return;
        }

        // 🌟 只有「原任務」測驗完且「有不熟單字」時，才在當天生成「待複習單字」 Task
        if (activeVocabSession.unlearnedNext.length > 0) {
            const baseTitle = currentTask.groupName || currentTask.title.replace(/^待複習單字\s*\((.*)\)$/, '$1');

            const unitName = currentTask.groupName || '單字組';
            const newReviewTask = {    
                id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString()),
                groupId: currentTask.groupId,
                groupName: baseTitle,
                type: 'vocab_review',
                title: `待複習單字 (${unitName})`,
                dueDate: selectedDateStr, // 新增到當天
                stage: 1,
                vocabBankId: currentTask.vocabBankId,
                
                isVocab: true,
                // 🌟 核心：待複習任務的 words 裡面「只有不熟的單字」
                unlearnedWords: [...activeVocabSession.unlearnedNext],
                
                // 🌟 確保字體設定正確繼承（兼容 vocabFont 或 vocabFont）
                vocabFont: currentTask.vocabFont || currentTask.vocabFont,
                vocabState: 'ready',
                
                weight: 0,
                color: currentTask.color || '#4a90e2',
                isCompleted: false
            };

            tasks.push(newReviewTask);
        }

        saveAndRefresh();
    }

    if (typeof openDayModal === 'function' && selectedDateStr) {
        openDayModal(selectedDateStr);
    }

    if (activeVocabSession.unlearnedNext.length > 0) {
        alert(`🎉 測驗完成！已自動為 ${activeVocabSession.unlearnedNext.length} 個不熟單字新增「待複習單字」任務。`);
    } else {
        alert('🎉 太棒了！所有單字皆已掌握，無須新增待複習卡片！');
    }
}

// ================= 進階設定：檢視所有單字庫 =================

// -------------------------------------------------------------
// 【第一層】：顯示所有主題單字庫 (如：英文進階單字)
// -------------------------------------------------------------
let currentSelectedBankId = null; // 目前選中的單字庫 ID

function openVocabManager() {
    const listContainer = document.getElementById('vocab-group-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // 🌟此時讀出來的直接就是雙層的 Group 陣列
    const vocabGroups = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');

    if (vocabGroups.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">目前沒有任何單字庫</p>';
        return;
    }

    // 直接走訪每一個大群組
    vocabGroups.forEach(group => {
        const unitCount = (group.units || []).length;

        const row = document.createElement('div');
        row.className = 'vocab-item-row';
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);';
        
        row.innerHTML = `
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
                <strong>📁 ${group.groupName || '未命名群組'}</strong>
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

// 刪除整個主題單字庫
function deleteVocabGroupTitle(groupTitle) {
    if (!confirm(`確定要刪除「${groupTitle}」整個主題單字庫嗎？\n（這會清空此主題下所有 Unit 的單字）`)) return;

    const stage1 = tasks.find(t => t.title === groupTitle && t.stage === 1);
    if (stage1) {
        stage1.words = [];
        stage1.unlearnedWords = [];
        stage1.vocabState = 'need-input';
    }

    saveAndRefresh();
    openVocabManager();
}

// -------------------------------------------------------------
// 【第二層】：顯示該主題下的單元 Unit 列表 (如：Unit 1, Unit 2 或各階段)
// -------------------------------------------------------------
function openVocabUnitsModal(groupId) {
  currentSelectedGroupTitle = groupId; // 如果你有用到這個全域變數
  closeModal('vocab-manager-modal');

  const vocabGroups = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
  const currentGroup = vocabGroups.find(g => g.groupId === groupId);

  const titleEl = document.getElementById('vocab-units-title');
  if (titleEl) {
    // 👑 這裡正確顯示大群組的名字，絕對不會再出現奇怪的 ID
    titleEl.innerText = currentGroup ? currentGroup.groupName : '單元列表';
  }

  const listContainer = document.getElementById('vocab-unit-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  // 🌟 從該群組中拿出 units 陣列
  const units = currentGroup ? (currentGroup.units || []) : [];

  if (units.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">此主題下無單元</p>';
  } else {
    units.forEach(unit => {
      const wordCount = (unit.words || []).length;
      const displayName = unit.name || unit.title || '未命名單元'; // 🛡️ 防呆：避免 undefined

      const row = document.createElement('div');
      row.className = 'vocab-item-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);';

      row.innerHTML = `
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
          <strong>${displayName}</strong>
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

// 刪除單個 Unit 的單字內容
function deleteSingleUnit(unitTitle) {
    if (!confirm(`確定要清空「${unitTitle}」的單字資料嗎？`)) return;

    tasks.forEach(t => {
        if (t.title === unitTitle) {
        t.words = [];
        t.unlearnedWords = [];
        t.vocabState = 'need_input';
        }
    });

    saveAndRefresh();
    openVocabUnitsModal(currentSelectedGroupTitle); // 重新刷新單元頁面
}

// -------------------------------------------------------------
// 【第三層】：檢視與編輯具體 Unit 內的單字 (即原本的 openVocabGroupDetail)
// -------------------------------------------------------------
// -------------------------------------------------------------
// 【第三層】：從任務點擊進入，檢視與編輯具體 Unit 內的單字
// -------------------------------------------------------------
function openVocabDetail(taskId) {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    // 暫存目前正在編輯的目標任務
    currentWorkingTask = currentTask;
    reviewTask = null;

    // 🌟 核心修正：如果是透過任務進來，我們要順便設定好 currentWorkingGroupId 與 currentWorkingBankId
    // 這樣後面按下儲存時，才能正確寫回雙層結構的 localStorage！
    if (currentTask.type === 'vocab_review') {
        reviewTask = currentTask;
        currentWorkingGroupId = currentTask.groupId;
        currentWorkingBankId = currentTask.vocabBankId;
    } else if (currentTask.vocabBankId) {
        currentWorkingGroupId = currentTask.groupId;
        currentWorkingBankId = currentTask.vocabBankId;
    }

    // 設定標題與字體選單
    document.getElementById('vocab-detail-title').innerText = `編輯單字：${currentTask.title}`;
    const fontSelect = document.getElementById('vocab-font-select');
    if (fontSelect) {
        fontSelect.value = currentTask.vocabFont || 'default';
    }

    // 渲染動態表格列 (這裡直接呼叫你的 getWordsForTask，它會透過 doubleFind 幫你把雙層的單字撈出來)
    const container = document.getElementById('vocab-rows-container');
    if (container) {
        container.innerHTML = '';
        const wordsData = getWordsForTask(currentTask) || [];

        if (wordsData.length > 0) {
            wordsData.forEach(item => {
                if (typeof item === 'string') {
                    addVocabRow(item, '', '');
                } else {
                    addVocabRow(item.word || '', item.meaning || '', item.reading || '');
                }
            });
        } else {
            addVocabRow(); // 預設給一行空白
        }
    }

    openModal('vocab-detail-modal');
}

// 動態新增一列輸入框
function addVocabRow(word = '', meaning = '', reading = '') {
    // 🌟 智慧尋找容器：優先找目前畫面上正開著的 modal 裡面的容器
    let container = null;

    // 1. 先嘗試找新版的編輯容器
    const detailContainer = document.getElementById('vocab-rows-container');
    // 2. 嘗試找舊版的輸入容器（如果你保留了它並改了 ID）
    const inputContainer = document.getElementById('vocab-input-rows-container');

    // 檢查哪個容器有在 DOM 中且所處的 modal 是顯示狀態，或者直接採用有抓到的那一個
    if (detailContainer && detailContainer.offsetParent !== null) {
        container = detailContainer;
    } else if (inputContainer && inputContainer.offsetParent !== null) {
        container = inputContainer;
    } else {
        // 預設就抓任何一個找得到的
        container = detailContainer || inputContainer;
    }

    if (!container) {
        console.warn("找不到任何可用的單字行容器！");
        return;
    }

    const row = document.createElement('div');
    row.className = 'vocab-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    row.innerHTML = `
        <input type="text" class="input-word" placeholder="單字" value="${word}" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
        <input type="text" class="input-meaning" placeholder="意思" value="${meaning}" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
        <input type="text" class="input-reading" placeholder="讀音/補充" value="${reading}" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
        <button type="button" onclick="this.parentElement.remove()" style="width: 34px; height: 32px; background: #ff4d4f; color: white; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0;">✕</button>
    `;

    container.appendChild(row);
}

function saveVocabDetailModal() {
    if (!currentWorkingBankId) {
        console.error("❌ 存檔失敗：currentWorkingBankId 未定義！");
        alert("找不到當前編輯的單字庫，請重新點擊編輯。");
        return;
    }

    let container = document.querySelector('#vocab-rows-container') || document.querySelector('#vocab-words-list');
    if (!container) {
        console.error("❌ 存檔失敗：找不到任何單字列容器！");
        return;
    }

    const rows = container.querySelectorAll('.vocab-row');
    const newWords = [];

    rows.forEach(row => {
        const word = row.querySelector('.input-word')?.value.trim() || '';
        const meaning = row.querySelector('.input-meaning')?.value.trim() || '';
        const reading = row.querySelector('.input-reading')?.value.trim() || '';

        if (word || meaning || reading) {
        newWords.push({ 
            word: word, 
            meaning: meaning, 
            reading: reading 
        });
        }
    });

    let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
    const targetBank = doubleFind(currentWorkingBankId);
    const currentReviewTask = reviewTask;
    
    if (targetBank) {
        if (currentReviewTask) {
            currentReviewTask.unlearnedWords = [...newWords];
        }
        else {
            targetBank.words = [...newWords];
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }
    }

    saveAndRefresh();
    closeModal('vocab-detail-modal');

    if (typeof selectedDateStr !== 'undefined' && selectedDateStr && !(toolsSettings)) {
        openDayModal(selectedDateStr);
    }
}

function saveVocabDetailModalAdvanced() {
    if (!currentWorkingBankId) {
        console.error("❌ 存檔失敗：currentWorkingBankId 未定義！");
        alert("找不到當前編輯的單字庫，請重新點擊編輯。");
        return;
    }

    let container = document.querySelector('#vocab-rows-container') || document.querySelector('#vocab-words-list');
    if (!container) {
        console.error("❌ 存檔失敗：找不到任何單字列容器！");
        return;
    }

    const rows = container.querySelectorAll('.vocab-row');
    const newWords = [];

    rows.forEach(row => {
        const word = row.querySelector('.input-word')?.value.trim() || '';
        const meaning = row.querySelector('.input-meaning')?.value.trim() || '';
        const reading = row.querySelector('.input-reading')?.value.trim() || '';

        if (word || meaning || reading) {
        newWords.push({ 
            word: word, 
            meaning: meaning, 
            reading: reading 
        });
        }
    });

    let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
    const targetBank = doubleFind(currentWorkingBankId);
    const currentReviewTask = reviewTask;
    
    if (targetBank) {
        if (currentReviewTask) {
            currentReviewTask.unlearnedWords = [...newWords];
        }
        else {
            targetBank.words = [...newWords];
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }
    }

    saveAndRefresh();
    closeModal('vocab-detail-modal');
}

function openVocabGroupDetail(taskId) {
    closeModal('vocab-units-modal'); // 關閉第二層
    
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) {
        console.error("❌ 找不到對應的任務 ID:", taskId);
        return;
    }

    // 🌟 V5 核心：透過任務的 vocabBankId 找到對應的單字庫
    const bankId = currentTask.vocabBankId;
    const vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
    const targetBank = doubleFind(bankId);

    if (!targetBank) {
        alert("這個任務尚未綁定任何單字庫，或單字庫已被移除！");
        return;
    }

    currentWorkingBankId = targetBank.id; 

    // 設定標題與字體
    const titleEl = document.getElementById('vocab-detail-title');
    if (titleEl) {
        if (currentTask.type == "vocab_review")
            titleEl.innerText = `編輯單字庫：待複習單字 (${targetBank.name})`;
        else
            titleEl.innerText = `編輯單字庫：${targetBank.name}`;
    }

    const fontSelect = document.getElementById('vocab-font-select');
    if (fontSelect) {
        fontSelect.value = currentTask.vocabFont || 'default';
    }   

    // 渲染多欄位動態表格
    const container = document.getElementById('vocab-rows-container') || document.getElementById('vocab-words-list');
    if (container) {
        container.innerHTML = '';
        
        const wordsData = getWordsForTask(currentTask) || [];

        if (wordsData.length > 0) {
        wordsData.forEach(item => {
            addVocabRow(item.word || '', item.meaning || '', item.reading || '');
        });
        } else {
            addVocabRow(); // 沒單字就給一行空白
        }
    }

    openModal('vocab-detail-modal');
}

function openVocabManagerFromTools() {
    closeModal('tools-modal'); // 先關閉進階設定視窗
    openVocabManager();           // 再開啟單字庫管理視窗
}

// 點擊「檢視/編輯」某個獨立單字庫
function openVocabBankDetail(bankId) {
  closeModal('vocab-manager-modal'); // 關閉總覽 Modal
  reviewTask = null;

  const vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
  const targetBank = doubleFind(bankId);
  
  if (!targetBank) {
    alert("找不到該單字庫！");
    return;
  }

  currentWorkingBankId = targetBank.id; // 記錄目前正在編輯的 bankId

  // 設定標題
  const titleEl = document.getElementById('vocab-detail-title');
  if (titleEl) {
    titleEl.innerText = `編輯單字庫：${targetBank.name}`;
  }

  // 渲染多欄位動態表格
  const container = document.getElementById('vocab-rows-container') || document.getElementById('vocab-words-list');
  if (container) {
    container.innerHTML = '';
    const wordsData = targetBank.words || [];

    if (wordsData.length > 0) {
      wordsData.forEach(item => {
        addVocabRow(item.word || '', item.meaning || '', item.reading || '');
      });
    } else {
      addVocabRow(); // 沒單字就給一行空白
    }
  }

  openModal('vocab-detail-modal');
}

// 刪除整個獨立單字庫
function deleteVocabBank(bankId) {
  let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
  const targetBank = doubleFind(bankId);
  
  if (!targetBank) return;

  if (!confirm(`確定要刪除「${targetBank.name}」這個單字庫嗎？`)) return;

  // 1. 從 vocabBanks_V5 中移除
  vocabBanks = vocabBanks.filter(b => b.id !== bankId);
  localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));

  // 2. 把相關任務的 vocabBankId 設為 null，並清空其進度
  tasks.forEach(t => {
    if (t.vocabBankId === bankId) {
      t.vocabBankId = null;
      t.unlearnedWords = [];
    }
  });

  saveAndRefresh();
  openVocabManager(); // 重新整理總覽列表
}

// 新增單個單字
function addSingleVocab() {
    const input = document.getElementById('new-single-vocab');
    const val = input.value.trim();
    if (!val) return;

    const task = tasks.find(t => t.id === currentManagingGroupId);
    if (task.vocabBankId) {
        let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
        const targetBank = doubleFind(task.vocabBankId);
        
        if (targetBank) {
            targetBank.words.push(val);
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }
        saveAndRefresh();
        renderVocabWordsList();
        input.value = '';
    }
}

// 刪除單個單字
function deleteSingleVocab(index) {
    const task = tasks.find(t => t.id === currentManagingGroupId);
    if (task.vocabBankId) {
        let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
        const targetBank = doubleFind(task.vocabBankId);
        
        if (targetBank) {
            targetBank.words.splice(index, 1);
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }
        saveAndRefresh();
        renderVocabWordsList();
    }
}

// 修改該單字庫字體
function changeVocabGroupFont() {
    const font = document.getElementById('vocab-font-select').value;
    const task = tasks.find(t => t.id === currentManagingGroupId);
    if (task.vocabBankId) {
        let vocabBanks = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');
        const targetBank = doubleFind(task.vocabBankId);
        
        if (targetBank) {
            targetBank.vocabFont=font;
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }
        saveAndRefresh();
        renderVocabWordsList();
    }
}

function toggleCardFlip(containerElement) {
    const card = containerElement.querySelector('.flashcard');
    if (card) {
        card.classList.toggle('is-flipped');
    }
}

function renderCurrentFlashcard() {
    // 假設你的當前單字陣列是 currentFlashcardList，索引是 currentIndex
    const currentItem = currentFlashcardList[currentIndex] || {};

    // 1. 填入正面與背面資料
    document.getElementById('card-word-text').textContent = currentItem.word || '';
    document.getElementById('card-meaning-text').textContent = currentItem.meaning || '（無填寫意思）';
    document.getElementById('card-reading-text').textContent = currentItem.reading || '';

    // 2. 更新進度顯示
    document.getElementById('vocab-progress').textContent = `${currentIndex + 1} / ${currentFlashcardList.length}`;

    // 3. 確保切換卡片時，卡片會自動轉回「正面」
    const card = document.getElementById('main-flashcard');
    if (card) {
        card.classList.remove('is-flipped');
    }
}

function parseMixedFontText(rawText, vocabFont) {
    if (!rawText) return '';

    // 1. 基本的 HTML 轉義，確保安全
    let escaped = escapeHtml(rawText);

    // 2. 取得該計畫對應的自定義字體 Class
    const fontClassName = getCustomFontClass(vocabFont);

    // 3. 抓取被單個星號正確包夾的文字並套用字體
    // 如果不小心多打星號（例如 *字**），正規表達式會安全匹配有效部分，其餘原樣保留，絕不報錯
    let parsed = escaped.replace(/\*([^\*]+)\*/g, `<span class="${fontClassName}">$1</span>`);

    return parsed;
}

// HTML 轉義防呆函數
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
