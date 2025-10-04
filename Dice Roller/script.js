const countSel = document.getElementById('count');
const sidesSel = document.getElementById('sides');
const rollBtn = document.getElementById('roll');
const clearBtn = document.getElementById('clear');
const diceEl = document.getElementById('dice');
const totalEl = document.getElementById('total');
const avgEl = document.getElementById('avg');
const histEl = document.getElementById('history');
const tmpl = document.getElementById('die-tmpl');

// Unicode faces for d6
const DICE_FACE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

let history = []; // store last N rolls

function rand(n){ return Math.floor(Math.random()*n)+1; }

function renderDice(values, sides){
  diceEl.innerHTML='';
  for (const v of values){
    const node = tmpl.content.firstElementChild.cloneNode(true);
    const faceEl = node.querySelector('.face');
    if (sides === 6){
      faceEl.textContent = DICE_FACE[v];
    } else {
      faceEl.textContent = v;
      node.style.fontSize = '36px';
      node.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    }
    node.dataset.value = v;
    node.classList.add('roll');
    diceEl.appendChild(node);
  }
}

function addHistory(values){
  const sum = values.reduce((a,b)=>a+b,0);
  const item = { time: new Date().toLocaleTimeString(), values, sum };
  history.unshift(item);
  if (history.length > 12) history.pop();
  renderHistory();
}

function renderHistory(){
  histEl.innerHTML = '';
  for (const h of history){
    const li = document.createElement('li');
    li.textContent = `[${h.time}]  ${h.values.join(', ')}  →  sum=${h.sum}`;
    histEl.appendChild(li);
  }
}

function roll(){
  const count = parseInt(countSel.value,10);
  const sides = parseInt(sidesSel.value,10);
  const values = Array.from({length: count}, () => rand(sides));
  renderDice(values, sides);
  const sum = values.reduce((a,b)=>a+b,0);
  totalEl.textContent = sum;
  avgEl.textContent = (sum / count).toFixed(2);
  addHistory(values);
}

function clearAll(){
  diceEl.innerHTML = '';
  totalEl.textContent = '—';
  avgEl.textContent = '—';
  history = [];
  renderHistory();
}

rollBtn.addEventListener('click', roll);
clearBtn.addEventListener('click', clearAll);

// first render (empty)
renderHistory();
