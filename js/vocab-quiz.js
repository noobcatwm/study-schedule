// ==========================================
// vocab-quiz.js：單字庫「選擇題」模式
//
// 出題規則
//   - 每個單字的每一個意思，各出兩種題：
//       w2m：題目卡顯示「單字」，三個選項是意思（每個選項只放一個意思，不是複選）
//       m2w：題目卡顯示「一個意思」，三個選項是單字
//     所以題目數量 = 單字數 x 意思數 x 2（一個單字至少兩題），順序完全隨機。
//     沒有填意思的單字無法出題，會被略過。
//   - 干擾選項取自同一個單字庫（主題）底下的所有單字；
//     選項不足三個時留空（空位在右側），正確答案的位置仍然隨機。
//   - 答錯：該單字加入待複習單字，同一題會再插回題目序列
//     （位置在目前題目之後第 5 題到最後一題之後，隨機）。
//   - 作答後：選對的選項變綠；選錯的變紅，同時把正確選項標成綠色。
//     題目卡（不可翻面）漸變成一般單字卡（預設停在正面，也就是單字），再按「下一題」。
// ==========================================

let activeQuizSession = null;

const QUIZ_FLASHCARD_IDS = {
    word: 'quiz-word-text',
    meaning: 'quiz-meaning-text',
    reading: 'quiz-reading-text',
    card: 'quiz-flashcard'
};

const QUIZ_OPTION_COUNT = 3;      // 選項數（左、中、右）
const QUIZ_RETRY_MIN_GAP = 5;     // 答錯的題目最早出現在目前題目之後的第幾題

