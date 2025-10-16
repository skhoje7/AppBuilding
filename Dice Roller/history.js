import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { loadConfig, isConfigComplete, STORAGE_KEY } from './supabaseConfig.js';

const supaStatus = document.getElementById('supabase-status');
const supaHistoryState = document.getElementById('supabase-history-state');
const supaHistoryTable = document.getElementById('supabase-remote-history');
const supaHistoryTbody = supaHistoryTable?.querySelector('tbody') ?? null;

let supabaseConfig = null;
let supabaseClient = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;
let statusTimer = null;
let remoteHistory = [];
let remoteHistoryLoaded = false;
let remoteHistoryLoading = false;

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
  if (supaHistoryState){
    supaHistoryState.textContent = message;
    if (tone === 'default'){
      supaHistoryState.removeAttribute('data-tone');
    } else {
      supaHistoryState.setAttribute('data-tone', tone);
    }
    supaHistoryState.hidden = false;
  }
  if (supaHistoryTable){
    supaHistoryTable.hidden = true;
  }
  if (supaHistoryTbody){
    supaHistoryTbody.innerHTML = '';
  }
}

function renderRemoteHistory(){
  if (!supaHistoryTable || !supaHistoryTbody) return;
  supaHistoryTbody.innerHTML = '';
  if (!remoteHistory.length){
    setHistoryState('No saved rolls found yet. Roll some dice to create history.');
    return;
  }

  if (supaHistoryState){
    supaHistoryState.hidden = true;
  }

  supaHistoryTable.hidden = false;

  for (const record of remoteHistory){
    const row = document.createElement('tr');

    const when = record.rolled_at ? new Date(record.rolled_at) : null;
    const hasValidDate = when && !Number.isNaN(when.getTime());
    const dateText = hasValidDate ? when.toLocaleDateString() : '—';
    const timeText = hasValidDate ? when.toLocaleTimeString() : '—';

    let values = [];
    if (Array.isArray(record.values)){
      values = record.values;
    } else if (typeof record.values === 'string'){
      const trimmed = record.values.replace(/[{}]/g, '');
      values = trimmed ? trimmed.split(',').map((part) => Number(part.trim())).filter((num) => !Number.isNaN(num)) : [];
    }

    const diceCount = record.dice_count ?? (values.length ? values.length : null);
    const sides = record.sides ?? null;
    const total = record.total ?? (values.length ? values.reduce((sum, num) => sum + num, 0) : null);
    const avgValue = record.average ?? (values.length ? ((total ?? 0) / values.length) : null);

    const totalNumber = total !== null && total !== undefined ? Number(total) : null;
    const averageNumber = avgValue !== null && avgValue !== undefined ? Number(avgValue) : null;

    const cells = [
      { text: dateText },
      { text: timeText },
      { text: diceCount !== null && diceCount !== undefined ? String(diceCount) : '—', align: 'right' },
      { text: sides !== null && sides !== undefined ? String(sides) : '—', align: 'right' },
      { text: totalNumber !== null && !Number.isNaN(totalNumber) ? String(totalNumber) : '—', align: 'right' },
      { text: averageNumber !== null && !Number.isNaN(averageNumber) ? averageNumber.toFixed(2) : '—', align: 'right' }
    ];

    for (const cellDef of cells){
      const cell = document.createElement('td');
      cell.textContent = typeof cellDef.text === 'number' ? String(cellDef.text) : cellDef.text;
      if (cellDef.align === 'right'){
        cell.dataset.align = 'right';
      }
      row.appendChild(cell);
    }

    supaHistoryTbody.appendChild(row);
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

function setAuthUser(user){
  supabaseUser = user;
  if (!user){
    resetRemoteHistory('Sign in on the settings page to view your saved rolls.');
  } else if (remoteHistoryLoaded){
    void loadRemoteHistory(true);
  } else {
    void loadRemoteHistory();
  }
}

async function loadRemoteHistory(force = false){
  if (!supaHistoryTable || !supaHistoryTbody) return;
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
    remoteHistoryLoading = false;
    renderRemoteHistory();
  } catch (error){
    console.error('Failed to load Supabase history', error);
    setHistoryState(`Unable to load saved rolls: ${error.message}`, 'error');
  } finally {
    remoteHistoryLoading = false;
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
    setStatus('Supabase sync is disabled. Configure settings to enable sync.');
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
      void loadRemoteHistory(true);
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

const initialConfig = loadConfig();
void applyConfig(initialConfig);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY){
    const updatedConfig = loadConfig();
    void applyConfig(updatedConfig);
  }
});

