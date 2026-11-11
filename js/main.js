tasks = JSON.parse(localStorage.getItem(DB_TASKS) || '[]');
vocabBanks = JSON.parse(localStorage.getItem(DB_VOCAB_BANKS) || '[]');
capacities = JSON.parse(localStorage.getItem(DB_CAPS) || '[5,5,5,5,5,5,5]');
recentColors = JSON.parse(localStorage.getItem(DB_COLORS) || '["#0a84ff", "#ff9f0a", "#bf5af2"]');
let selectedDateStr = "";

let currentWorkingTask = null; // 當前操作的任務
let activeVocabSession = { words: [], unlearnedNext: [], currentIndex: 0, vocabFont: 'default', taskId: null };
let currentManagingGroupId = null; // 進階設定目前管理的單字組
let currentWorkingBankId = null;
let reviewTask = null;

function doubleFind(arg1, arg2 = null) {
    const vocabGroups = JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]');

    // 🟢 狀況 1：如果只傳了一個參數（代表這是一個孤立的 bankId，用來相容舊 task）
    if (arg2 === null) {
        const targetBankId = arg1;
        for (const group of vocabGroups) {
            const foundUnit = (group.units || []).find(u => u.id === targetBankId);
            if (foundUnit) {
                return foundUnit; // 直接回傳該單字庫物件，行為跟原本的 .find() 完全一模一樣！
            }
        }
        return null; // 找不到就回傳 null
    }

    // 🟡 狀況 2：傳了兩個參數（標準的 groupId + unitId 雙層尋找）
    const groupId = arg1;
    const unitId = arg2;

    const targetGroup = vocabGroups.find(g => g.groupId === groupId);
    if (!targetGroup) return null;

    const targetUnit = (targetGroup.units || []).find(u => u.id === unitId);
    return targetUnit || null;
}

// 萬能雙層推入工具：根據新單元的 groupId 自動歸類或建立新群組
function doublePush(vocabGroups, newUnit) {
    // 確保有傳入 groupId
    const gId = newUnit.groupId;
    if (!gId) {
        console.error("❌ doublePush 失敗：newUnit 缺少 groupId", newUnit);
        return vocabGroups; // 原封不動回傳
    }

    // 1. 尋找有沒有這個 groupId 的群組
    let targetGroup = vocabGroups.find(g => g.groupId === gId);

    if (targetGroup) {
        // 找到了：直接推入該群組的 units 陣列
        if (!targetGroup.units) {
            targetGroup.units = [];
        }
        targetGroup.units.push(newUnit);
    } else {
        // 找不到：建立新群組，並把單元塞進去
        const newGroup = {
            groupId: gId,
            groupName: newUnit.groupName || '未命名群組',
            units: [newUnit]
        };
        vocabGroups.push(newGroup);
    }

    // 回傳更新後的雙層陣列（方便呼叫端直接拿去存檔）
    return vocabGroups;
}

function ensureUpgradedWords(wordsInput) {
  if (!Array.isArray(wordsInput)) return [];
  
  return wordsInput.map(item => {
    // 如果本來就是物件且有 word 屬性，直接保留
    if (typeof item === 'object' && item !== null) {
      return {
        word: item.word || '',
        meaning: item.meaning || '',
        reading: item.reading || ''
      };
    } else {
      // 如果是舊版的純字串，自動升級成新版物件（意思、讀音留空）
      return {
        word: String(item),
        meaning: '',
        reading: ''
      };
    }
  });
}

function formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function renderCapacities() {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const row = document.getElementById('capacity-row');
    row.innerHTML = days.map((day, idx) => `
    <div class="capacity-col">
        <span class="capacity-label">${day}</span>
        <input type="number" value="${capacities[idx]}" onchange="updateCapacity(${idx}, this.value)">
    </div>
    `).join('');
}

function updateCapacity(index, val) {
    capacities[index] = parseInt(val) || 0;
    localStorage.setItem(DB_CAPS, JSON.stringify(capacities));
}

