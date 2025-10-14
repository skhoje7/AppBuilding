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
const supaEmailInput = document.getElementById('supabase-email');
const supaPasswordInput = document.getElementById('supabase-password');
const supaLoginBtn = document.getElementById('supabase-login');
const supaLogoutBtn = document.getElementById('supabase-logout');
const supaStatus = document.getElementById('supabase-status');

// Unicode faces for d6
const DICE_FACE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
const STORAGE_KEY = 'dice-roller.supabase';

let history = []; // store last N rolls
let supabaseConfig = null;
let supabaseClient = null;
let statusTimer = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;

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
    if (!raw) return { url:'', key:'', table:'dice_rolls', email:'', enabled:false };
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url ?? '',
      key: parsed.key ?? '',
      table: parsed.table ?? 'dice_rolls',
      email: parsed.email ?? '',
      enabled: Boolean(parsed.enabled)
    };
  } catch(err){
    console.warn('Failed to load Supabase config', err);
    return { url:'', key:'', table:'dice_rolls', email:'', enabled:false };
  }
}

function saveConfig(config){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function isConfigComplete(config){
  return Boolean(config.url && config.key && config.table);
}

function updateAuthUi(){
  const enabled = Boolean(supabaseConfig?.enabled);
  const hasClient = Boolean(supabaseClient);
  const canAuth = enabled && hasClient;
  supaEmailInput.disabled = false;
  supaPasswordInput.disabled = !canAuth;
  supaLoginBtn.disabled = !canAuth;
  supaLogoutBtn.disabled = !(canAuth && supabaseUser);
}

function setAuthUser(user){
  supabaseUser = user;
  updateAuthUi();
}

async function applyConfig(config){
  supabaseConfig = config;
  supabaseClient = null;
  if (supabaseAuthSubscription){
    supabaseAuthSubscription.unsubscribe();
    supabaseAuthSubscription = null;
  }

  supaUrlInput.value = config.url;
  supaKeyInput.value = config.key;
  supaTableInput.value = config.table;
  supaSyncInput.checked = Boolean(config.enabled);
  supaEmailInput.value = config.email ?? '';
  supaPasswordInput.value = '';
  setAuthUser(null);

  if (!config.enabled){
    setStatus('Supabase sync is disabled.', 'default');
    updateAuthUi();
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but credentials are incomplete.', 'error');
    updateAuthUi();
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
        setStatus('Signed out of Supabase. Sign in to continue syncing.', 'default');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'){
        setAuthUser(session?.user ?? null);
        if (session?.user){
          const email = session.user.email ?? 'Supabase user';
          setStatus(`Signed in as ${email}. Rolls will sync to “${supabaseConfig.table}”.`, 'success');
        }
      }
    });
    supabaseAuthSubscription = subscription;
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    setAuthUser(session?.user ?? null);
    if (session?.user){
      const email = session.user.email ?? 'Supabase user';
      setStatus(`Signed in as ${email}. Rolls will sync to “${config.table}”.`, 'success');
    } else {
      setStatus('Supabase connection ready. Sign in to sync rolls.', 'pending');
    }
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
    supabaseClient = null;
    setAuthUser(null);
  }
  updateAuthUi();
}

async function persistHistoryEntry(entry){
  if (!supabaseConfig?.enabled || !supabaseClient) return;
  if (!supabaseUser){
    setStatus('Sign in to Supabase before syncing rolls.', 'error');
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
    email: supaEmailInput.value.trim(),
    enabled: supaSyncInput.checked
  };
  saveConfig(config);
  void applyConfig(config);
});

supaLoginBtn.addEventListener('click', async () => {
  if (!supabaseConfig?.enabled){
    setStatus('Enable Supabase sync before signing in.', 'error');
    return;
  }
  if (!supabaseClient){
    setStatus('Provide a valid Supabase URL, anon key, and table, then save.', 'error');
    return;
  }
  const email = supaEmailInput.value.trim();
  const password = supaPasswordInput.value;
  if (!email || !password){
    setStatus('Enter both email and password to sign in.', 'error');
    return;
  }
  setStatus('Signing in to Supabase…', 'pending');
  const { error, data } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error){
    console.error('Supabase sign-in failed', error);
    setStatus(`Sign in failed: ${error.message}`, 'error');
    return;
  }
  supaPasswordInput.value = '';
  const user = data?.user;
  if (user){
    setAuthUser(user);
    const safeEmail = user.email ?? 'Supabase user';
    setStatus(`Signed in as ${safeEmail}. Rolls will sync to “${supabaseConfig.table}”.`, 'success');
  }
});

supaLogoutBtn.addEventListener('click', async () => {
  if (!supabaseClient){
    setStatus('Supabase is not configured yet.', 'error');
    return;
  }
  setStatus('Signing out of Supabase…', 'pending');
  const { error } = await supabaseClient.auth.signOut();
  if (error){
    console.error('Supabase sign-out failed', error);
    setStatus(`Sign out failed: ${error.message}`, 'error');
    return;
  }
  setAuthUser(null);
  setStatus('Signed out of Supabase. Sign in to continue syncing.', 'default');
});

// first render (empty)
renderHistory();
const initialConfig = loadConfig();
void applyConfig(initialConfig);