// ------------------------------------------
// 小工具
// ------------------------------------------
function shuffleArray(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 比對用：去頭尾空白、全形半形統一、英文不分大小寫
function quizNorm(text) {
    return String(text ?? '').normalize('NFKC').trim().toLowerCase();
}

function uniqueByNorm(list) {
    const seen = new Set();
    return list.filter(t => {
        const k = quizNorm(t);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// ------------------------------------------
// 題目與選項
// ------------------------------------------

// 干擾選項的來源：同一個單字庫（主題）底下所有單元的單字；找不到主題時只用題目本身的單字
function getQuizPool(task, entries) {
    const group = findGroupByUnitId(task.vocabBankId);
    let pool = [];
    if (group) {
        (group.units || []).forEach(unit => {
            pool = pool.concat(ensureUpgradedWords(unit.words || []));
        });
    } else {
        pool = entries.slice();
    }
    return pool.filter(e => e.word);
}

// 題目序列：每個單字的每個意思，各出 w2m、m2w 兩題，然後完全打亂
function buildQuizQueue(entries) {
    const queue = [];
    entries.forEach(entry => {
        if (!entry.word) return;
        uniqueByNorm(entry.meanings).forEach(meaning => {
            queue.push({ type: 'w2m', entry: entry, meaning: meaning });
            queue.push({ type: 'm2w', entry: entry, meaning: meaning });
        });
    });
    return shuffleArray(queue);
}

// 單字考意思：干擾選項是「別的單字」的單一個意思。
// 排除這個單字自己的任何意思（否則會有兩個正確答案）。
function pickMeaningDistractors(q, pool, need) {
    const ownMeanings = new Set(q.entry.meanings.map(quizNorm));
    const ownWord = quizNorm(q.entry.word);

    const lists = [];
    pool.forEach(e => {
        if (quizNorm(e.word) === ownWord) return;
        const usable = uniqueByNorm(e.meanings).filter(m => !ownMeanings.has(quizNorm(m)));
        if (usable.length > 0) lists.push(shuffleArray(usable));
    });
    shuffleArray(lists);

    const chosen = [];
    const seen = new Set(ownMeanings);
    const take = (m) => { chosen.push(m); seen.add(quizNorm(m)); };

    // 第一輪：每個單字最多取一個意思，讓干擾選項來源多樣
    for (const list of lists) {
        if (chosen.length >= need) break;
        const m = list.find(x => !seen.has(quizNorm(x)));
        if (m !== undefined) take(m);
    }
    // 第二輪：還不夠就從剩下的意思補
    for (const list of lists) {
        for (const m of list) {
            if (chosen.length >= need) break;
            if (!seen.has(quizNorm(m))) take(m);
        }
    }
    return chosen;
}

// 意思考單字：干擾選項是「別的單字」。
// 排除同樣也有這個意思的單字（近義詞），避免出現兩個正確答案。
function pickWordDistractors(q, pool, need) {
    const shown = quizNorm(q.meaning);
    const seen = new Set([quizNorm(q.entry.word)]);
    const chosen = [];

    shuffleArray(pool).forEach(e => {
        if (chosen.length >= need) return;
        const w = quizNorm(e.word);
        if (!w || seen.has(w)) return;
        if (e.meanings.some(m => quizNorm(m) === shown)) return;
        seen.add(w);
        chosen.push(e.word);
    });
    return chosen;
}

// 回傳已隨機排序的選項陣列（1 到 3 個）：[{ text, correct }]
function buildQuizOptions(q, pool) {
    const need = QUIZ_OPTION_COUNT - 1;
    const correctText = (q.type === 'w2m') ? q.meaning : q.entry.word;
    const distractors = (q.type === 'w2m')
        ? pickMeaningDistractors(q, pool, need)
        : pickWordDistractors(q, pool, need);

    return shuffleArray([
        { text: correctText, correct: true },
        ...distractors.map(text => ({ text: text, correct: false }))
    ]);
}

// 答錯的題目重新插回序列：位置在目前題目之後的第 5 題到最後一題之後（隨機）；
// 剩下的題目不到 5 題時就放到最後。回傳插入的位置。
function insertQuizRetry(queue, currentIndex, question) {
    const earliest = Math.min(currentIndex + QUIZ_RETRY_MIN_GAP, queue.length);
    const position = earliest + Math.floor(Math.random() * (queue.length - earliest + 1));
    queue.splice(position, 0, question);
    return position;
}

// ------------------------------------------
// 開始 / 結束
// ------------------------------------------
function startQuizSession(task) {
    const entries = ensureUpgradedWords(getWordsForTask(task));
    const queue = buildQuizQueue(entries);

    if (queue.length === 0) {
        alert('這個單字庫目前沒有可以出題的單字（單字需要填寫意思）。\n請先補上意思，或到「進階工具 > 檢視所有單字庫」把學習模式改回單字卡。');
        return;
    }

    const bank = getVocabWordbankForTask(task);
    activeQuizSession = {
        taskId: task.id,
        vocabFont: (bank && bank.vocabFont) || 'default',
        pool: getQuizPool(task, entries),
        queue: queue,
        index: 0,
        wrongWords: [],   // 答錯過的單字（每個單字只記一次）
        current: null
    };

    openModal('vocab-quiz-modal');
    showQuizQuestion();
}

function exitQuizSession() {
    activeQuizSession = null;
    closeModal('vocab-quiz-modal');
}

function finishQuizSession() {
    closeModal('vocab-quiz-modal');
    const session = activeQuizSession;
    activeQuizSession = null;
    if (!session) return;

    completeVocabTask(session.taskId, session.wrongWords, {
        withMiss: `測驗完成！已自動為 ${session.wrongWords.length} 個答錯的單字新增「待複習單字」任務。`,
        allGood: '太棒了！所有題目都答對了，不需要新增待複習單字。'
    });
}

// ------------------------------------------
// 畫面
// ------------------------------------------
function updateQuizProgress() {
    const s = activeQuizSession;
    const el = document.getElementById('quiz-progress');
    if (s && el) el.innerText = `${Math.min(s.index + 1, s.queue.length)} / ${s.queue.length}`;
}

function quizOptionHtml(option, question, vocabFont) {
    if (question.type === 'w2m') {
        return parseMixedFontText(option.text, vocabFont);                         // 意思選項
    }
    return `<span class="${getCustomFontClass(vocabFont)}">${escapeHtml(option.text)}</span>`;  // 單字選項
}

function showQuizQuestion() {
    const s = activeQuizSession;
    if (!s) return;

    if (s.index >= s.queue.length) {
        finishQuizSession();
        return;
    }

    const q = s.queue[s.index];
    const options = buildQuizOptions(q, s.pool);
    s.current = { question: q, options: options, answered: false };

    const body = document.getElementById('quiz-body');
    const stage = document.getElementById('quiz-stage');

    // 換題：瞬間重置畫面，不播放漸變動畫
    body.classList.add('no-anim');
    stage.classList.remove('answered');

    // 題目卡
    const labelEl = document.getElementById('quiz-card-label');
    const textEl = document.getElementById('quiz-card-text');
    if (q.type === 'w2m') {
        labelEl.innerText = '選出正確的意思';
        textEl.className = `flashcard-word ${getCustomFontClass(s.vocabFont)}`;
        textEl.innerText = q.entry.word;
    } else {
        labelEl.innerText = '選出正確的單字';
        textEl.className = 'quiz-card-meaning';
        textEl.innerHTML = parseMixedFontText(q.meaning, s.vocabFont);
    }

    // 選項：不足三個時，右側留空
    document.getElementById('quiz-options').classList.remove('answered');
    for (let i = 0; i < QUIZ_OPTION_COUNT; i++) {
        const btn = document.getElementById(`quiz-opt-${i}`);
        const option = options[i];
        if (option) {
            btn.className = 'quiz-option ' + (q.type === 'w2m' ? 'kind-meaning' : 'kind-word');
            btn.innerHTML = quizOptionHtml(option, q, s.vocabFont);
            btn.disabled = false;
        } else {
            btn.className = 'quiz-option blank';
            btn.innerHTML = '';
            btn.disabled = true;
        }
    }

    // 答題後才會出現的一般單字卡：預設翻在正面（單字）
    renderFlashcardContent(q.entry, s.vocabFont, QUIZ_FLASHCARD_IDS);
    document.getElementById('quiz-flashcard').classList.remove('is-flipped');

    document.getElementById('quiz-next-btn').classList.add('hidden');
    updateQuizProgress();

    void body.offsetWidth;   // 強制 reflow，讓上面的重置立刻生效
    body.classList.remove('no-anim');
}

// 按下選項
function answerQuiz(slot) {
    const s = activeQuizSession;
    if (!s || !s.current || s.current.answered) return;

    const picked = s.current.options[slot];
    if (!picked) return;
    s.current.answered = true;

    const q = s.current.question;
    const correctSlot = s.current.options.findIndex(o => o.correct);

    // 選對：自己變綠。選錯：自己變紅，正確選項變綠。
    document.getElementById(`quiz-opt-${correctSlot}`).classList.add('correct');
    if (!picked.correct) {
        document.getElementById(`quiz-opt-${slot}`).classList.add('wrong');
    }
    document.getElementById('quiz-options').classList.add('answered');

    if (!picked.correct) {
        // 單字加入待複習（每個單字只記一次）
        if (!s.wrongWords.some(w => quizNorm(w.word) === quizNorm(q.entry.word))) {
            s.wrongWords.push(q.entry);
        }
        // 同一題稍後再考一次（題目總數 +1）
        insertQuizRetry(s.queue, s.index, q);
    }

    // 題目卡漸變成一般單字卡
    document.getElementById('quiz-stage').classList.add('answered');

    const isLast = (s.index >= s.queue.length - 1);
    const nextBtn = document.getElementById('quiz-next-btn');
    nextBtn.innerText = isLast ? '完成' : '下一題';
    nextBtn.classList.remove('hidden');
    updateQuizProgress();
}

function nextQuizQuestion() {
    const s = activeQuizSession;
    if (!s || !s.current || !s.current.answered) return;

    s.index++;
    if (s.index >= s.queue.length) {
        finishQuizSession();
        return;
    }
    showQuizQuestion();
}
