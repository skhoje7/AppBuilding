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
const supaTabs = document.querySelectorAll('.supabase-tab');
const supaPanels = document.querySelectorAll('[data-tab-panel]');
const supaHistoryState = document.getElementById('supabase-history-state');
const supaHistoryList = document.getElementById('supabase-remote-history');

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

let history = [];
let supabaseConfig = null;
let supabaseClient = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;
let statusTimer = null;
let remoteHistory = [];
let remoteHistoryLoaded = false;
let remoteHistoryLoading = false;
let activeSupabaseTab = 'status';

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

function setHistoryState(message, tone = 'default'){
  if (!supaHistoryState) return;
  supaHistoryState.textContent = message;
  if (tone === 'default'){
    supaHistoryState.removeAttribute('data-tone');
  } else {
    supaHistoryState.setAttribute('data-tone', tone);
  }
  supaHistoryState.hidden = false;
  if (supaHistoryList){
    supaHistoryList.hidden = true;
    supaHistoryList.innerHTML = '';
  }
}

function resetRemoteHistory(message){
  remoteHistory = [];
  remoteHistoryLoaded = false;
  remoteHistoryLoading = false;
  if (message){
    setHistoryState(message);
  } else if (supaHistoryState){
    supaHistoryState.hidden = true;
  }
}

function renderRemoteHistory(){
  if (!supaHistoryList) return;
  supaHistoryList.innerHTML = '';
  if (!remoteHistory.length){
    setHistoryState('No saved rolls found yet. Roll some dice to create history.');
    return;
  }

  if (supaHistoryState){
    supaHistoryState.hidden = true;
  }

  supaHistoryList.hidden = false;

  for (const record of remoteHistory){
    const li = document.createElement('li');

    const when = record.rolled_at ? new Date(record.rolled_at) : null;
    const timeEl = document.createElement('time');
    if (when && !Number.isNaN(when.getTime())){
      timeEl.dateTime = when.toISOString();
      timeEl.textContent = when.toLocaleString();
    } else {
      timeEl.textContent = 'Unknown time';
    }

    const diceCount = record.dice_count ?? (Array.isArray(record.values) ? record.values.length : undefined);
    const sides = record.sides ?? '?';

    const label = document.createElement('strong');
    label.textContent = `d${sides} ×${diceCount ?? '?'} → ${record.total ?? '—'}`;

    let values = [];
    if (Array.isArray(record.values)){
      values = record.values;
    } else if (typeof record.values === 'string'){
      const trimmed = record.values.replace(/[{}]/g, '');
      values = trimmed ? trimmed.split(',').map((part) => Number(part.trim())).filter((num) => !Number.isNaN(num)) : [];
    }

    const valuesLine = document.createElement('span');
    if (values.length){
      valuesLine.textContent = values.join(', ');
    } else {
      valuesLine.textContent = 'No individual values recorded.';
    }

    const avg = record.average ?? (values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : null);
    if (avg !== null && avg !== undefined){
      const averageLine = document.createElement('span');
      averageLine.textContent = `avg: ${Number(avg).toFixed(2)}`;
      li.append(timeEl, label, valuesLine, averageLine);
    } else {
      li.append(timeEl, label, valuesLine);
    }

    supaHistoryList.appendChild(li);
  }
}

async function loadRemoteHistory(force = false){
  if (!supaHistoryList) return;
  if (!supabaseConfig?.enabled){
    resetRemoteHistory('Enable sync from the settings page to view saved rolls.');
    return;
  }
  if (!supabaseClient){
    resetRemoteHistory('Save a valid Supabase configuration to view saved rolls.');
    return;
  }
  if (!supabaseUser){
    resetRemoteHistory('Sign in on the settings page to view your saved rolls.');
    return;
  }
  if (remoteHistoryLoading) return;
  if (remoteHistoryLoaded && !force) return;

  remoteHistoryLoading = true;
  setHistoryState('Loading saved rolls…', 'pending');

  try {
    const { data, error } = await supabaseClient
      .from(supabaseConfig.table)
      .select('rolled_at,dice_count,sides,values,total,average,user_id')
      .eq('user_id', supabaseUser.id)
      .order('rolled_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    remoteHistory = Array.isArray(data) ? data : [];
    remoteHistoryLoaded = true;
    renderRemoteHistory();
  } catch (error){
    console.error('Failed to load Supabase history', error);
    setHistoryState(`Unable to load saved rolls: ${error.message}`, 'error');
  } finally {
    remoteHistoryLoading = false;
  }
}

function setAuthUser(user){
  supabaseUser = user;
  if (!user){
    resetRemoteHistory('Sign in on the settings page to view your saved rolls.');
  } else if (activeSupabaseTab === 'history'){
    void loadRemoteHistory(true);
  }
}

async function applyConfig(config){
  supabaseConfig = config;
  supabaseClient = null;
  supabaseUser = null;
  remoteHistory = [];
  remoteHistoryLoaded = false;
  remoteHistoryLoading = false;

  if (supabaseAuthSubscription){
    supabaseAuthSubscription.unsubscribe();
    supabaseAuthSubscription = null;
  }

  if (!config.enabled){
    setStatus('Supabase sync is disabled. Configure settings to enable sync.', 'default');
    resetRemoteHistory('Enable sync from the settings page to view saved rolls.');
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but credentials are incomplete. Update the settings page.', 'error');
    resetRemoteHistory('Complete your Supabase credentials to fetch saved rolls.');
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
      if (activeSupabaseTab === 'history'){
        void loadRemoteHistory(true);
      }
    } else {
      setStatus('Supabase connection ready. Sign in from the settings page to sync rolls.', 'pending');
      resetRemoteHistory('Sign in on the settings page to view your saved rolls.');
    }
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
    supabaseClient = null;
    setAuthUser(null);
    resetRemoteHistory('Supabase setup failed. Update your settings and try again.');
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
    if (activeSupabaseTab === 'history'){
      remoteHistoryLoaded = false;
      void loadRemoteHistory(true);
    }
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

for (const tab of supaTabs){
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (!target || target === activeSupabaseTab) return;

    activeSupabaseTab = target;

    for (const other of supaTabs){
      const isActive = other.dataset.tab === target;
      other.classList.toggle('is-active', isActive);
      other.setAttribute('aria-selected', String(isActive));
      other.setAttribute('tabindex', isActive ? '0' : '-1');
    }

    for (const panel of supaPanels){
      const matches = panel.dataset.tabPanel === target;
      if (matches){
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    }

    if (target === 'history'){
      void loadRemoteHistory();
    }
  });
}

if (supaTabs.length){
  for (const panel of supaPanels){
    const matches = panel.dataset.tabPanel === activeSupabaseTab;
    if (!matches){
      panel.setAttribute('hidden', '');
    }
  }
}

if (supaHistoryState){
  setHistoryState('Enable sync and sign in from the settings page to view your saved rolls.');
}

renderHistory();

const initialConfig = loadConfig();
void applyConfig(initialConfig);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY){
    const updatedConfig = loadConfig();
    void applyConfig(updatedConfig);
  }
});
