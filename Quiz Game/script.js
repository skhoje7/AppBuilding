// ====================== Built-in fallback bank ======================
// Each: { q, choices: [a,b,c,d], answer: 0-3, category, difficulty }
const FALLBACK_BANK = [
  { q: "Which HTML tag links an external JavaScript file?", choices: ["<script href='...'>","<link src='...'>","<script src='...'>","<js href='...'>"], answer: 2, category:"HTML", difficulty:"easy" },
  { q: "Which CSS property controls text size?", choices: ["font-weight","text-size","font-size","size"], answer: 2, category:"CSS", difficulty:"easy" },
  { q: "What does JSON stand for?", choices: ["Java Source Open Network","JavaScript Object Notation","Joined Source Object Namespace","Java Standard Object Notation"], answer: 1, category:"General", difficulty:"easy" },
  { q: "Array method to add to the end:", choices: ["push()","pop()","shift()","unshift()"], answer: 0, category:"JavaScript", difficulty:"easy" },
  { q: "HTTP 404 means…", choices: ["OK","Moved Permanently","Not Found","Internal Server Error"], answer: 2, category:"Web", difficulty:"easy" },
  { q: "const x = 2 + '2' evaluates to…", choices: ["\"22\"","4","NaN","TypeError"], answer: 0, category:"JavaScript", difficulty:"medium" },
  { q: "Keyword to create constant in JS:", choices: ["constant","let","var","const"], answer: 3, category:"JavaScript", difficulty:"easy" },
  { q: "querySelector('#id') selects by…", choices: ["class","tag","id","name"], answer: 2, category:"DOM", difficulty:"easy" },
  { q: "Which layout is 1-D and good for rows/cols?", choices: ["Grid","Flexbox","Float","Table"], answer: 1, category:"CSS", difficulty:"easy" },
  { q: "setTimeout(fn, 0) runs…", choices: ["Before anything","After current call stack","Exactly at 0ms","Never"], answer: 1, category:"JavaScript", difficulty:"medium" }
];

// ====================== Elements ======================
const qNumEl = document.getElementById('qNum');
const qTotalEl = document.getElementById('qTotal');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');

const startSec = document.getElementById('start');
const quizSec = document.getElementById('quiz');
const endSec = document.getElementById('end');

const catSel = document.getElementById('category');
const diffSel = document.getElementById('difficulty');
const countSel = document.getElementById('count');
const secondsSel = document.getElementById('seconds');
const startBtn = document.getElementById('startBtn');
const sourceMsg = document.getElementById('sourceMsg');

const questionEl = document.getElementById('question');
const choicesEl = document.getElementById('choices');
const nextBtn = document.getElementById('nextBtn');
const barEl = document.getElementById('bar'); // segmented progress container

const finalScoreEl = document.getElementById('finalScore');
const saveForm = document.getElementById('saveForm');
const playerInput = document.getElementById('player');
const highscoresOl = document.getElementById('highscores');
const playAgainBtn = document.getElementById('playAgain');
const clearScoresBtn = document.getElementById('clearScores');

// ====================== State ======================
const HS_KEY = 'quiz.highscores.v1';
let BANK = [];           // loaded from JSON or fallback
let questions = [];      // chosen subset
let index = 0;
let score = 0;
let seconds = 15;
let timer = null;
let locked = false;

// Selections for saving in highscores
let currentCategory = 'all';
let currentDifficulty = 'all';

// Per-question results for segmented progress (null=pending, true/false=answered)
let results = [];