function renderRecentColors() {
    const container = document.getElementById('recent-colors');
    container.innerHTML = recentColors.map(color => `
    <div class="color-swatch" style="background-color: ${color}" onclick="selectColor('${color}')"></div>
    `).join('');
}

function selectColor(color) { document.getElementById('task-color').value = color; }

function addRecentColor(color) {
    if (!recentColors.includes(color)) {
    recentColors.unshift(color);
    if (recentColors.length > 5) recentColors.pop();
    localStorage.setItem(DB_COLORS, JSON.stringify(recentColors));
    renderRecentColors();
    }
}

// 更新考試倒數計時橫幅
function updateExamCountdown() {
    const banner = document.getElementById('countdown-banner');
    const todayStr = formatDate(new Date());
    
    // 找出未來最近的一場考試
    let upcomingExams = tasks.filter(t => t.type === 'exam' && t.dueDate >= todayStr)
                            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                            
    if (upcomingExams.length === 0) {
    banner.className = 'exam-countdown-banner empty';
    banner.innerHTML = '<span>尚無近期考試</span>';
    return;
    }
    
    let nextExam = upcomingExams[0];
    let examDate = new Date(nextExam.dueDate);
    let today = new Date();
    today.setHours(0,0,0,0);
    
    let diffTime = examDate - today;
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))-1;
    
    banner.className = 'exam-countdown-banner';
    if (diffDays === 0) {
    banner.innerHTML = `<span>[倒數] ${nextExam.title} 就在今天！</span><span>考試加油！</span>`;
    } else {
    banner.innerHTML = `<span>[倒數] ${nextExam.title}</span><span>還有 ${diffDays} 天 (${nextExam.dueDate})</span>`;
    }
}

function renderCalendar() {
    updateExamCountdown();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = formatDate(today);
    
    let startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    for (let m = 0; m < 13; m++) {
    let currentMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + m, 1);
    let year = currentMonth.getFullYear();
    let month = currentMonth.getMonth();
    
    const monthTitle = document.createElement('div');
    monthTitle.className = 'month-divider';
    monthTitle.innerText = `${year}年 ${month + 1}月`;
    grid.appendChild(monthTitle);
    
    let firstDayIndex = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement('div'));
    
    for (let d = 1; d <= daysInMonth; d++) {
        let dateObj = new Date(year, month, d);
        dateObj.setHours(0,0,0,0);
        let dateStr = formatDate(dateObj);
        
        let cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.setAttribute('data-date', dateStr);
        
        // 判斷是否為過去日期
        if (dateObj < today) {
        cell.classList.add('past-day');
        }
        
        if (dateStr === todayStr) {
        cell.classList.add('today');
        }
        
        let dayTasks = tasks.filter(t => t.dueDate === dateStr);
        if (dayTasks.some(t => t.type === 'exam')) {
        cell.classList.add('exam-day');
        }
        
        // 判斷當天是否所有任務皆已完成
        if (dateStr === todayStr && (dayTasks.length === 0 || dayTasks.every(t => t.isCompleted))) {
        cell.classList.add('all-completed');
        }
        
        let dotsHtml = dayTasks.filter(t => t.type !== 'exam').map(t => 
        `<div class="dot" style="background-color: ${t.color}"></div>`
        ).join('');
        
        cell.innerHTML = `<div class="day-num">${d}</div><div class="dots-container">${dotsHtml}</div>`;
        cell.onclick = () => openDayModal(dateStr);
        grid.appendChild(cell);
    }
    }
}

function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

function openDayModal(dateStr) {
    selectedDateStr = dateStr;
    document.getElementById('day-modal-title').innerText = dateStr;
    renderTaskList(dateStr);
    openModal('day-modal');
}

function openAddTaskModal() {
    closeModal('day-modal');
    document.getElementById('task-type').value = 'study';
    document.getElementById('task-title').value = '';
    toggleFormFields();
    openModal('add-modal');
}

