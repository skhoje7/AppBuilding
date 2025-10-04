// Symbols (emojis) to use as pairs
const SYMBOLS = ['🍎','🍌','🍇','🍉','🍓','🍒','🥝','🍑','🍍','🥑','🥕','🌽',
                 '🍔','🍕','🍟','🌮','🍪','🍩','🍰','🍫','☕️','🍵','🥐','🥨',
                 '🎧','🎲','🎯','🎮','🧩','🎹','⚽️','🏀','🏈','⚾️','🎳','🏓'];

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const sizeSel = document.getElementById('size');
const newBtn = document.getElementById('new');
const tmpl = document.getElementById('card-tmpl');

const STORAGE_KEY = 'memory.best.v1';

let state = {
  size: 4,          // 4 or 6 (grid dimension)
  lock: false,      // to prevent clicks while comparing
  first: null,      // first revealed card element
  second: null,     // second revealed card element
  moves: 0,
  matched: 0,       // number of matched pairs
  totalPairs: 0,
  timerId: null,
  startAt: null
};

function pad(n){ return n < 10 ? '0'+n : ''+n; }
function fmtTime(ms){
  if (!ms) return '00:00';
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const r = s % 60;
  return pad(m)+':'+pad(r);
}

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(size){
  const cells = size * size;
  const pairs = cells / 2;
  const picks = SYMBOLS.slice(0, pairs);
  const deck = shuffle([...picks, ...picks]);
  state.totalPairs = pairs;
  return deck;
}

function createCard(symbol){
  const node = tmpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.back').dataset.symbol = symbol;
  node.querySelector('.back').textContent = symbol;
  node.addEventListener('click', () => onCardClick(node));
  return node;
}

function onCardClick(card){
  if (state.lock) return;
  if (card.dataset.state === 'revealed' || card.dataset.state === 'matched') return;

  reveal(card);

  if (!state.first){
    state.first = card;
    startTimerIfNeeded();
  } else if (!state.second){
    state.second = card;
    state.lock = true;
    state.moves += 1;
    movesEl.textContent = state.moves;
    comparePair();
  }
}

function reveal(card){ card.dataset.state = 'revealed'; }
function hide(card){ card.dataset.state = 'hidden'; }
function match(card){ card.dataset.state = 'matched'; card.disabled = true; }

function comparePair(){
  const a = state.first.querySelector('.back').dataset.symbol;
  const b = state.second.querySelector('.back').dataset.symbol;
  if (a === b){
    // match
    setTimeout(() => {
      match(state.first); match(state.second);
      state.matched += 1;
      resetPick();
      state.lock = false;
      if (state.matched === state.totalPairs) finishGame();
    }, 300);
  } else {
    // no match
    setTimeout(() => {
      hide(state.first); hide(state.second);
      resetPick();
      state.lock = false;
    }, 650);
  }
}

function resetPick(){ state.first = null; state.second = null; }

function layout(size){
  boardEl.className = 'board size-' + size;
}

function render(size){
  boardEl.innerHTML = '';
  layout(size);
  const deck = buildDeck(size);
  deck.forEach(sym => boardEl.appendChild(createCard(sym)));
  movesEl.textContent = '0';
  timeEl.textContent = '00:00';
}

function startTimerIfNeeded(){
  if (state.timerId) return;
  state.startAt = Date.now();
  state.timerId = setInterval(() => {
    const elapsed = Date.now() - state.startAt;
    timeEl.textContent = fmtTime(elapsed);
  }, 250);
}

function stopTimer(){
  if (state.timerId){
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function finishGame(){
  stopTimer();
  const elapsed = Date.now() - state.startAt;
  // update best (fewest moves, then fastest time as tiebreaker)
  const prev = loadBest();
  const current = { moves: state.moves, time: elapsed, size: state.size };
  const better = !prev || current.size!==prev.size ||
                 (current.size===prev.size && (current.moves < prev.moves ||
                 (current.moves === prev.moves && current.time < prev.time)));
  if (better){
    saveBest(current);
  }
  updateBestLabel();
  setTimeout(()=>{
    alert(`🎉 You won!\nMoves: ${state.moves}\nTime: ${fmtTime(elapsed)}`);
  }, 50);
}

function saveBest(b){ localStorage.setItem(STORAGE_KEY + ':' + state.size, JSON.stringify(b)); }
function loadBest(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY + ':' + state.size)) || null; }
  catch { return null; }
}
function updateBestLabel(){
  const b = loadBest();
  bestEl.textContent = b ? `${b.moves} • ${fmtTime(b.time)}` : '—';
}

function newGame(){
  stopTimer();
  state.lock=false; state.first=null; state.second=null;
  state.moves=0; state.matched=0; state.startAt=null;
  state.size = parseInt(sizeSel.value,10);
  render(state.size);
  updateBestLabel();
}

newBtn.addEventListener('click', newGame);
sizeSel.addEventListener('change', newGame);

// init
newGame();
