import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const countSel = document.getElementById('count');
const sidesSel = document.getElementById('sides');
const rollBtn = document.getElementById('roll');
const clearBtn = document.getElementById('clear');
const diceEl = document.getElementById('dice');
const totalEl = document.getElementById('total');
const avgEl = document.getElementById('avg');
const histEl = document.getElementById('history');
const tmpl = document.getElementById('die-tmpl');

const supaForm = document.getElementById('supabase-form');
const supaUrlInput = document.getElementById('supabase-url');
const supaKeyInput = document.getElementById('supabase-key');
const supaTableInput = document.getElementById('supabase-table');
const supaSyncInput = document.getElementById('supabase-sync');
const supaStatus = document.getElementById('supabase-status');

// Unicode faces for d6
const DICE_FACE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
const STORAGE_KEY = 'dice-roller.supabase';

let history = []; // store last N rolls
let supabaseConfig = null;
let supabaseClient = null;
let statusTimer = null;

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

function setStatus(message, tone = 'default'){ 
  supaStatus.textContent = message;
  if (tone === 'default'){
    supaStatus.removeAttribute('data-tone');
  } else {
    supaStatus.setAttribute('data-tone', tone);
  }
  if (statusTimer){
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (tone === 'success'){
    statusTimer = setTimeout(() => {
      if (supaStatus.getAttribute('data-tone') === 'success'){
        setStatus('Supabase sync is ready.', 'default');
      }
    }, 4000);
  }
}

function loadConfig(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { url:'', key:'', table:'dice_rolls', enabled:false };
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url ?? '',
      key: parsed.key ?? '',
      table: parsed.table ?? 'dice_rolls',
      enabled: Boolean(parsed.enabled)
    };
  } catch(err){
    console.warn('Failed to load Supabase config', err);
    return { url:'', key:'', table:'dice_rolls', enabled:false };
  }
}

function saveConfig(config){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function isConfigComplete(config){
  return Boolean(config.url && config.key && config.table);
}

async function applyConfig(config){
  supabaseConfig = config;
  supabaseClient = null;

  supaUrlInput.value = config.url;
  supaKeyInput.value = config.key;
  supaTableInput.value = config.table;
  supaSyncInput.checked = Boolean(config.enabled);

  if (!config.enabled){
    setStatus('Supabase sync is disabled.', 'default');
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but credentials are incomplete.', 'error');
    return;
  }

  try {
    supabaseClient = createClient(config.url, config.key, { auth: { persistSession: false } });
    setStatus(`Supabase sync is ready. Rolls will be sent to “${config.table}”.`, 'success');
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
  }
}

async function persistHistoryEntry(entry){
  if (!supabaseConfig?.enabled || !supabaseClient) return;

  setStatus('Saving roll to Supabase…', 'pending');

  const payload = {
    rolled_at: entry.iso,
    dice_count: entry.values.length,
    sides: entry.sides,
    values: entry.values,
    total: entry.sum,
    average: entry.sum / entry.values.length
  };

  try {
    const { error } = await supabaseClient
      .from(supabaseConfig.table)
      .insert([payload]);

    if (error) throw error;
    setStatus('Roll saved to Supabase.', 'success');
  } catch (error){
    console.error('Supabase insert failed', error);
    setStatus(`Failed to save roll: ${error.message}`, 'error');
  }
}

function addHistory(values, sides){
  const sum = values.reduce((a,b)=>a+b,0);
  const timestamp = new Date();
  const item = {
    time: timestamp.toLocaleTimeString(),
    iso: timestamp.toISOString(),
    values: [...values],
    sum,
    sides
  };
  history.unshift(item);
  if (history.length > 12) history.pop();
  renderHistory();
  void persistHistoryEntry(item);
}

function renderHistory(){
  histEl.innerHTML = '';
  for (const h of history){
    const li = document.createElement('li');
    li.textContent = `[${h.time}] d${h.sides} ×${h.values.length} → ${h.values.join(', ')} (sum=${h.sum})`;
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
  addHistory(values, sides);
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

supaForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const config = {
    url: supaUrlInput.value.trim(),
    key: supaKeyInput.value.trim(),
    table: (supaTableInput.value.trim() || 'dice_rolls'),
    enabled: supaSyncInput.checked
  };
  saveConfig(config);
  void applyConfig(config);
});

// first render (empty)
renderHistory();
const initialConfig = loadConfig();
void applyConfig(initialConfig);