function toggleFormFields() {
    const type = document.getElementById('task-type').value;
    const pFields = document.getElementById('periodic-fields');
    const eFields = document.getElementById('exam-fields');
    const wGroup = document.getElementById('weight-group');
    const cGroup = document.getElementById('color-group');
    const tLabel = document.getElementById('title-label');

    if (type === 'exam') {
    pFields.classList.add('hidden'); eFields.classList.remove('hidden');
    wGroup.classList.remove('hidden'); cGroup.classList.add('hidden');
    tLabel.innerText = "考試科目 / 名稱";
    } else if (type === 'periodic') {
    pFields.classList.remove('hidden'); eFields.classList.add('hidden');
    wGroup.classList.remove('hidden'); cGroup.classList.remove('hidden');
    tLabel.innerText = "主題名稱前綴 (例: 英文單字 Unit)";
    } else {
    pFields.classList.add('hidden'); eFields.classList.add('hidden');
    wGroup.classList.remove('hidden'); cGroup.classList.remove('hidden');
    tLabel.innerText = "讀書計畫名稱";
    }
}

function renderTaskList(dateStr) {
    const list = document.getElementById('task-list');
    const dayTasks = tasks.filter(t => t.dueDate === dateStr);
    
    if (dayTasks.length === 0) {
    list.innerHTML = '<div style="color:var(--sub-text); text-align:center;">無排定計畫。</div>';
    return;
    }

    list.innerHTML = dayTasks.map(t => {
    let badge = t.type === 'exam' ? '[警戒] 考試' : (t.type === 'periodic' ? `[階段 ${t.stage}]` : '[讀書]');
    let colorStyle = t.type !== 'exam' ? t.color : 'var(--exam-red)';
    
    return `
    <div class="task-item ${t.isCompleted ? 'completed' : ''}" style="border-left-color: ${colorStyle}"
            onmousedown="initDrag(event, '${t.id}')" ontouchstart="initDrag(event, '${t.id}')">
        <div class="task-info">
        <div class="task-title">${t.title}</div>
        <div class="task-meta">${badge} | 負荷: ${t.weight || 0}</div>
        </div>
        <div class="task-actions">
        ${renderTaskButtons(t)}
        </div>
    </div>
    `;
    }).join('');
}

function toggleComplete(id) {
    let t = tasks.find(x => x.id === id);
    if (t) t.isCompleted = !t.isCompleted;
    saveAndRefresh();
}

function deleteTask(id) {
    if(confirm('確定要刪除？')) {
    tasks = tasks.filter(x => x.id !== id);
    saveAndRefresh();
    }
}

function getDailyLoad(dateStr, pendingTasks = []) {
    let load1 = tasks.filter(t => t.dueDate === dateStr && !t.isCompleted && t.type !== 'exam')
                .reduce((sum, t) => sum + (t.weight || 0), 0);
    let load2 = pendingTasks.filter(t => t.dueDate === dateStr && !t.isCompleted && t.type !== 'exam')
                .reduce((sum, t) => sum + (t.weight || 0), 0);
    return load1 + load2;
}

function findAvailableDate(targetDateObj, weightToAdd, pendingTasks = []) {
    let curr = new Date(targetDateObj);
    while (true) {
    let dateStr = formatDate(curr);
    let maxCap = capacities[curr.getDay()];
    if (getDailyLoad(dateStr, pendingTasks) + weightToAdd <= maxCap) return dateStr;
    curr.setDate(curr.getDate() + 1);
    }
}