// ====================== Utils ======================
function shuffle(arr){
  const a = [...arr];
  for (let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickRandom(arr, n){ return shuffle(arr).slice(0, n); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function loadScores(){ try { return JSON.parse(localStorage.getItem(HS_KEY)) ?? []; } catch { return []; } }
function saveScores(list){ localStorage.setItem(HS_KEY, JSON.stringify(list)); }

function renderScores(){
  const hs = loadScores().slice(0,10);
  highscoresOl.innerHTML = hs.map(s => {
    const cat = (s.category && s.category !== 'all') ? s.category : 'All';
    const dif = (s.difficulty && s.difficulty !== 'all') ? s.difficulty : 'All';
    return `<li>${s.name || 'Anonymous'} — <strong>${s.score}</strong> <span class="muted">(${cat}, ${dif})</span></li>`;
  }).join('');
}

// ====================== JSON Loader ======================
async function loadBank(){
  try{
    const res = await fetch('questions.json', { cache:'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : [];
    BANK = arr.filter(q =>
      q && typeof q.q === 'string' &&
      Array.isArray(q.choices) && q.choices.length === 4 &&
      Number.isInteger(q.answer) && q.answer >=0 && q.answer < 4
    ).map(q => ({
      q: q.q,
      choices: q.choices,
      answer: q.answer,
      category: q.category || 'General',
      difficulty: (q.difficulty || 'medium').toLowerCase()
    }));
    if (!BANK.length) throw new Error('Empty/invalid file');
    sourceMsg.textContent = 'Loaded questions from questions.json';
  } catch (e){
    BANK = FALLBACK_BANK;
    sourceMsg.textContent = 'Using built-in questions (questions.json not found or invalid).';
  }
  populateCategoryOptions();
}
function getCategories(){
  return Array.from(new Set(BANK.map(q => q.category))).sort();
}
function populateCategoryOptions(){
  const cats = getCategories();
  catSel.innerHTML = '<option value="all">All</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

// ====================== Segmented Progress Bar ======================
function initProgress(total){
  results = new Array(total).fill(null);  // pending
  barEl.innerHTML = '';
  // segments are styled via CSS (#bar .seg, .correct, .wrong)
  for (let i = 0; i < total; i++){
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.dataset.idx = i;
    barEl.appendChild(seg);
  }
}
function updateProgress(idx, correct){
  if (results[idx] !== null) return;   // color only once
  results[idx] = !!correct;
  const seg = barEl.querySelector(`.seg[data-idx="${idx}"]`);
  if (!seg) return;
  seg.classList.add(correct ? 'correct' : 'wrong');
}

// ====================== Quiz Flow ======================
function startQuiz(){
  const requested = parseInt(countSel.value, 10);
  seconds = parseInt(secondsSel.value, 10);
  const cat = catSel.value;         // 'all' or name
  const diff = diffSel.value;       // 'all' | 'easy' | 'medium' | 'hard'

  currentCategory = cat;
  currentDifficulty = diff;

  // Filter BANK
  let pool = BANK;
  if (cat !== 'all') pool = pool.filter(q => q.category === cat);
  if (diff !== 'all') pool = pool.filter(q => q.difficulty === diff);

  if (!pool.length){
    alert('No questions match your selection. Try another category/difficulty.');
    return;
  }

  const n = Math.min(requested, pool.length);
  questions = pickRandom(pool, n);
  index = 0;
  score = 0;
  scoreEl.textContent = score;
  qTotalEl.textContent = questions.length;

  initProgress(questions.length);

  startSec.classList.add('hidden');
  endSec.classList.add('hidden');
  quizSec.classList.remove('hidden');

  loadQuestion();
}

function loadQuestion(){
  clearInterval(timer);
  nextBtn.disabled = true;
  locked = false;

  const q = questions[index];
  qNumEl.textContent = index + 1;
  questionEl.textContent = q.q;
  choicesEl.innerHTML = '';

  q.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.innerHTML = `<span class="num">${i+1}</span> <span>${text}</span>`;
    btn.addEventListener('click', () => choose(i, btn));
    btn.dataset.idx = i;
    choicesEl.appendChild(btn);
  });

  // timer
  let t = seconds;
  timeEl.textContent = t;
  timer = setInterval(() => {
    t--;
    timeEl.textContent = t;
    if (t <= 0){
      clearInterval(timer);
      lockChoices();
      // mark correct option
      const correctBtn = [...choicesEl.children][q.answer];
      correctBtn.classList.add('correct');
      // timeout = incorrect
      updateProgress(index, false);
      nextBtn.disabled = false;
    }
  }, 1000);
}

function lockChoices(){
  locked = true;
  [...choicesEl.children].forEach(b => b.disabled = true);
}

function choose(choiceIdx, btn){
  if (locked) return;
  const q = questions[index];
  const correct = q.answer === choiceIdx;

  if (correct){
    btn.classList.add('correct');
    score += 10;
  } else {
    btn.classList.add('wrong');
    [...choicesEl.children][q.answer].classList.add('correct');
  }

  scoreEl.textContent = score;
  updateProgress(index, correct);

  lockChoices();
  clearInterval(timer);
  nextBtn.disabled = false;
}

function next(){
  if (index < questions.length - 1){
    index++;
    loadQuestion();
  } else {
    finish();
  }
}

function finish(){
  clearInterval(timer);
  finalScoreEl.textContent = score;
  quizSec.classList.add('hidden');
  endSec.classList.remove('hidden');
  renderScores();
}

// ====================== High Scores ======================
saveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = playerInput.value.trim();

  const entry = {
    name,
    score,
    category: currentCategory,
    difficulty: currentDifficulty,
    date: Date.now()
  };

  const hs = loadScores().concat(entry)
    .sort((a,b)=> b.score - a.score)
    .slice(0,10);

  saveScores(hs);
  renderScores();
  playerInput.value = '';
});

playAgainBtn.addEventListener('click', () => {
  startSec.classList.remove('hidden');
  quizSec.classList.add('hidden');
  endSec.classList.add('hidden');
});

clearScoresBtn.addEventListener('click', () => {
  if (confirm('Clear all saved scores?')){
    saveScores([]);
    renderScores();
  }
});

// ====================== Events ======================
document.getElementById('nextBtn').addEventListener('click', next);
document.getElementById('startBtn').addEventListener('click', startQuiz);

document.addEventListener('keydown', (e) => {
  if (!quizSec.classList.contains('hidden')){
    const n = parseInt(e.key, 10);
    if (n >=1 && n <= 4){
      const btn = choicesEl.children[n-1];
      if (btn) btn.click();
    }
    if (e.key === 'Enter'){
      if (!nextBtn.disabled) nextBtn.click();
    }
  }
});

// Init
renderScores();
loadBank();
