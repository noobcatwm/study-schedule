const DB_TASKS = 'calendarTasksV4';
const DB_CAPS = 'calendarCapsV4';
const DB_COLORS = 'recentColorsV4';
const REVIEW_INTERVALS = [0, 1, 4, 11, 25, 55];

let tasks = JSON.parse(localStorage.getItem(DB_TASKS) || '[]');
let capacities = JSON.parse(localStorage.getItem(DB_CAPS) || '[5,5,5,5,5,5,5]');
let recentColors = JSON.parse(localStorage.getItem(DB_COLORS) || '["#0a84ff", "#ff9f0a", "#bf5af2"]');
let selectedDateStr = "";

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
let activeVocabSession = { words: [], unlearned: [], currentIndex: 0, fontType: 'default', taskId: null };
let currentManagingGroupId = null; // 進階設定目前管理的單字組

// 1. 在任務資料結構中，新增欄位：
// task.isVocab = true/false
// task.vocabFont = 'default' | 'jp'
// task.words = ['apple', 'banana']  (單字總庫)
// task.unlearnedWords = ['apple']   (待複習單字)
// task.vocabState = 'need_input' | 'ready' | 'reviewing'

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

    if (task.isVocabReviewTask || task.type === 'vocab_review') {
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

// 點擊 [檢視] 按鈕時呼叫
function viewVocabWords(taskId) {
  const task = tasks.find(t => t.id === taskId);
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

// 3. 打開「輸入單字」視窗
function openVocabInput(taskId) {
  currentWorkingTask = tasks.find(t => t.id === taskId);
  document.getElementById('vocab-input-text').value = (currentWorkingTask.words || []).join('\n');
  openModal('vocab-input-modal');
}

// 4. 儲存輸入的單字
function saveVocabInput() {
  const text = document.getElementById('vocab-input-text').value;
  const list = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  
  if (currentWorkingTask) {
    currentWorkingTask.words = list;
    currentWorkingTask.unlearnedWords = [...list]; // 初次預設全為待複習
    currentWorkingTask.vocabState = 'ready'; // 狀態轉為可開始
    saveAndRefresh();
  }
  closeModal('vocab-input-modal');
  // 重新打開當天詳細視窗以刷新按鈕狀態
  openDayModal(selectedDateStr);
  console.log(tasks.filter(t => t.isVocab));
}

// 5. 開始「刷單字」（熟 / 不熟 UI）
function startVocabSession(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // 🌟 判定測驗清單：如果本身是待複習卡片，只載入不熟單字(unlearnedWords)；否則載入全部單字(words)
  let targetWords = [];
  if (task.isVocabReviewTask || task.type === 'vocab_review') {
    targetWords = task.unlearnedWords && task.unlearnedWords.length > 0 ? task.unlearnedWords : task.words;
  } else {
    targetWords = task.words || [];
  }

  if (!targetWords || targetWords.length === 0) {
    alert('目前沒有需要測驗的單字！');
    return;
  }

  activeVocabSession = {
    taskId: taskId,
    words: [...targetWords], // 載入對應範圍的單字
    currentIndex: 0,
    unlearnedNext: []
  };

  showNextWord();
  openModal('vocab-flashcard-modal');
}

function showNextWord() {
  const session = activeVocabSession;
  if (session.currentIndex >= session.words.length) {
    // 全部刷完！
    finishVocabSession();
    return;
  }

  const word = session.words[session.currentIndex];
  const displayEl = document.getElementById('flashcard-word-display');
  displayEl.innerText = word;
  
  // 切換日文/預設字體
  if (session.fontType === 'jp') {
    displayEl.classList.add('font-jp');
  } else {
    displayEl.classList.remove('font-jp');
  }

  document.getElementById('vocab-progress').innerText = `${session.currentIndex + 1} / ${session.words.length}`;
}

// 按下「熟」或「不熟」
function answerVocab(isKnown) {
  const session = activeVocabSession;
  const currentWord = session.words[session.currentIndex];

  if (!isKnown) {
    session.unlearnedNext.push(currentWord); // 標記為不熟，下次繼續複習
  }

  session.currentIndex++;
  showNextWord();
}

// 刷完單字結算：當場 push 一個全新的「待複習單字」 Task 到任務陣列中
function finishVocabSession() {
  closeModal('vocab-flashcard-modal');
  const currentTask = tasks.find(t => t.id === activeVocabSession.taskId);
  
  if (currentTask) {
    currentTask.unlearnedWords = activeVocabSession.unlearnedNext;
    currentTask.isCompleted = true; // 原任務標記完成

    // 🌟 如果當前已經是「待複習單字」任務，做完直接結束，不重複生成
    if (currentTask.isVocabReviewTask || currentTask.type === 'vocab_review') {
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
        
        isVocab: true,
        isVocabReviewTask: true,
        // 🌟 核心：待複習任務的 words 裡面「只有不熟的單字」
        words: [...activeVocabSession.unlearnedNext],
        unlearnedWords: [...activeVocabSession.unlearnedNext],
        vocabFont: currentTask.vocabFont || 'default',
        vocabState: 'ready',
        
        weight: 0,
        color: currentTask.color || '#4a90e2',
        isCompleted: false
      };

      tasks.push(newReviewTask);
    }

    // 順便把單字更新給下一個複習階段的任務（保持資料同步）
    const nextStage = (currentTask.stage || 1) + 1;
    const nextTask = tasks.find(t => 
      (t.groupName === currentTask.groupName || t.title === currentTask.title) && t.stage === nextStage
    );
    if (nextTask) {
      nextTask.isVocab = true;
      nextTask.words = [...(currentTask.words || [])];
      nextTask.unlearnedWords = [...activeVocabSession.unlearnedNext];
      nextTask.vocabFont = currentTask.vocabFont || 'default';
      nextTask.vocabState = 'ready';
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
  const vocabTasks = tasks.filter(t => (t.isVocab || t.enableVocab) && !t.isVocabReviewTask && t.type !== 'vocab_review' && t.words && t.words.length > 0);

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

  tasks.forEach(t => {
    if (t.title === groupTitle) {
      t.words = [];
      t.unlearnedWords = [];
      t.vocabState = 'need_input';
    }
  });

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
  const unitTasks = tasks.filter(t => { const taskGroup = t.groupName || t.title.replace(/\s+\d+$/, ''); return taskGroup === mainTitle && (t.isVocab || t.enableVocab) && !t.isVocabReviewTask && t.type !== 'vocab_review'; });

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
function openVocabGroupDetail(taskId) {
  closeModal('vocab-units-modal'); // 關閉第二層
  currentManagingGroupId = taskId;
  
  const task = tasks.find(t => t.id === taskId);
  document.getElementById('vocab-detail-title').innerText = task.unitName || task.title;
  document.getElementById('vocab-font-select').value = task.vocabFont || 'default';

  renderVocabWordsList();
  openModal('vocab-detail-modal');
}

function openVocabManagerFromTools() {
  closeModal('tools-modal'); // 先關閉進階設定視窗
  openVocabManager();           // 再開啟單字庫管理視窗
}

// 開啟單字庫內部清單
function openVocabGroupDetail(taskId) {
  currentManagingGroupId = taskId;
  const task = tasks.find(t => t.id === taskId);
  
  document.getElementById('vocab-detail-title').innerText = task.title;
  document.getElementById('vocab-font-select').value = task.vocabFont || 'default';

  renderVocabWordsList();
  openModal('vocab-detail-modal');
}

function renderVocabWordsList() {
  const task = tasks.find(t => t.id === currentManagingGroupId);
  const container = document.getElementById('vocab-words-list');
  container.innerHTML = '';

  const isJp = task.vocabFont === 'jp';

  (task.words || []).forEach((word, index) => {
    const row = document.createElement('div');
    row.className = 'vocab-item-row';
    row.innerHTML = `
      <span class="${isJp ? 'font-jp' : ''}">${word}</span>
      <button onclick="deleteSingleVocab(${index})" style="color:#ff3b30; border:none; background:none;">刪除</button>
    `;
    container.appendChild(row);
  });
}

// 新增單個單字
function addSingleVocab() {
  const input = document.getElementById('new-single-vocab');
  const val = input.value.trim();
  if (!val) return;

  const task = tasks.find(t => t.id === currentManagingGroupId);
  if (task) {
    // 同步更新所有同標題任務的單字庫
    tasks.filter(t => t.title === task.title).forEach(t => {
      if (!t.words) t.words = [];
      t.words.push(val);
      if (!t.unlearnedWords) t.unlearnedWords = [];
      t.unlearnedWords.push(val);
    });
    saveAndRefresh();
    renderVocabWordsList();
    input.value = '';
  }
}

// 刪除單個單字
function deleteSingleVocab(index) {
  const task = tasks.find(t => t.id === currentManagingGroupId);
  if (task) {
    tasks.filter(t => t.title === task.title).forEach(t => {
      t.words.splice(index, 1);
    });
    saveAndRefresh();
    renderVocabWordsList();
  }
}

// 修改該單字庫字體
function changeVocabGroupFont() {
  const font = document.getElementById('vocab-font-select').value;
  const task = tasks.find(t => t.id === currentManagingGroupId);
  if (task) {
    tasks.filter(t => t.title === task.title).forEach(t => {
      t.vocabFont = font;
    });
    saveAndRefresh();
    renderVocabWordsList();
  }
}