function saveNewTask() {
    const type = document.getElementById('task-type').value;
    const title = document.getElementById('task-title').value.trim();
    const weight = parseInt(document.getElementById('task-weight').value) || 0;
    const color = document.getElementById('task-color').value;

    if (!title) return alert("請輸入名稱");
    if (type !== 'exam') addRecentColor(color);

    if (type === 'study') {
        tasks.push({
            id: Date.now().toString(), type: type, title: title, dueDate: selectedDateStr,
            weight: weight, color: color, isCompleted: false
        });
    } 
    else if (type === 'exam') {
        const duration = parseInt(document.getElementById('exam-duration').value) || 1;
        let currD = new Date(selectedDateStr);
        for(let i = 0; i < duration; i++) {
            tasks.push({
            id: Date.now().toString() + i, type: 'exam', 
            title: title + (duration > 1 ? ` (Day ${i+1})` : ''), 
            dueDate: formatDate(currD), weight: 0, color: 'var(--exam-red)', isCompleted: false
            });
            currD.setDate(currD.getDate() + 1);
        }
    } 
    else if (type === 'periodic') {
        const startUnit = parseInt(document.getElementById('task-start-unit').value) || 1;
        const units = parseInt(document.getElementById('task-units').value) || 1;
        const interval = parseInt(document.getElementById('task-interval').value) || 1;
        const enableVocab = document.getElementById('enable-vocab').checked || false;
        
        let baseDate = new Date(selectedDateStr);
        let groupId = "G_" + Date.now().toString();
        let newTasks = [];
        let maxDate = new Date(baseDate);
        
        // 準備讀取現有的 vocabBanks（如果有點選啟用單字的話）
        let vocabBanks = enableVocab ? JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]') : [];
        let vocabBanksUpdated = false;

        for (let u = startUnit; u < startUnit + units; u++) {
            let unitTitle = `${title} ${u}`; // 例如: "N3 核心單字 1"
            
            // 🌟 關鍵修正：每一個單元獨立處理自己的 vocabBank
            let vocabBankId = null;
            if (enableVocab) {
                let existingBank = doubleFind(unitTitle);
                
                if (existingBank) {
                    vocabBankId = existingBank.id;
                } else {
                    vocabBankId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString() + Math.random().toString());
                    const newBank = {
                        groupId: groupId,
                        groupName: title,
                        id: vocabBankId,
                        name: unitTitle, // 用精準的單元名稱命名
                        words: [],       // 初始空白單字
                        fontType: document.getElementById('vocab-font-type')?.value || 'default'
                    };
                    vocabBanks = doublePush(vocabBanks, newBank);
                    vocabBanksUpdated = true;
                }
            }

            let firstStudyDate = new Date(baseDate);
            firstStudyDate.setDate(firstStudyDate.getDate() + (u - startUnit) * interval);
            
            let actualFirstDateStr = findAvailableDate(firstStudyDate, weight, newTasks);
            let lastScheduledDateObj = new Date(actualFirstDateStr);
            let lastIntervalDays = 0;
            
            REVIEW_INTERVALS.forEach((intervalDays, stageIndex) => {
                let daysToAdd = intervalDays - lastIntervalDays;
                let idealReviewDate = new Date(lastScheduledDateObj);
                idealReviewDate.setDate(idealReviewDate.getDate() + daysToAdd);
                
                let scheduledReviewDateStr = findAvailableDate(idealReviewDate, weight, newTasks);
                let scheduledDateObj = new Date(scheduledReviewDateStr);
                if(scheduledDateObj > maxDate) maxDate = scheduledDateObj;
                
                // 🌟 每個階段的任務，都要綁定屬於該單元的 vocabBankId
                newTasks.push({
                    id: Date.now().toString() + Math.random().toString(),
                    groupId: groupId, 
                    groupName: title, 
                    type: 'periodic', 
                    title: unitTitle, 
                    stage: stageIndex + 1, 
                    enableVocab: enableVocab, 
                    isVocab: enableVocab && stageIndex === 0,
                    vocabBankId: enableVocab ? vocabBankId : null, 
                    dueDate: scheduledReviewDateStr, 
                    weight: weight, 
                    color: color, 
                    isCompleted: false
                });
                
                lastScheduledDateObj = scheduledDateObj;
                lastIntervalDays = intervalDays;
            });
        }
        
        // 如果有新增單字庫，統一寫回 localStorage
        if (vocabBanksUpdated) {
            localStorage.setItem('vocabBanks_V5', JSON.stringify(vocabBanks));
        }

        let twelveMonthsLater = new Date();
        twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);
        if (maxDate > twelveMonthsLater) {
            if (!confirm(`警告：因為負荷量考量，此系列排程最晚將跨越到 ${formatDate(maxDate)}，超過一年！確定要繼續嗎？`)) {
                return;
            }
        }
        
        tasks = tasks.concat(newTasks);
        // 記得儲存 tasks 與重新整理介面
        alert(`成功排入 ${units} 個單元！`);
    }

    closeModal('add-modal');
    saveAndRefresh();
    openDayModal(selectedDateStr);
}

