const APP_VERSION = "v1.2.3";

const modalContent = document.querySelector('#tools-modal .modal-content');
if (modalContent) {
  modalContent.insertAdjacentHTML('beforeend', `
    <div style="text-align: center; margin-top: 20px; font-size: 0.8rem; opacity: 0.5;">
      ${APP_VERSION}
    </div>
  `);
}

const DB_VERSION = 'V5';
const DB_TASKS = `calendarTasks_${DB_VERSION}`;
const DB_VOCAB_BANKS = `vocabBanks_${DB_VERSION}`;
const DB_CAPS = `calendarCaps_${DB_VERSION}`;
const DB_COLORS = `recentColors_${DB_VERSION}`;
const DB_THEME = `calendarTheme_${DB_VERSION}`;
const DB_PRESETS = `quickPresets_${DB_VERSION}`; // 新增計畫的「快捷選擇」清單
const DB_VOCAB_LAYOUT = `vocabLayout_${DB_VERSION}`; // 單字輸入/編輯視窗的版面偏好：row(直排) | stack(橫排)
const DB_PALETTE = `uiPalette_${DB_VERSION}`; // 配色：morandi | paper | dusk
const DB_ANIM = `uiAnimations_${DB_VERSION}`;   // 動畫：on | off
const PALETTES = ['morandi', 'paper', 'dusk'];
const REVIEW_INTERVALS = [0, 1, 4, 11, 25, 55];

// 舊版 Key (用於向下相容相依性檢查)
const OLD_DB_TASKS_V4 = 'calendarTasksV4';

// 全域資料狀態
let tasks = [];
let vocabBanks = [];
let capacities = [];
let recentColors = [];

