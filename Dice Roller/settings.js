import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { loadConfig, saveConfig, isConfigComplete, STORAGE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supaForm = document.getElementById('supabase-form');
const supaTableInput = document.getElementById('supabase-table');
const supaSyncInput = document.getElementById('supabase-sync');
const supaEmailInput = document.getElementById('supabase-email');
const supaPasswordInput = document.getElementById('supabase-password');
const supaLoginBtn = document.getElementById('supabase-login');
const supaLogoutBtn = document.getElementById('supabase-logout');
const supaStatus = document.getElementById('supabase-status');

let supabaseConfig = null;
let supabaseClient = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;
let statusTimer = null;

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

function setAuthUser(user){
  supabaseUser = user;
  updateAuthUi();
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

function fillForm(config){
  supaTableInput.value = config.table;
  supaSyncInput.checked = Boolean(config.enabled);
  supaEmailInput.value = config.email ?? '';
  supaPasswordInput.value = '';
}

async function applyConfig(config){
  supabaseConfig = config;
  supabaseClient = null;
  supabaseUser = null;

  if (supabaseAuthSubscription){
    supabaseAuthSubscription.unsubscribe();
    supabaseAuthSubscription = null;
  }

  fillForm(config);

  if (!config.enabled){
    setStatus('Supabase sync is disabled. Save settings to enable it.', 'default');
    updateAuthUi();
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but the table name is missing.', 'error');
    updateAuthUi();
    return;
  }

  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
        const user = session?.user ?? null;
        setAuthUser(user);
        if (user){
          const email = user.email ?? 'Supabase user';
          setStatus(`Signed in as ${email}. Rolls will sync to “${supabaseConfig.table}”.`, 'success');
        }
      }
    });

    supabaseAuthSubscription = subscription;
    updateAuthUi();

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const user = session?.user ?? null;
    setAuthUser(user);
    if (user){
      const email = user.email ?? 'Supabase user';
      setStatus(`Signed in as ${email}. Rolls will sync to “${config.table}”.`, 'success');
    } else {
      setStatus('Supabase connection ready. Sign in below to sync rolls.', 'pending');
    }
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
    supabaseClient = null;
    setAuthUser(null);
  }
}

supaForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const config = {
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
    setStatus('Save the Supabase settings to initialize the connection before signing in.', 'error');
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

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY){
    const config = loadConfig();
    void applyConfig(config);
  }
});

const initialConfig = loadConfig();
void applyConfig(initialConfig);
updateAuthUi();