function openToolsModal() {
    const today = new Date();
    document.getElementById('clear-month-input').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    
    const pmList = document.getElementById('periodic-manager-list');
    let groups = {};
    
    tasks.forEach(t => {
        if (t.type === 'periodic' && t.groupId) {
        if (!groups[t.groupId]) groups[t.groupId] = { name: t.groupName, total: 0, completed: 0, color: t.color };
        groups[t.groupId].total++;
        if (t.isCompleted) groups[t.groupId].completed++;
        }
    });
    
    const groupKeys = Object.keys(groups);
    if(groupKeys.length === 0) {
    pmList.innerHTML = '<div style="color:var(--sub-text); text-align:center;">目前無週期計畫。</div>';
    } else {
    pmList.innerHTML = groupKeys.map(gId => {
        let g = groups[gId];
        return `
            <div class="task-item" style="border-left-color: ${g.color}; flex-direction: column; align-items: flex-start; gap: 10px;">
            <div style="display:flex; justify-content:space-between; width:100%;">
                <span style="font-weight:bold;">${g.name}</span>
                <span style="font-size:0.8rem; color:var(--sub-text);">總進度: ${g.completed}/${g.total}</span>
            </div>
            <div style="display:flex; gap:10px; width:100%;">
                <button class="action-btn" style="flex:1;" onclick="deletePeriodicGroup('${gId}')">刪除整個群組</button>
            </div>
            </div>
        `;
    }).join('');
    }
    
    openModal('tools-modal');
}


function delayAllTasks() {
    if(!confirm("確定要將今天起的所有計畫 (不含考試) 順延一天嗎？")) return;
    const todayStr = formatDate(new Date());
    tasks.forEach(t => {
    if (t.type !== 'exam' && !t.isCompleted && t.dueDate >= todayStr) {
        let d = new Date(t.dueDate);
        d.setDate(d.getDate() + 1);
        t.dueDate = formatDate(d);
    }
    });
    saveAndRefresh();
    alert("計畫已全數順延！好好休息。");
}

function clearSpecificMonth() {
    const monthVal = document.getElementById('clear-month-input').value; 
    if(!monthVal) return alert("請選擇月份");
    if(!confirm(`確定要清除 [ ${monthVal} ] 的所有計畫嗎？(考試將被保留)`)) return;
    
    tasks = tasks.filter(t => {
    if (t.dueDate.startsWith(monthVal) && t.type !== 'exam') return false;
    return true;
    });
    saveAndRefresh();
    alert(`${monthVal} 的計畫已清除！`);
    openToolsModal();
}

function deletePeriodicGroup(groupId) {
    if(!confirm("確定要刪除此週期計畫嗎？(所有與此相關的已排定、未排定任務都會移除)")) return;
    tasks = tasks.filter(t => t.groupId !== groupId);
    saveAndRefresh();
    openToolsModal();
}

function saveAndRefresh() {
    localStorage.setItem(DB_TASKS, JSON.stringify(tasks));
    renderCalendar();
    if (document.getElementById('day-modal').classList.contains('active')) {
        renderTaskList(selectedDateStr);
    }
}

// 切換主題函式
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-theme');
    const isLight = body.classList.contains('light-theme');
    
    localStorage.setItem(DB_THEME, isLight ? 'light' : 'dark');
    updateThemeButtonText();
}

function updateThemeButtonText() {
    const isLight = document.body.classList.contains('light-theme');
    const btn = document.getElementById('theme-btn');
    if (btn) {
    btn.innerText = isLight ? '深色' : '淺色';
    }
}

