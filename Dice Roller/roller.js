import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { loadConfig, isConfigComplete, STORAGE_KEY } from './supabaseConfig.js';

const countSel = document.getElementById('count');
const sidesSel = document.getElementById('sides');
const rollBtn = document.getElementById('roll');
const clearBtn = document.getElementById('clear');
const diceEl = document.getElementById('dice');
const totalEl = document.getElementById('total');
const avgEl = document.getElementById('avg');
const histEl = document.getElementById('history');
const tmpl = document.getElementById('die-tmpl');
const supaStatus = document.getElementById('supabase-status');

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

let history = [];
let supabaseConfig = null;
let supabaseClient = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;
let statusTimer = null;

function rand(n){
  return Math.floor(Math.random() * n) + 1;
}

function renderDice(values, sides){
  diceEl.innerHTML = '';
  for (const value of values){
    const node = tmpl.content.firstElementChild.cloneNode(true);
    const faceEl = node.querySelector('.face');
    if (sides === 6){
      faceEl.textContent = DICE_FACE[value];
    } else {
      faceEl.textContent = value;
      node.style.fontSize = '36px';
      node.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    }
    node.dataset.value = value;
    node.classList.add('roll');
    diceEl.appendChild(node);
  }
}

function setStatus(message, tone = 'default'){
  if (!supaStatus) return;
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

function setAuthUser(user){
  supabaseUser = user;
}

async function applyConfig(config){
  supabaseConfig = config;
  supabaseClient = null;
  supabaseUser = null;

  if (supabaseAuthSubscription){
    supabaseAuthSubscription.unsubscribe();
    supabaseAuthSubscription = null;
  }

  if (!config.enabled){
    setStatus('Supabase sync is disabled. Configure settings to enable sync.', 'default');
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but credentials are incomplete. Update the settings page.', 'error');
    return;
  }

  try {
    supabaseClient = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!supabaseConfig?.enabled) return;
      if (event === 'SIGNED_OUT'){
        setAuthUser(null);
        setStatus('Supabase session ended. Sign in again from the settings page.', 'default');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'){
        const user = session?.user ?? null;
        setAuthUser(user);
        if (user){
          const email = user.email ?? 'Supabase user';
          setStatus(`Signed in as ${email}. Rolls sync to “${supabaseConfig.table}”.`, 'success');
        }
      }
    });

    supabaseAuthSubscription = subscription;

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const user = session?.user ?? null;
    setAuthUser(user);
    if (user){
      const email = user.email ?? 'Supabase user';
      setStatus(`Signed in as ${email}. Rolls sync to “${config.table}”.`, 'success');
    } else {
      setStatus('Supabase connection ready. Sign in from the settings page to sync rolls.', 'pending');
    }
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
    supabaseClient = null;
    setAuthUser(null);
  }
}

async function persistHistoryEntry(entry){
  if (!supabaseConfig?.enabled || !supabaseClient) return;
  if (!supabaseUser){
    setStatus('Sign in through the settings page before syncing rolls.', 'error');
    return;
  }

  setStatus('Saving roll to Supabase…', 'pending');

  const payload = {
    rolled_at: entry.iso,
    dice_count: entry.values.length,
    sides: entry.sides,
    values: entry.values,
    total: entry.sum,
    average: entry.sum / entry.values.length,
    user_id: supabaseUser.id
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
  const sum = values.reduce((a, b) => a + b, 0);
  const timestamp = new Date();
  const entry = {
    time: timestamp.toLocaleTimeString(),
    iso: timestamp.toISOString(),
    values: [...values],
    sum,
    sides
  };

  history.unshift(entry);
  if (history.length > 12) history.pop();

  renderHistory();
  void persistHistoryEntry(entry);
}

function renderHistory(){
  histEl.innerHTML = '';
  for (const record of history){
    const li = document.createElement('li');
    li.textContent = `[${record.time}] d${record.sides} ×${record.values.length} → ${record.values.join(', ')} (sum=${record.sum})`;
    histEl.appendChild(li);
  }
}

function roll(){
  const count = parseInt(countSel.value, 10);
  const sides = parseInt(sidesSel.value, 10);
  const values = Array.from({ length: count }, () => rand(sides));
  renderDice(values, sides);
  const sum = values.reduce((a, b) => a + b, 0);
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

rollBtn?.addEventListener('click', roll);
clearBtn?.addEventListener('click', clearAll);

renderHistory();

const initialConfig = loadConfig();
void applyConfig(initialConfig);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY){
    const updatedConfig = loadConfig();
    void applyConfig(updatedConfig);
  }
});