// 單字資料的標準格式：{ id: 編號, word: 單字, meanings: [意思, ...], reading: 讀音（單行）, note: 補充（可多行） }
// 相容舊格式：
//   - 純字串
//   - 單一 meaning 字串的物件
//   - 沒有 note 欄位的舊資料：「讀音/補充」原本合在同一欄，遷移時整段都放進補充，讀音留空
// 每個單字有固定編號（id）：單字庫與「待複習單字」靠它對應同一個單字，單字庫修改後才能同步
function newWordId() {
  return 'w_' + (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
}

function normalizeWordEntry(item) {
  if (typeof item === 'string') {
    return { id: newWordId(), word: item, meanings: [], reading: '', note: '' };
  }
  item = item || {};

  let meanings = [];
  if (Array.isArray(item.meanings)) {
    meanings = item.meanings;
  } else if (item.meaning) {
    meanings = [item.meaning];
  }
  meanings = meanings.map(m => String(m ?? '').trim()).filter(m => m !== '');

  let reading = '';
  let note;
  if (typeof item.note === 'string') {
    reading = String(item.reading ?? '');
    note = item.note;
  } else {
    // 舊版資料（沒有 note 欄位）：「讀音/補充」整段移到補充，不自動填到讀音。
    // 字面上的 \n 也視為換行。
    note = String(item.reading ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\\n/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .join('\n')
      .trim();
  }

  return {
    id: item.id || newWordId(),
    word: item.word || '',
    meanings: meanings,
    reading: reading,
    note: note
  };
}

function normalizeWords(wordsArray) {
  if (!Array.isArray(wordsArray)) return [];
  return wordsArray.map(item => normalizeWordEntry(item));
}

// HTML 轉義（防止標題/單字含 < > & 或引號時破壞畫面）
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// vocabBanks V5
// {
// groupMap[gId] = {
//     groupId:,
//     groupName:,
//     units: [ [
//         groupId:,
//         groupName:,
//         id:,
//         name:,
//         words:,
//         vocabFont:
//         ],
//         [...]
//       ]
// };

// ==========================================
// 2. 資料載入與自動遷移 (正規化完美版)
// ==========================================
function loadAndMigrateData() {
    const savedTasksV5 = localStorage.getItem(DB_TASKS);
    const savedVocabBanksV5 = localStorage.getItem(DB_VOCAB_BANKS);

    // 情況 A：已經存在 V5 最新格式
    if (savedTasksV5 && savedVocabBanksV5) {
        tasks = JSON.parse(savedTasksV5);
        vocabBanks = JSON.parse(savedVocabBanksV5); // 這裡的 vocabBanks 現在會是雙層 Group 陣列！
        console.log('[State] 成功載入 V5 雙層巢狀資料結構');
        return;
    }

    // 情況 B：找不到 V5，但發現舊版 V4 資料 ➔ 進行「雙層結構」升級遷移
    const oldDataJson = localStorage.getItem(OLD_DB_TASKS_V4);
    if (oldDataJson) {
        console.log('[State] 偵測到 V4 舊版，啟動雙層巢狀結構自動遷移...');
        const parsedData = JSON.parse(oldDataJson);
        const oldTasks = Array.isArray(parsedData.tasks) ? parsedData.tasks : [];
        
        tasks = [];
        
        // 核心改變：用一個暫時的物件來把單字庫依 groupId 分群
        const groupMap = {}; 
        let unitTotalCount = 0;

        oldTasks.forEach((oldTask, index) => {
            // 1. 處理單字庫 (轉為雙層結構的 Unit)
            if (oldTask.enableVocab === true && oldTask.stage === 1) {
                const assignedBankId = `vb_${Date.now()}_${index}`;
                
                // 決定群組 ID 與 名稱（如果舊資料沒有 groupId，用名字切或給預設值）
                const gId = oldTask.groupId || `G_${Date.now()}`;
                const gName = oldTask.groupName || (oldTask.title ? oldTask.title.replace(/[\d\s-_]+$/, '').trim() : "未分類");

                // 如果這個群組還沒建立過，先開一個抽屜
                if (!groupMap[gId]) {
                    groupMap[gId] = {
                        groupId: gId,
                        groupName: gName,
                        units: []
                    };
                }

                // 把這個單元塞進該群組的 units 陣列裡
                groupMap[gId].units.push({
                    groupId: gId,
                    groupName: gName,
                    id: assignedBankId,
                    name: oldTask.title ? oldTask.title : `單元 ${index + 1}`,
                    words: normalizeWords(oldTask.words),
                    vocabFont: oldTask.vocabFont || 'default'
                });

                unitTotalCount++;
                
                // 讓 task 本體記錄對應的 vocabBankId
                const cleanTask = { ...oldTask };
                delete cleanTask.words;
                if (cleanTask.type != "vocab_review") delete cleanTask.unlearnedWords;
                if (cleanTask.unlearnedWords && Array.isArray(cleanTask.unlearnedWords)) {
                    cleanTask.unlearnedWords = normalizeWords(cleanTask.unlearnedWords);
                }
                cleanTask.vocabBankId = assignedBankId;
                tasks.push(cleanTask);
            } else {
                // 普通任務直接保留
                const cleanTask = { ...oldTask };
                tasks.push(cleanTask);
            }
        });

        // 把 groupMap 轉回陣列指定給 vocabBanks (此時 vocabBanks 就是 Group 陣列)
        vocabBanks = Object.values(groupMap);

        // 儲存其他全域設定
        if (parsedData.capacities) localStorage.setItem(DB_CAPS, JSON.stringify(parsedData.capacities));
        if (parsedData.recentColors) localStorage.setItem(DB_COLORS, JSON.stringify(parsedData.recentColors));
        if (parsedData.theme) localStorage.setItem(DB_THEME, JSON.stringify(parsedData.theme));

        // 寫入 V5
        saveAllData();
        console.log(`[State] V4 ➔ V5 雙層巢狀結構遷移與正規化完成！`);
        console.log(`任務總數: ${tasks.length}`);
        console.log(`總群組數: ${vocabBanks.length} 個大主題`);
        console.log(`獨立單元總數: ${unitTotalCount} 個單字庫單元`);
        return;
    }

    // 情況 C：全新使用者
    tasks = [];
    vocabBanks = []; // 全新環境下，這裡也會是空的 Group 陣列
    console.log('[State] 初始化全新乾淨環境 (V5 雙層結構)');
}

function saveAllData() {
  localStorage.setItem(DB_TASKS, JSON.stringify(tasks));
  localStorage.setItem(DB_VOCAB_BANKS, JSON.stringify(vocabBanks));
}

// 啟動時執行
loadAndMigrateData();

// 把已儲存的單字（單字庫與待複習任務）統一升級為 meanings 陣列格式
function migrateWordShapes() {
  let changed = false;
  const upgrade = (arr) => arr.map(w => {
    const n = normalizeWordEntry(w);
    if (JSON.stringify(n) !== JSON.stringify(w)) changed = true;
    return n;
  });

  vocabBanks.forEach(group => {
    (group.units || []).forEach(unit => {
      if (Array.isArray(unit.words)) unit.words = upgrade(unit.words);
    });
  });
  // 舊版「待複習單字」是沒有編號的複製品：用單字文字對回單字庫裡的同一個單字，並套用單字庫目前的內容
  tasks.forEach(t => {
    if (!Array.isArray(t.unlearnedWords)) return;
    let bank = null;
    if (t.vocabBankId) {
      vocabBanks.forEach(g => { (g.units || []).forEach(u => { if (u.id === t.vocabBankId) bank = u; }); });
    }
    t.unlearnedWords = t.unlearnedWords.map(w => {
      if (w && typeof w === 'object' && w.id) return w;
      const entry = normalizeWordEntry(w);
      const match = bank && (bank.words || []).find(b => b.word === entry.word);
      if (match) Object.assign(entry, normalizeWordEntry(match));
      changed = true;
      return entry;
    });
    t.unlearnedWords = upgrade(t.unlearnedWords);
  });

  if (changed) saveAllData();
  return changed;
}
migrateWordShapes();

// 單字庫的單字改過之後，讓綁定這個單字庫的「待複習單字」任務同步：
//   - 單字庫裡仍存在的單字：換成最新內容（改了意思、讀音、補充都會跟著變）
//   - 已從單字庫刪除的單字：從待複習移除，題數跟著減少；全部刪光的待複習任務會一併移除
//   - 待複習清單自己新增、單字庫沒有的單字：保留
// 呼叫後由呼叫端負責存檔（saveAndRefresh）
function syncReviewTasksWithBank(bankId, prevWords, newWords) {
  const prevIds = new Set((prevWords || []).map(w => w.id).filter(Boolean));
  const byId = new Map((newWords || []).map(w => [w.id, w]));
  tasks = tasks.filter(t => {
    if (t.type !== 'vocab_review' || t.vocabBankId !== bankId || !Array.isArray(t.unlearnedWords)) return true;
    const before = t.unlearnedWords.length;
    t.unlearnedWords = t.unlearnedWords.reduce((acc, w) => {
      const current = byId.get(w.id);
      if (current) acc.push(normalizeWordEntry(current));
      else if (!prevIds.has(w.id)) acc.push(w);
      return acc;
    }, []);
    return !(before > 0 && t.unlearnedWords.length === 0);
  });
}

// 獨立儲存單字庫 (當在管理介面單獨修改單字內容時呼叫)
function saveVocabBanks() {
  localStorage.setItem(DB_VOCAB_BANKS, JSON.stringify(vocabBanks));
}