function exportData() {
    const data = {
        tasks: tasks,
        capacities: capacities,
        recentColors: recentColors,
        vocabBanks_V5: JSON.parse(localStorage.getItem('vocabBanks_V5') || '[]'), // 直接打包整個雙層單字庫
        theme: localStorage.getItem(DB_THEME) || 'dark'
    }; 

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `我的行事曆與單字庫完整備份_${formatDate(new Date())}.json`; 
    a.click(); 
    URL.revokeObjectURL(url); 
}

function importData(event) {
    const file = event.target.files[0]; 
    if (!file) return; 
    
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        try { 
            const data = JSON.parse(e.target.result); 
            if (data.tasks && Array.isArray(data.tasks)) { 
                // 1. 還原行事曆與其他設定
                tasks = data.tasks; 
                if (data.capacities) capacities = data.capacities; 
                if (data.recentColors) recentColors = data.recentColors; 
                
                // 2. 直接還原雙層單字庫 (如果備份檔裡有就直接覆蓋)
                if (data.vocabBanks_V5) {
                    localStorage.setItem('vocabBanks_V5', JSON.stringify(data.vocabBanks_V5));
                }

                // 3. 處理主題顏色 
                if (data.theme) { 
                    localStorage.setItem(DB_THEME, data.theme); 
                    if (data.theme === 'light') document.body.classList.add('light-theme'); 
                    else document.body.classList.remove('light-theme'); 
                    if (typeof updateThemeButtonText === 'function') updateThemeButtonText(); 
                } 
                
                // 4. 儲存並重新渲染所有畫面 
                saveAndRefresh(); 
                renderCapacities(); 
                renderRecentColors(); 
                
                if (typeof renderVocabManager === 'function') {
                    renderVocabManager(); // 如果有單字庫總覽頁面，順便重新渲染
                }

                alert("完整資料（含行事曆與單字庫）還原成功！"); 
                closeModal('tools-modal'); 
            } else { 
                alert("無效的備份檔案格式！"); 
            } 
        } catch (err) { 
            alert("讀取檔案失敗，檔案可能損毀。"); 
        } 
    }; 
    reader.readAsText(file); 
    event.target.value = ''; 
}

const savedTheme = localStorage.getItem(DB_THEME);
if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
}
updateThemeButtonText();

renderCapacities();
renderRecentColors();
renderCalendar();

setTimeout(() => {
    document.getElementById('calendar-scroll').scrollTop = 200; 
}, 100);

// ============================================
// 長按拖曳核心邏輯 (Drag and Drop)
// ============================================
let dragTimer = null;
let isDragging = false;
let dragGhost = null;
let draggedTaskId = null;
let targetDateStr = null;
let startX = 0, startY = 0;

function initDrag(e, taskId) {
    if (e.target.tagName.toLowerCase() === 'button') return;
    
    draggedTaskId = taskId;
    let touch = e.type.includes('touch') ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    let targetEl = e.currentTarget;

    dragTimer = setTimeout(() => {
    isDragging = true;
    if (navigator.vibrate) navigator.vibrate(50);
    
    document.getElementById('day-modal').style.opacity = '0';
    document.getElementById('day-modal').style.pointerEvents = 'none';
    
    dragGhost = targetEl.cloneNode(true);
    dragGhost.className = 'task-item drag-ghost';
    dragGhost.style.width = targetEl.offsetWidth + 'px';
    document.body.appendChild(dragGhost);
    
    moveGhost(startX, startY);

    document.addEventListener('touchmove', handleDragMove, {passive: false});
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('mousemove', handleDragMove, {passive: false});
    document.addEventListener('mouseup', handleDragEnd);
    }, 400);

    document.addEventListener('touchmove', cancelDrag, {once: true});
    document.addEventListener('touchend', cancelDrag, {once: true});
    document.addEventListener('mousemove', cancelDrag, {once: true});
    document.addEventListener('mouseup', cancelDrag, {once: true});
}

function cancelDrag(e) {
    if (e && e.type.includes('move')) {
    let touch = e.type.includes('touch') ? e.touches[0] : e;
    if (Math.abs(touch.clientX - startX) < 10 && Math.abs(touch.clientY - startY) < 10) return;
    }
    clearTimeout(dragTimer);
}

