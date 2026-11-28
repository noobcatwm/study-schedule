// ==========================================
// vocab-quiz.js：單字庫的「選擇題 / 拼寫 / 混合」模式
//
// 學習模式（每個單字庫一種，在「單字」畫面設定）
//   choice    選擇題
//   spelling  拼寫
//   mixed     混合：拼寫題與選擇題打散在同一個序列裡（出題數量見下方「混合模式」）
//
// 選擇題的出題規則
//   - 每個單字的每一個意思，各出兩種題：
//       w2m：題目卡顯示「單字」，三個選項是意思（每個選項只放一個意思，不是複選）
//       m2w：題目卡顯示「一個意思」，三個選項是單字
//   - 三個選項由上到下排列；干擾選項取自同一個單字庫底下的所有單字，
//     選項不足三個時，最下方留空，正確答案的位置仍然隨機。
//
// 拼寫的出題規則（拼寫內容 spellTarget 由單字庫設定）
//   - word（拼單字，適合英文）：題目卡顯示「一個意思」，輸入單字。
//     一字多義的單字，每個意思各出一題。
//   - reading（拼讀音，適合日文）：題目卡顯示「單字」，輸入讀音。每個單字一題。
//   - 答案比對：忽略前後空白與英文大小寫、全形半形視為相同；
//     拼讀音時平假名與片假名視為相同，讀音可用 / 、 , ; 或換行分隔多個可接受的答案。
//   - 輸入的單字若是「另一個也有同樣意思」的單字（近義詞），同樣算對。
//
// 混合模式（假設有 n 個單字要背，題目順序隨機）
//   - 混合 + 拼單字：n 題拼單字 + n 題選擇題（單字考意思）。
//       一字多義時，每個意思各出一題拼單字 + 一題 w2m（n 以意思數計）。
//   - 混合 + 拼讀音：n 題拼讀音 + n 題選擇題。
//       每個單字一題拼讀音，另外一題選擇題在「單字考意思 (w2m)」與
//       「意思考單字 (m2w)」之間隨機擇一，意思也是隨機抽一個。
//
// 共通規則
//   - 沒有可出題資料的單字會被略過（選擇題與拼單字需要意思，拼讀音需要讀音）。
//   - 題目數量、順序：完全隨機。
//   - 答錯：該單字加入待複習單字，同一題會再插回題目序列
//     （位置在目前題目之後第 5 題到最後一題之後，隨機）。
//   - 作答後：對的變綠、錯的變紅（選擇題會同時把正確選項標成綠色，
//     拼寫會顯示正確答案）。題目卡（不可翻面）漸變成一般單字卡
//     （預設停在正面，也就是單字），再按「下一題」。
// ==========================================

let activeQuizSession = null;

const QUIZ_FLASHCARD_IDS = {
    word: 'quiz-word-text',
    meaning: 'quiz-meaning-text',
    reading: 'quiz-reading-text',
    note: 'quiz-note-text',
    card: 'quiz-flashcard'
};

const QUIZ_OPTION_COUNT = 3;      // 選項數（上、中、下）
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
// 設定與題目
// ------------------------------------------

// 依單字庫的學習模式，決定這次要出哪些題型
function getQuizSettings(task) {
    const group = findGroupByUnitId(task.vocabBankId);
    const mode = getGroupStudyMode(group);
    return {
        mixed: (mode === 'mixed'),
        choice: (mode === 'choice' || mode === 'mixed'),
        spell: (mode === 'spelling' || mode === 'mixed'),
        spellTarget: getGroupSpellTarget(group)
    };
}

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

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// 混合模式的題目序列：拼寫題與選擇題數量相同，完全打亂。
//   拼單字：每個意思各出一題拼單字 + 一題 w2m。單字沒有意思就略過。
//   拼讀音：拼讀音（需要讀音）+ w2m 或 m2w 擇一（需要意思）。
function buildMixedQuizQueue(entries, settings) {
    const queue = [];
    entries.forEach(entry => {
        if (!entry.word) return;
        const meanings = uniqueByNorm(entry.meanings);

        if (settings.spellTarget === 'reading') {
            if (quizNorm(entry.reading) !== '') {
                queue.push({ type: 'spell', target: 'reading', entry: entry, meaning: null });
            }
            if (meanings.length > 0) {
                queue.push({
                    type: Math.random() < 0.5 ? 'w2m' : 'm2w',
                    entry: entry,
                    meaning: pickRandom(meanings)
                });
            }
        } else {
            // 每個意思各出一題拼單字 + 一題 w2m
            meanings.forEach(meaning => {
                queue.push({ type: 'spell', target: 'word', entry: entry, meaning: meaning });
                queue.push({ type: 'w2m', entry: entry, meaning: meaning });
            });
        }
    });
    return shuffleArray(queue);
}

