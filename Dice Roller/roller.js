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
const supaHistoryTable = document.getElementById('supabase-remote-history');
const supaHistoryTbody = supaHistoryTable?.querySelector('tbody') ?? null;
const supaTrendState = document.getElementById('supabase-trend-state');
const supaTrendCanvasWrap = document.querySelector('.supabase-trend-canvas');
const supaTrendCanvas = document.getElementById('supabase-trend-chart');
const supaTrendToggleButtons = document.querySelectorAll('[data-trend-metric]');

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
let trendMetric = 'total';
let trendChart = null;
let chartModulePromise = null;

function loadChartGlobal(){
  if (typeof window === 'undefined'){
    return Promise.reject(new Error('Chart.js global loader requires a browser environment.'));
  }

  if (window.Chart){
    return Promise.resolve({ Chart: window.Chart });
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-chartjs-loader]');
    if (existing){
      existing.addEventListener('load', () => {
        if (window.Chart){
          resolve({ Chart: window.Chart });
        } else {
          reject(new Error('Chart.js global failed to initialize.'));
        }
      }, { once: true });
      existing.addEventListener('error', () => {
        reject(new Error('Chart.js global script failed to load.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.chartjsLoader = 'true';
    script.addEventListener('load', () => {
      if (window.Chart){
        resolve({ Chart: window.Chart });
      } else {
        reject(new Error('Chart.js global failed to initialize.'));
      }
    }, { once: true });
    script.addEventListener('error', () => {
      reject(new Error('Chart.js global script failed to load.'));
    }, { once: true });
    document.head.appendChild(script);
  });
}

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

function setTrendState(message, tone = 'default'){
  if (supaTrendState){
    if (message){
      supaTrendState.textContent = message;
      if (tone === 'default'){
        supaTrendState.removeAttribute('data-tone');
      } else {
        supaTrendState.setAttribute('data-tone', tone);
      }
      supaTrendState.hidden = false;
    } else {
      supaTrendState.textContent = '';
      supaTrendState.removeAttribute('data-tone');
      supaTrendState.hidden = true;
    }
  }
  if (supaTrendCanvasWrap){
    supaTrendCanvasWrap.hidden = true;
  }
}

function destroyTrendChart(){
  if (trendChart){
    trendChart.destroy();
    trendChart = null;
  }
}

async function loadChartModule(){
  if (!chartModulePromise){
    chartModulePromise = (async () => {
      try {
        return await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.esm.js');
      } catch (error){
        console.warn('Falling back to Chart.js UMD build after ESM load failure.', error);
        return await loadChartGlobal();
      }
    })();
  }

  try {
    return await chartModulePromise;
  } catch (error){
    chartModulePromise = null;
    throw error;
  }
}

async function ensureTrendChart(){
  if (!supaTrendCanvas) return null;
  const module = await loadChartModule();
  const { Chart, registerables } = module;
  if (!Chart){
    throw new Error('Chart.js library unavailable.');
  }
  if (registerables?.length && typeof Chart.register === 'function'){
    Chart.register(...registerables);
  }
  if (!trendChart){
    trendChart = new Chart(supaTrendCanvas, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Roll Total',
            data: [],
            backgroundColor: 'rgba(79, 70, 229, 0.7)',
            borderRadius: 6,
            maxBarThickness: 48
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: '#4b5563',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8
            },
            grid: {
              display: false
            }
          },
          y: {
            ticks: {
              color: '#4b5563'
            },
            beginAtZero: true,
            grid: {
              color: 'rgba(229, 231, 235, 0.6)'
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#1f2937'
            }
          }
        },
        animation: {
          duration: 250
        }
      }
    });
  }
  return trendChart;
}