function moveGhost(x, y) {
    if (!dragGhost) return;
    dragGhost.style.left = (x - (dragGhost.offsetWidth / 2)) + 'px';
    dragGhost.style.top = (y - 30) + 'px'; 
}

function handleDragMove(e) {
    if (!isDragging) return;
    e.preventDefault(); 
    let touch = e.type.includes('touch') ? e.touches[0] : e;
    moveGhost(touch.clientX, touch.clientY);

    dragGhost.style.display = 'none'; 
    let elemUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    dragGhost.style.display = 'flex';

    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('drag-over'));
    if (elemUnder) {
    let cell = elemUnder.closest('.day-cell');
    if (cell) {
        cell.classList.add('drag-over');
        targetDateStr = cell.getAttribute('data-date');
    } else {
        targetDateStr = null;
    }
    }
}

function handleDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    
    if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
    }
    dragGhost = null;
    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('drag-over'));
    
    const modal = document.getElementById('day-modal');
    modal.style.opacity = '1';
    modal.style.pointerEvents = '';

    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);

    if (targetDateStr && targetDateStr !== selectedDateStr) {
    let task = tasks.find(t => t.id === draggedTaskId);
    if (task) {
        task.dueDate = targetDateStr;
        saveAndRefresh();
        
        document.getElementById('day-modal').style.pointerEvents = '';
        closeModal('day-modal'); 
    }
    } else {
    document.getElementById('day-modal').style.opacity = '1';
    document.getElementById('day-modal').style.pointerEvents = '';
    }
}

function toggleVocabFontOption() {
    const isChecked = document.getElementById('enable-vocab').checked;
    document.getElementById('font-option-box').style.display = isChecked ? 'flex' : 'none';
}

// 2. 渲染任務列表中按鈕的判定 logic (替換原本 Modal 內的任務渲染)
function renderTaskButtons(task) {
    // 如果開啟了輔助記憶
    if (task.enableVocab) {
        // 第一階段
        if (task.stage === 1) {
        if (!task.vocabState || task.vocabState === 'need_input') {
            return `
                <button class="action-btn" onclick="openVocabInput('${task.id}')">輸入單字</button>
                <button class="action-btn" onclick="deleteTask('${task.id}')">刪除</button>`;
        } else {
            return `
                <button class="action-btn" onclick="startVocabSession('${task.id}')">開始</button>
                <button class="action-btn" onclick="deleteTask('${task.id}')">刪除</button>`;
        }
        } 
        // 第二階段及以後（待複習單字）
        else {
        return `
            <button class="action-btn" onclick="viewVocabWords('${task.id}')">檢視</button>
            <button class="action-btn" onclick="startVocabSession('${task.id}')">開始</button>
            <button class="action-btn" onclick="deleteTask('${task.id}')">刪除</button>
        `;
        }
    }

    if (task.type === 'vocab_review') {
        const completeBtnText = task.isCompleted ? '已完成' : '完成';
        const completeBtnStyle = task.isCompleted ? 'opacity: 0.6;' : '';
        
        return `
        <div style="display:flex; gap:6px; align-items:center;">
            <button class="action-btn" onclick="viewVocabWords('${task.id}')">檢視</button>
            <button class="action-btn" onclick="toggleTaskComplete('${task.id}')" style="${completeBtnStyle}">${completeBtnText}</button>
            <button class="action-btn" onclick="deleteTask('${task.id}')" style="color:#ff3b30; border-color:rgba(255,59,48,0.3);">刪除</button>
        </div>
        `;
    }
  
    // 原本的任務按鈕渲染
    return `
        <button class="action-btn" onclick="toggleComplete('${task.id}')">${task.isCompleted ? '已完成' : '完成'}</button>
        <button class="action-btn" onclick="deleteTask('${task.id}')">刪除</button>
        `;
}

function toggleTaskComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.isCompleted = !task.isCompleted;
  saveAndRefresh();

  // 若當前在每日詳細視窗，即時刷新
  if (typeof openDayModal === 'function' && selectedDateStr) {
    openDayModal(selectedDateStr);
  }
}