// 題目序列，完全打亂。沒有指定 settings 時只出選擇題。
//   選擇題：每個意思各出 w2m、m2w 兩題
//   拼單字：每個意思出一題
//   拼讀音：每個有讀音的單字出一題
//   混合：見 buildMixedQuizQueue
function buildQuizQueue(entries, settings = { choice: true, spell: false, spellTarget: 'word' }) {
    if (settings.mixed) return buildMixedQuizQueue(entries, settings);

    const queue = [];
    entries.forEach(entry => {
        if (!entry.word) return;
        const meanings = uniqueByNorm(entry.meanings);

        if (settings.choice) {
            meanings.forEach(meaning => {
                queue.push({ type: 'w2m', entry: entry, meaning: meaning });
                queue.push({ type: 'm2w', entry: entry, meaning: meaning });
            });
        }

        if (settings.spell) {
            if (settings.spellTarget === 'reading') {
                if (quizNorm(entry.reading) !== '') {
                    queue.push({ type: 'spell', target: 'reading', entry: entry, meaning: null });
                }
            } else {
                meanings.forEach(meaning => {
                    queue.push({ type: 'spell', target: 'word', entry: entry, meaning: meaning });
                });
            }
        }
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
// 拼寫答案比對
// ------------------------------------------
function katakanaToHiragana(text) {
    return text.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 拼單字：忽略前後空白與大小寫，中間連續空白視為一個。
// 拼讀音：忽略所有空白，並把片假名視為平假名。
function normalizeSpellText(text, target) {
    const t = String(text ?? '').normalize('NFKC').trim().toLowerCase();
    if (target === 'reading') return katakanaToHiragana(t.replace(/\s+/g, ''));
    return t.replace(/\s+/g, ' ');
}

// 讀音欄可以用 / 、 , ; 或換行分隔多個都可接受的讀音
function splitReadingAlternatives(reading) {
    return String(reading ?? '').split(/[\/／、,，;；\n]/).map(x => x.trim()).filter(x => x !== '');
}

// 判斷拼寫答案。回傳 { correct, expected }，expected 為答錯時要顯示的正確答案。
function judgeSpelling(q, typed, pool) {
    if (q.target === 'reading') {
        const expected = q.entry.reading;
        const accepted = [expected].concat(splitReadingAlternatives(expected));
        const t = normalizeSpellText(typed, 'reading');
        return {
            correct: t !== '' && accepted.some(a => normalizeSpellText(a, 'reading') === t),
            expected: expected
        };
    }

    // 拼單字：另一個「也有同樣意思」的單字（近義詞）也算對
    const accepted = [q.entry.word];
    pool.forEach(e => {
        if (quizNorm(e.word) === quizNorm(q.entry.word)) return;
        if (e.meanings.some(m => quizNorm(m) === quizNorm(q.meaning))) accepted.push(e.word);
    });
    const t = normalizeSpellText(typed, 'word');
    return {
        correct: t !== '' && accepted.some(a => normalizeSpellText(a, 'word') === t),
        expected: q.entry.word
    };
}

// ------------------------------------------
// 開始 / 結束
// ------------------------------------------
function quizEmptyMessage(settings) {
    const needReading = settings.spell && settings.spellTarget === 'reading';
    const needMeaning = settings.choice || (settings.spell && settings.spellTarget === 'word');
    let need = '意思';
    if (needReading && needMeaning) need = '意思或讀音';
    else if (needReading) need = '讀音';
    return `這個單字庫目前沒有可以出題的單字（單字需要填寫${need}）。\n請先補上，或到「單字」畫面更改學習模式。`;
}

function startQuizSession(task) {
    const settings = getQuizSettings(task);
    const entries = ensureUpgradedWords(getWordsForTask(task));
    const queue = buildQuizQueue(entries, settings);

    if (queue.length === 0) {
        alert(quizEmptyMessage(settings));
        return;
    }

    const bank = getVocabWordbankForTask(task);
    activeQuizSession = {
        taskId: task.id,
        practice: !!task.isPractice,
        vocabFont: (bank && bank.vocabFont) || 'default',
        settings: settings,
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
    const input = document.getElementById('quiz-spell-input');
    if (input) input.blur();
    activeQuizSession = null;
    closeModal('vocab-quiz-modal');
}

function finishQuizSession() {
    closeModal('vocab-quiz-modal');
    const session = activeQuizSession;
    activeQuizSession = null;
    if (!session) return;

    // 從單字庫直接開始的練習：沒有對應計畫，只提示結果
    if (session.practice) {
        alert(session.wrongWords.length > 0
            ? `練習完成！有 ${session.wrongWords.length} 個單字答錯過。（從單字庫開始的練習不會新增待複習單字任務）`
            : '太棒了！所有題目都答對了。');
        return;
    }

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

// 題目卡的標題與內容
// 拼單字的提示（顯示在題目文字的下一行）：
//   字數 <= 3：第一個字；字數 <= 6：前後各一個字；其餘：前後各兩個字。
//   中間固定以三個底線代替，後面括號標示字數。例如 international → in___al (13)
function buildSpellHint(word) {
    const chars = Array.from(String(word ?? ''));
    const len = chars.length;
    if (len === 0) return '';
    const head = len <= 6 ? 1 : 2;
    const tail = len <= 3 ? 0 : (len <= 6 ? 1 : 2);
    if (len <= head + tail) return `${chars.join('')} (${len})`;   // 沒有可隱藏的字（例如單一字元）
    return `${chars.slice(0, head).join('')}___${tail > 0 ? chars.slice(len - tail).join('') : ''} (${len})`;
}

function renderQuizCard(q, vocabFont) {
    const labelEl = document.getElementById('quiz-card-label');
    const textEl = document.getElementById('quiz-card-text');

    const showWord = () => {
        textEl.className = `flashcard-word ${getCustomFontClass(vocabFont)}`;
        textEl.innerText = q.entry.word;
        fitTextToWidth(textEl, '2.2rem');
    };
    const showMeaning = () => {
        textEl.className = 'quiz-card-meaning';
        textEl.innerHTML = parseMixedFontText(q.meaning, vocabFont);
        fitTextToWidth(textEl, '1.6rem');
    };

    if (q.type === 'w2m') {
        labelEl.innerText = '選出正確的意思';
        showWord();
    } else if (q.type === 'm2w') {
        labelEl.innerText = '選出正確的單字';
        showMeaning();
    } else if (q.target === 'reading') {
        labelEl.innerText = '輸入這個單字的讀音';
        showWord();
    } else {
        labelEl.innerText = '拼出這個意思的單字';
        showMeaning();
    }

    renderSpellHint(q, textEl, vocabFont);
}

// 拼單字的提示列：放在題目文字的下一行，字型與字級跟題目文字一致。
// 其他題型（選擇題、拼讀音）不顯示。
function renderSpellHint(q, textEl, vocabFont) {
    let hintEl = document.getElementById('quiz-card-hint');
    if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.id = 'quiz-card-hint';
        hintEl.style.marginTop = '10px';
        textEl.insertAdjacentElement('afterend', hintEl);
    }

    const isSpellWord = (q.type === 'spell' && q.target !== 'reading');
    if (!isSpellWord) {
        hintEl.style.display = 'none';
        hintEl.innerHTML = '';
        return;
    }

    hintEl.className = textEl.className;                 // 與題目相同的樣式（字型、粗細、斷行）
    hintEl.innerHTML = parseMixedFontText(buildSpellHint(q.entry.word), vocabFont);
    hintEl.style.display = '';
    hintEl.style.fontSize = textEl.style.fontSize;       // 與題目縮放後的字級一致
}

function resetSpellArea(q) {
    const input = document.getElementById('quiz-spell-input');
    input.value = '';
    input.readOnly = false;
    input.className = 'quiz-spell-input';
    input.placeholder = (q.target === 'reading') ? '輸入讀音' : '輸入單字';
    const result = document.getElementById('quiz-spell-result');
    result.textContent = '';
    result.classList.add('hidden');
    document.getElementById('quiz-spell-submit').classList.remove('hidden');
}

function showQuizQuestion() {
    const s = activeQuizSession;
    if (!s) return;

    if (s.index >= s.queue.length) {
        finishQuizSession();
        return;
    }

    const q = s.queue[s.index];
    const isSpell = (q.type === 'spell');
    const options = isSpell ? [] : buildQuizOptions(q, s.pool);
    s.current = { question: q, options: options, answered: false };

    const body = document.getElementById('quiz-body');
    const stage = document.getElementById('quiz-stage');

    // 換題：瞬間重置畫面，不播放漸變動畫
    body.classList.add('no-anim');
    stage.classList.remove('answered');

    renderQuizCard(q, s.vocabFont);

    // 選擇題：三個選項（不足三個時最下方留空）；拼寫題：輸入框
    const optionsEl = document.getElementById('quiz-options');
    optionsEl.classList.toggle('hidden', isSpell);
    optionsEl.classList.remove('answered');
    document.getElementById('quiz-spell').classList.toggle('hidden', !isSpell);

    if (isSpell) {
        resetSpellArea(q);
    } else {
        for (let i = 0; i < QUIZ_OPTION_COUNT; i++) {
            const btn = document.getElementById(`quiz-opt-${i}`);
            const option = options[i];
            if (option) {
                btn.className = 'quiz-option ' + (q.type === 'w2m' ? 'kind-meaning' : 'kind-word');
                btn.innerHTML = quizOptionHtml(option, q, s.vocabFont);
                btn.disabled = false;
                fitTextToWidth(btn, q.type === 'w2m' ? '0.95rem' : '1.1rem', { self: true });
            } else {
                btn.className = 'quiz-option blank';
                btn.innerHTML = '';
                btn.style.fontSize = '';
                btn.disabled = true;
            }
        }
    }

    // 答題後才會出現的一般單字卡：預設翻在正面（單字）
    document.getElementById('quiz-flashcard').classList.remove('is-flipped');
    renderFlashcardContent(q.entry, s.vocabFont, QUIZ_FLASHCARD_IDS);

    document.getElementById('quiz-next-btn').classList.add('hidden');
    updateQuizProgress();

    void body.offsetWidth;   // 強制 reflow，讓上面的重置立刻生效
    body.classList.remove('no-anim');

    if (isSpell) document.getElementById('quiz-spell-input').focus({ preventScroll: true });
}

// 作答後的共通處理（選擇題與拼寫題共用）
function finishQuizAnswer(q, isCorrect) {
    const s = activeQuizSession;

    if (!isCorrect) {
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

// 按下選項（選擇題）
function answerQuiz(slot) {
    const s = activeQuizSession;
    if (!s || !s.current || s.current.answered) return;
    if (s.current.question.type === 'spell') return;

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

    finishQuizAnswer(q, picked.correct);
}

// 按下「確認」或 Enter（拼寫題）
function submitSpelling() {
    const s = activeQuizSession;
    if (!s || !s.current || s.current.answered) return;
    const q = s.current.question;
    if (q.type !== 'spell') return;

    const input = document.getElementById('quiz-spell-input');
    const verdict = judgeSpelling(q, input.value, s.pool);
    s.current.answered = true;
    s.current.typed = input.value;
    s.current.correct = verdict.correct;

    input.readOnly = true;
    input.classList.add(verdict.correct ? 'correct' : 'wrong');
    input.blur();
    document.getElementById('quiz-spell-submit').classList.add('hidden');

    if (!verdict.correct) {
        const result = document.getElementById('quiz-spell-result');
        result.textContent = `正確答案：${verdict.expected}`;
        result.classList.remove('hidden');
    }

    finishQuizAnswer(q, verdict.correct);
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

// Enter 送出答案。輸入法選字時的 Enter（isComposing）不能算送出，否則日文讀音打到一半就會被判分。
(function bindSpellInput() {
    const input = document.getElementById('quiz-spell-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        submitSpelling();
    });
})();
