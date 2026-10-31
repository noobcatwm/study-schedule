const APP_VERSION = "v1.1.3a";

const modalContent = document.querySelector('#tools-modal .modal-content');
if (modalContent) {
  modalContent.insertAdjacentHTML('beforeend', `
    <div style="text-align: center; margin-top: 20px; font-size: 0.8rem; opacity: 0.5;">
      ${APP_VERSION}
    </div>
  `);
}

const DB_TASKS = 'calendarTasksV4';
const DB_CAPS = 'calendarCapsV4';
const DB_COLORS = 'recentColorsV4';
const REVIEW_INTERVALS = [0, 1, 4, 11, 25, 55];

let tasks = JSON.parse(localStorage.getItem(DB_TASKS) || '[]');
let capacities = JSON.parse(localStorage.getItem(DB_CAPS) || '[5,5,5,5,5,5,5]');
let recentColors = JSON.parse(localStorage.getItem(DB_COLORS) || '["#0a84ff", "#ff9f0a", "#bf5af2"]');
let selectedDateStr = "";

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
        
        for (let u = startUnit; u < startUnit + units; u++) {
            let unitTitle = `${title} ${u}`;
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
                
                newTasks.push({
                    id: Date.now().toString() + Math.random().toString(),
                    groupId: groupId, groupName: title, type: 'periodic', 
                    title: unitTitle, stage: stageIndex + 1, enableVocab: enableVocab, isVocab: enableVocab && stageIndex==0,
                    vocabFont: document.getElementById('vocab-font-type')?.value || 'default',
                    dueDate: scheduledReviewDateStr, weight: weight, color: color, isCompleted: false
                });
                
                lastScheduledDateObj = scheduledDateObj;
                lastIntervalDays = intervalDays;
            });
        }
        
        let twelveMonthsLater = new Date();
        twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);
        if (maxDate > twelveMonthsLater) {
            if (!confirm(`警告：因為負荷量考量，此系列排程最晚將跨越到 ${formatDate(maxDate)}，超過一年！確定要繼續嗎？`)) {
                return;
            }
        }
        
        tasks = tasks.concat(newTasks);
        alert(`成功排入 ${units} 個單元！`);
    }

    closeModal('add-modal');
    saveAndRefresh();
    openDayModal(selectedDateStr);
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

