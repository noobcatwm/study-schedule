const APP_VERSION = "v1.1.4";

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
const REVIEW_INTERVALS = [0, 1, 4, 11, 25, 55];

// 舊版 Key (用於向下相容相依性檢查)
const OLD_DB_TASKS_V4 = 'calendarTasksV4';

// 全域資料狀態
let tasks = [];
let vocabBanks = [];
let capacities = [];
let recentColors = [];

function normalizeWords(wordsArray) {
  if (!Array.isArray(wordsArray)) return [];
  
  return wordsArray.map(item => {
    // 如果舊資料只是純字串，轉成標準物件結構，意思與讀音留空
    if (typeof item === 'string') {
      return {
        word: item,
        meaning: '',
        reading: ''
      };
    }
    // 如果本來就是物件，確保三個欄位都存在
    return {
      word: item.word || '',
      meaning: item.meaning || '',
      reading: item.reading || ''
    };
  });
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

    // 🟢 情況 A：已經存在 V5 最新格式
    if (savedTasksV5 && savedVocabBanksV5) {
        tasks = JSON.parse(savedTasksV5);
        vocabBanks = JSON.parse(savedVocabBanksV5); // 這裡的 vocabBanks 現在會是雙層 Group 陣列！
        console.log('📂 [State] 成功載入 V5 雙層巢狀資料結構');
        return;
    }

    // 🟡 情況 B：找不到 V5，但發現舊版 V4 資料 ➔ 進行「雙層結構」升級遷移
    const oldDataJson = localStorage.getItem(OLD_DB_TASKS_V4);
    if (oldDataJson) {
        console.log('🔄 [State] 偵測到 V4 舊版，啟動雙層巢狀結構自動遷移...');
        const parsedData = JSON.parse(oldDataJson);
        const oldTasks = Array.isArray(parsedData.tasks) ? parsedData.tasks : [];
        
        tasks = [];
        
        // 🌟 核心改變：用一個暫時的物件來把單字庫依 groupId 分群
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

        // 🌟 把 groupMap 轉回陣列指定給 vocabBanks (此時 vocabBanks 就是 Group 陣列)
        vocabBanks = Object.values(groupMap);

        // 儲存其他全域設定
        if (parsedData.capacities) localStorage.setItem(DB_CAPS, JSON.stringify(parsedData.capacities));
        if (parsedData.recentColors) localStorage.setItem(DB_COLORS, JSON.stringify(parsedData.recentColors));
        if (parsedData.theme) localStorage.setItem(DB_THEME, JSON.stringify(parsedData.theme));

        // 寫入 V5
        saveAllData();
        console.log(`✨ [State] V4 ➔ V5 雙層巢狀結構遷移與正規化完成！`);
        console.log(`📋 任務總數: ${tasks.length}`);
        console.log(`📁 總群組數: ${vocabBanks.length} 個大主題`);
        console.log(`📚 獨立單元總數: ${unitTotalCount} 個單字庫單元`);
        return;
    }

    // 🔵 情況 C：全新使用者
    tasks = [];
    vocabBanks = []; // 全新環境下，這裡也會是空的 Group 陣列
    console.log('✨ [State] 初始化全新乾淨環境 (V5 雙層結構)');
}

function saveAllData() {
  localStorage.setItem(DB_TASKS, JSON.stringify(tasks));
  localStorage.setItem(DB_VOCAB_BANKS, JSON.stringify(vocabBanks));
}

// 啟動時執行
loadAndMigrateData();

// 獨立儲存單字庫 (當在管理介面單獨修改單字內容時呼叫)
function saveVocabBanks() {
  localStorage.setItem(DB_VOCAB_BANKS, JSON.stringify(vocabBanks));
}