function computeTrendPoints(metric){
  if (!remoteHistory.length) return { labels: [], values: [] };

  const entries = [];
  for (const record of remoteHistory){
    const when = record.rolled_at ? new Date(record.rolled_at) : null;
    if (!when || Number.isNaN(when.getTime())) continue;

    let totalValue = null;
    if (record.total !== null && record.total !== undefined){
      const parsed = Number(record.total);
      totalValue = Number.isNaN(parsed) ? null : parsed;
    }

    let averageValue = null;
    if (record.average !== null && record.average !== undefined){
      const parsedAvg = Number(record.average);
      averageValue = Number.isNaN(parsedAvg) ? null : parsedAvg;
    }

    if ((metric === 'total' && totalValue === null) || (metric === 'average' && averageValue === null)){
      if (Array.isArray(record.values) && record.values.length){
        const computedTotal = record.values.reduce((sum, val) => sum + Number(val || 0), 0);
        if (!Number.isNaN(computedTotal)){
          totalValue = computedTotal;
          averageValue = computedTotal / record.values.length;
        }
      } else if (typeof record.values === 'string' && record.values.length){
        const cleaned = record.values.replace(/[{}]/g, '');
        const pieces = cleaned ? cleaned.split(',').map((part) => Number(part.trim())).filter((num) => !Number.isNaN(num)) : [];
        if (pieces.length){
          const computedTotal = pieces.reduce((sum, val) => sum + val, 0);
          totalValue = computedTotal;
          averageValue = computedTotal / pieces.length;
        }
      }
    }

    const value = metric === 'total' ? totalValue : averageValue;
    if (value === null || Number.isNaN(value)) continue;

    const datePart = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    entries.push({
      when,
      label: `${datePart}\n${timePart}`,
      value: metric === 'total' ? value : Number(value.toFixed(2))
    });
  }

  entries.sort((a, b) => a.when.getTime() - b.when.getTime());

  return {
    labels: entries.map((entry) => entry.label),
    values: entries.map((entry) => entry.value)
  };
}

async function refreshTrendChart(){
  if (!supaTrendCanvasWrap || !supaTrendCanvas) return;

  if (remoteHistoryLoading){
    setTrendState('Loading saved rolls…', 'pending');
    return;
  }

  if (!remoteHistory.length){
    destroyTrendChart();
    setTrendState('No saved rolls found yet. Roll some dice to create history.');
    return;
  }

  const { labels, values } = computeTrendPoints(trendMetric);

  if (!labels.length){
    destroyTrendChart();
    setTrendState('Saved rolls are missing valid data for charting.', 'error');
    return;
  }

  let chart;
  try {
    chart = await ensureTrendChart();
  } catch (error){
    console.error('Failed to prepare trend chart', error);
    setTrendState('Unable to load chart library.', 'error');
    destroyTrendChart();
    return;
  }

  if (!chart){
    setTrendState('Unable to load chart library.', 'error');
    destroyTrendChart();
    return;
  }

  setTrendState(null);
  supaTrendCanvasWrap.hidden = false;

  const datasetLabel = trendMetric === 'total' ? 'Roll Total' : 'Roll Average';

  chart.data.labels = labels;
  chart.data.datasets[0].label = datasetLabel;
  chart.data.datasets[0].data = values;
  if (trendMetric === 'average'){
    chart.options.scales.y.beginAtZero = true;
  }
  chart.update();
}

function updateTrendToggleButtons(){
  for (const button of supaTrendToggleButtons){
    const metric = button.dataset.trendMetric;
    const isActive = metric === trendMetric;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function resetRemoteHistory(message){
  remoteHistory = [];
  remoteHistoryLoaded = false;
  remoteHistoryLoading = false;
  if (message){
    setHistoryState(message);
    setTrendState(message);
  } else if (supaHistoryState){
    supaHistoryState.hidden = true;
    setTrendState(null);
  }
  destroyTrendChart();
}

function renderRemoteHistory(){
  if (!supaHistoryTable || !supaHistoryTbody) return;
  supaHistoryTbody.innerHTML = '';
  if (!remoteHistory.length){
    setHistoryState('No saved rolls found yet. Roll some dice to create history.');
    void refreshTrendChart();
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

  void refreshTrendChart();
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
  setTrendState('Loading saved rolls…', 'pending');

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
    setTrendState(`Unable to load saved rolls: ${error.message}`, 'error');
    destroyTrendChart();
  } finally {
    remoteHistoryLoading = false;
  }
}

function setAuthUser(user){
  supabaseUser = user;
  if (!user){
    resetRemoteHistory('Sign in on the settings page to view your saved rolls.');
  } else if (activeSupabaseTab === 'history' || activeSupabaseTab === 'trends'){
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
    } else if (target === 'trends'){
      void loadRemoteHistory();
      if (remoteHistoryLoaded){
        void refreshTrendChart();
      }
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

for (const button of supaTrendToggleButtons){
  button.addEventListener('click', () => {
    const metric = button.dataset.trendMetric;
    if (!metric || metric === trendMetric) return;
    trendMetric = metric;
    updateTrendToggleButtons();
    void refreshTrendChart();
  });
}

if (supaTrendToggleButtons.length){
  updateTrendToggleButtons();
}

if (supaHistoryState){
  setHistoryState('Enable sync and sign in from the settings page to view your saved rolls.');
}

if (supaTrendState){
  setTrendState('Enable sync and sign in from the settings page to view charts of your saved rolls.');
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