const DB_THEME = 'calendarThemeV4';

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
    theme: localStorage.getItem(DB_THEME) || 'dark'
    };
    // 將資料轉成 JSON 文字並製作成 Blob 檔案
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `我的行事曆備份_${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// === 資料匯入 (還原) ===
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
    try {
        const data = JSON.parse(e.target.result);
        if (data.tasks && Array.isArray(data.tasks)) {
        // 覆蓋目前資料
        tasks = data.tasks;
        if (data.capacities) capacities = data.capacities;
        if (data.recentColors) recentColors = data.recentColors;
        
        // 處理主題顏色
        if (data.theme) {
            localStorage.setItem(DB_THEME, data.theme);
            if (data.theme === 'light') document.body.classList.add('light-theme');
            else document.body.classList.remove('light-theme');
            if (typeof updateThemeButtonText === 'function') updateThemeButtonText();
        }
        
        // 儲存並重新渲染畫面
        saveAndRefresh();
        renderCapacities();
        renderRecentColors();
        alert("資料還原成功！");
        closeModal('tools-modal');
        } else {
        alert("無效的備份檔案格式！");
        }
    } catch (err) {
        alert("讀取檔案失敗，檔案可能損毀。");
    }
    };
    reader.readAsText(file);
    event.target.value = ''; // 清空選擇，允許重複匯入同一個檔案
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

let currentWorkingTask = null; // 當前操作的任務
let activeVocabSession = { words: [], unlearnedNext: [], currentIndex: 0, fontType: 'default', taskId: null };
let currentManagingGroupId = null; // 進階設定目前管理的單字組

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

function getStage1TaskByTitle(task) {
  if (!task) return null;
  if (task.stage === 1) return task;
  
  const stage1 = tasks.find(t => t.title === task.title && t.stage === 1);
  return stage1 || task;
}


// 點擊 [檢視] 按鈕時呼叫
function viewVocabWords(taskId) {
  const task = getStage1TaskByTitle(tasks.find(t => t.id === taskId));
  if (!task) return;

  // 借用單字詳情 modal 來顯示
  if (typeof openVocabGroupDetail === 'function') {
    openVocabGroupDetail(taskId);
  } else {
    // 備用做法：直接開啟 modal
    currentManagingGroupId = taskId;
    const modalTitle = document.getElementById('vocab-detail-title');
    if (modalTitle) modalTitle.innerText = task.title;
    
    if (typeof renderVocabWordsList === 'function') renderVocabWordsList();
    if (typeof openModal === 'function') openModal('vocab-detail-modal');
  }
}

function addVocabRow(word = '', meaning = '', reading = '', extra = '') {
  const container = document.getElementById('vocab-rows-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'vocab-row';
  row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 6px;';

  row.innerHTML = `
    <input type="text" class="input-word" placeholder="單字" value="${word}" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
    <input type="text" class="input-meaning" placeholder="意思" value="${meaning}" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
    <input type="text" class="input-reading" placeholder="讀音" value="${reading}" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
    <button type="button" onclick="this.parentElement.remove()" style="width: 38px; height: 38px; background: #ff4d4f; color: white; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0;">✕</button>
  `;
  container.appendChild(row);
}

// 3. 打開「輸入單字」視窗
function openVocabInput(taskId) {
  const currentTask = tasks.find(t => t.id === taskId);
  if (!currentTask) return;

  // 🌟 1. 嚴格遵守 v1.1.2 架構：透過 title 找到該單元真正的「第一階段 (Stage 1)」來讀取單字
  const stage1Task = tasks.find(t => t.title === currentTask.title && t.stage === 1);
  const targetTask = stage1Task || currentTask; // 如果找不到 stage 1 就退回用自己

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

    const wordsData = targetTask.words || [];

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
      newWords.push({
        word: word,
        meaning: meaning,
        reading: reading,
        extra: extra
      });
    }
  });

  // 2. 寫回資料並遵守 v1.1.2 架構
  if (currentWorkingTask) {
    const targetTitle = currentWorkingTask.title;

    // 找出同標題的所有任務，只有 stage 1 存入完整單字，其他階段清空
    tasks.forEach(t => {
      if (t.title === targetTitle) {
        if (t.stage === 1) {
          t.words = [...newWords];
          t.unlearnedWords = [...newWords]; // 初次預設全為待複習
          t.vocabState = 'ready'; // 狀態轉為可開始
        } else {
          t.words = [];
          t.unlearnedWords = [];
        }
      }
    });

    saveAndRefresh();
  }

  closeModal('vocab-input-modal');
  
  // 重新打開當天詳細視窗以刷新按鈕狀態
  if (typeof selectedDateStr !== 'undefined' && selectedDateStr) {
    openDayModal(selectedDateStr);
  }
}
// 5. 開始「刷單字」（熟 / 不熟 UI）
function startVocabSession(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // 🌟 嚴格遵守 v1.1.2：從第一階段拿單字
  const stage1Task = getStage1TaskByTitle(task);
  const wordsList = stage1Task.words || [];

  if (wordsList.length === 0) {
    console.log(stage1Task);
    alert('這個單元還沒有單字喔！請先輸入單字。');
    return;
  }

  // 初始化複習階段物件，確保 unlearnedWords 絕對有值
  activeVocabSession = {
    taskId: task.id,
    words: wordsList,
    unlearnedWords: [...wordsList],
    unlearnedNext: [],
    currentIndex: 0,
    fontType: stage1Task.vocabFont || 'default'
  };

  // 打開背單字卡片 Modal (請依你專案中實際的 modal id 調整)
  openModal('vocab-flashcard-modal'); 
  showNextWord();
}

function getCustomFontClass(fontType) {
  if (fontType === 'jp' || fontType === 'japanese') {
    return 'font-jp'; // 🌟 對應你 CSS 裡原本就有的 .font-jp
  }
  return 'font-jp';
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

  // 🛡️ 防呆：如果 unlearnedWords 未定義，自動用 words 補上
  if (!session.unlearnedWords) {
    session.unlearnedWords = session.words || [];
  }

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

  const fontType = session.fontType || 'jp';
  const customFontClass = getCustomFontClass(fontType);

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
    meaningEl.innerHTML = parseMixedFontText(meaningText, fontType);
  }

  // 3. 背面讀音/補充
  if (readingEl) {
    readingEl.className = 'font-serif-main';
    const formattedReading = readingText ? `讀音/補充: ${readingText}` : '';
    readingEl.innerHTML = parseMixedFontText(formattedReading, fontType);
  }
  
  // 容器字體切換
  const cardContainer = document.getElementById('main-flashcard');
  if (cardContainer) {
    if (fontType === 'jp' || fontType === 'japanese') {
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
  console.log("📍 當前 activeVocabSession:", activeVocabSession);
  console.log("📍 當前 taskId:", activeVocabSession ? activeVocabSession.taskId : "無");

  closeModal('vocab-flashcard-modal');
  
  if (!activeVocabSession || !activeVocabSession.taskId) {
    console.error("❌ 錯誤：session 裡面沒有 taskId，所以無法更新任務狀態！");
    return;
  }

  const currentTask = tasks.find(t => t.id === activeVocabSession.taskId);
  console.log("📍 找到的對應任務:", currentTask);

  if (currentTask) {
    currentTask.unlearnedWords = activeVocabSession.unlearnedNext;
    currentTask.isCompleted = true; // 原任務標記完成
    console.log("✅ 已將任務設定為完成：", currentTask.title);

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
        
        isVocab: true,
        // 🌟 核心：待複習任務的 words 裡面「只有不熟的單字」
        words: [...activeVocabSession.unlearnedNext],
        unlearnedWords: [...activeVocabSession.unlearnedNext],
        
        // 🌟 確保字體設定正確繼承（兼容 vocabFont 或 fontType）
        fontType: currentTask.fontType || currentTask.vocabFont || 'jp',
        vocabFont: currentTask.vocabFont || currentTask.fontType || 'jp',
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

let currentSelectedGroupTitle = ''; // 目前選取的主題名稱

// -------------------------------------------------------------
// 【第一層】：顯示所有主題單字庫 (如：英文進階單字)
// -------------------------------------------------------------
function openVocabManager() {
  const listContainer = document.getElementById('vocab-group-list');
  listContainer.innerHTML = '';

  // 篩選出所有含有單字的單字任務
  const vocabTasks = tasks.filter(t => (t.isVocab || t.enableVocab) && t.type !== 'vocab_review' && t.words && t.words.length > 0 && t.stage == 1);

  if (vocabTasks.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">目前沒有任何單字庫</p>';
  } else {
    // 🌟 關鍵修正：以 groupName (例如 "英文單字") 或原始 title 進行主題歸類
    const uniqueGroups = {};
    vocabTasks.forEach(t => {
      const mainTitle = t.groupName;
      if (!uniqueGroups[mainTitle]) {
        uniqueGroups[mainTitle] = {
          mainTitle: mainTitle,
          sampleTask: t
        };
      }
    });

    Object.values(uniqueGroups).forEach(group => {
      const row = document.createElement('div');
      row.className = 'vocab-item-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);';
      
      row.innerHTML = `
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
          <strong>${group.mainTitle}</strong>
        </div>
        <!-- 右側：[檢視] 與 [刪除] -->
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="action-btn" onclick="openVocabUnitsModal('${group.mainTitle}')">檢視</button>
          <button class="action-btn" onclick="deleteVocabGroupTitle('${group.mainTitle}')" style="color: #ff3b30; border-color: rgba(255, 59, 48, 0.3);">刪除</button>
        </div>
      `;
      listContainer.appendChild(row);
    });
  }

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
function openVocabUnitsModal(mainTitle) {
  currentSelectedGroupTitle = mainTitle;
  closeModal('vocab-manager-modal');

  document.getElementById('vocab-units-title').innerText = mainTitle;
  const listContainer = document.getElementById('vocab-unit-list');
  listContainer.innerHTML = '';

  // 取得屬於該主題的所有任務，並按 Unit (階段1) 不重複歸類
  const unitTasks = tasks.filter(t => { const taskGroup = t.groupName || t.title.replace(/\s+\d+$/, ''); return taskGroup === mainTitle && (t.isVocab || t.enableVocab) && t.type !== 'vocab_review'; });

  // 只取每個 Unit 的代表任務（例如取 stage === 1 的那筆代表該 Unit）
  const uniqueUnits = {};
  unitTasks.forEach(t => {
    if (!uniqueUnits[t.title]) {
      uniqueUnits[t.title] = t;
    }
  });

  const unitList = Object.values(uniqueUnits);

  if (unitList.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px 0;">此主題下無單元</p>';
  } else {
    unitList.forEach(unit => {
      const wordCount = (unit.words || []).length;

      const row = document.createElement('div');
      row.className = 'vocab-item-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);';

      row.innerHTML = `
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
          <strong>${unit.title}</strong>
          <span style="font-size: 0.85rem; opacity: 0.7; margin-left: 6px;">(${wordCount} 個單字)</span>
        </div>
        <!-- 右側：[檢視/編輯] 與 [刪除] -->
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="action-btn" onclick="openVocabGroupDetail('${unit.id}')">檢視/編輯</button>
          <button class="action-btn" onclick="deleteSingleUnit('${unit.title}')" style="color: #ff3b30; border-color: rgba(255, 59, 48, 0.3);">刪除</button>
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
// 打開詳細單字編輯視窗 (對應 v1.1.2：自動抓取 Stage 1)
function openVocabDetail(taskId) {
  const currentTask = tasks.find(t => t.id === taskId);
  if (!currentTask) return;

  // 🌟 嚴格遵守 v1.1.2：透過 title 找到該單元的第一階段任務
  const stage1Task = tasks.find(t => t.title === currentTask.title && t.stage === 1);
  const targetTask = stage1Task || currentTask;

  // 暫存目前正在編輯的目標任務
  currentWorkingTask = targetTask;

  // 設定標題與字體選單
  document.getElementById('vocab-detail-title').innerText = `編輯單字：${targetTask.title}`;
  const fontSelect = document.getElementById('vocab-font-select');
  if (fontSelect) {
    fontSelect.value = targetTask.vocabFont || 'default';
  }

  // 渲染動態表格列
  const container = document.getElementById('vocab-rows-container');
  if (container) {
    container.innerHTML = '';
    const wordsData = targetTask.words || [];

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

// 儲存詳細編輯視窗內的變更（嚴格遵守 Stage 1 集中儲存、其他階段清空）
function saveVocabDetailModal() {
  if (!currentWorkingTask) {
    console.error("❌ 存檔失敗：currentWorkingTask 未定義！");
    alert("找不到當前編輯的任務，請重新點擊編輯。");
    return;
  }
  
  const targetTitle = currentWorkingTask.title;

  // 🌟 兼容新舊容器 ID，確保兩邊都能抓到
  let container = document.querySelector('#vocab-rows-container');
  if (!container) {
    container = document.querySelector('#vocab-input-rows-container');
  }

  if (!container) {
    console.error("❌ 存檔失敗：找不到任何單字列容器（#vocab-rows-container 或 #vocab-input-rows-container）！");
    return;
  }

  const rows = container.querySelectorAll('.vocab-row');
  console.log(`🔍 找到 ${rows.length} 行單字準備存檔...`);

  const newWords = [];

  rows.forEach((row, index) => {
    const word = row.querySelector('.input-word')?.value.trim() || '';
    const meaning = row.querySelector('.input-meaning')?.value.trim() || '';
    const reading = row.querySelector('.input-reading')?.value.trim() || '';

    if (word || meaning || reading) {
      newWords.push({ word, meaning, reading });
    }
  });

  console.log("📦 成功打包的單字資料：", newWords);

  // 同步更新所有同 title 任務：stage 1 存單字，其他 stage 清空
  let updatedCount = 0;
  tasks.forEach(t => {
    if (t.title === targetTitle) {
      if (t.stage === 1) {
        t.words = [...newWords];
        t.unlearnedWords = [...newWords];
        t.vocabState = 'ready';
      } else {
        t.words = [];
        t.unlearnedWords = [];
      }
      updatedCount++;
    }
  });

  console.log(`✅ 已同步更新 ${updatedCount} 個相關任務`);

  saveAndRefresh();
  closeModal('vocab-detail-modal');
  closeModal('vocab-input-modal'); // 順便把舊的也關起來（如果有開的話）
}

function openVocabGroupDetail(taskId) {
  closeModal('vocab-units-modal'); // 關閉第二層
  currentManagingGroupId = taskId;
  
  // 1. 尋找點擊的任務
  const currentTask = tasks.find(t => t.id === taskId);
  if (!currentTask) {
    console.error("❌ 找不到對應的任務 ID:", taskId);
    return;
  }
  
  // 2. 強制鎖定該標題的 Stage 1
  let stage1Task = tasks.find(t => t.title === currentTask.title && t.stage === 1);
  
  // 如果找不到 Stage 1，乾脆直接把當前任務當作 Stage 1 來救
  if (!stage1Task) {
    console.warn("⚠️ 找不到 Stage 1，強制將當前任務視為本體");
    stage1Task = currentTask;
  }

  currentWorkingTask = stage1Task; 

  // 3. 設定標題與字體
  const titleEl = document.getElementById('vocab-detail-title');
  if (titleEl) {
    titleEl.innerText = stage1Task.unitName || stage1Task.title || '單字列表';
  }

  const fontSelect = document.getElementById('vocab-font-select');
  if (fontSelect) {
    fontSelect.value = stage1Task.vocabFont || 'default';
  }

  // 4. 渲染多欄位動態表格
  const container = document.getElementById('vocab-rows-container') || document.getElementById('vocab-words-list');
  if (container) {
    container.innerHTML = '';
    
    // 確保 words 存在
    if (!stage1Task.words) {
      stage1Task.words = [];
    }

    const wordsData = stage1Task.words;

    if (wordsData.length > 0) {
      wordsData.forEach(item => {
        if (typeof item === 'string') {
          addVocabRow(item, '', '');
        } else {
          addVocabRow(item.word || '', item.meaning || '', item.reading || '');
        }
      });
    } else {
      console.warn("⚠️ 這裡的 words 陣列是空的！自動幫你生成一行預設空白列");
      // 🌟 貼心小幫手：如果真的沒單字，直接給一行範例，讓你確認畫面會不會動
      addVocabRow("測試單字", "意思", "讀音");
    }
  } else {
    console.error("❌ 找不到畫面上的容器 (#vocab-rows-container 或 #vocab-words-list)！");
  }

  openModal('vocab-detail-modal');
}

function openVocabManagerFromTools() {
  closeModal('tools-modal'); // 先關閉進階設定視窗
  openVocabManager();           // 再開啟單字庫管理視窗
}

// 開啟單字庫內部清單
function openVocabGroupDetail(taskId) {
  closeModal('vocab-units-modal'); // 關閉第二層
  currentManagingGroupId = taskId;
  
  const currentTask = tasks.find(t => t.id === taskId);
  if (!currentTask) return;
  
  // 🌟 嚴格遵守 v1.1.2：透過 title 抓取第一階段 (Stage 1) 的資料
  const stage1Task = getStage1TaskByTitle(currentTask) || currentTask;
  currentWorkingTask = stage1Task; 

  const titleEl = document.getElementById('vocab-detail-title');
  if (titleEl) {
    titleEl.innerText = stage1Task.unitName || stage1Task.title || '單字列表';
  }

  const fontSelect = document.getElementById('vocab-font-select');
  if (fontSelect) {
    fontSelect.value = stage1Task.vocabFont || 'default';
  }

  // 🌟 同樣使用雙保險容器 ID
const container = document.getElementById('vocab-rows-container') || document.getElementById('vocab-words-list');
  if (container) {
    container.innerHTML = '';
    const rawWords = stage1Task.words || [];

    if (rawWords.length > 0) {
      // 🌟 嚴格保持原結構：統一升級為新版物件格式並寫回 stage1Task.words
      stage1Task.words = rawWords.map(item => {
        if (typeof item === 'object' && item !== null) {
          return {
            word: item.word || '',
            meaning: item.meaning || '',
            reading: item.reading || ''
          };
        } else {
          return {
            word: String(item),
            meaning: '',
            reading: ''
          };
        }
      });

      // 渲染畫面
      stage1Task.words.forEach(item => {
        addVocabRow(item.word, item.meaning, item.reading);
      });
    } else {
      stage1Task.words = [];
      addVocabRow(); // 沒單字就給一行空白
    }
  }

  openModal('vocab-detail-modal');
}

// 新增單個單字
function addSingleVocab() {
  const input = document.getElementById('new-single-vocab');
  const val = input.value.trim();
  if (!val) return;

  const task = getStage1TaskByTitle(tasks.find(t => t.id === currentManagingGroupId));
  if (task) {
    task.words.push(val);
    task.push.unlearnedWords.push(val);
    saveAndRefresh();
    renderVocabWordsList();
    input.value = '';
  }
}

// 刪除單個單字
function deleteSingleVocab(index) {
  const task = getStage1TaskByTitle(tasks.find(t => t.id === currentManagingGroupId));
  if (task) {
    task.words.splice(index, 1);
    saveAndRefresh();
    renderVocabWordsList();
  }
}

// 修改該單字庫字體
function changeVocabGroupFont() {
  const font = document.getElementById('vocab-font-select').value;
  const task = getStage1TaskByTitle(tasks.find(t => t.id === currentManagingGroupId));
  if (task) {
    task.vocabFont=font;
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

function parseMixedFontText(rawText, fontType) {
  if (!rawText) return '';

  // 1. 基本的 HTML 轉義，確保安全
  let escaped = escapeHtml(rawText);

  // 2. 取得該計畫對應的自定義字體 Class
  const fontClassName = getCustomFontClass(fontType);

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

(function autoLogAllFunctions() {
  // 排除掉不需要記錄的內建屬性或特殊變數
  const excludeList = [
    'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 
    'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'setTimeout', 
    'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'alert', 'confirm', 'prompt', 'formatDate'
  ];

  // 掃描 window 底下的所有屬性
  for (let key in window) {
    if (excludeList.includes(key)) continue;

    try {
      // 如果它是一個函數
      if (typeof window[key] === 'function') {
        const originalFunc = window[key];

        // 重新覆寫該函數
        window[key] = function(...args) {
          console.log(`🟢 [Function Executed]: %c${key}`, 'color: #00ffcc; font-weight: bold;', args);
          // 執行原本的函數並回傳結果
          return originalFunc.apply(this, args);
        };
      }
    } catch (e) {
      // 略過某些無法存取的瀏覽器唯讀屬性
    }
  }
  console.log("🛠️ 【全域函數自動追蹤器】已啟動！接下來點任何按鈕都會自動印出函數名稱。");
})();
