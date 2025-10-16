import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { loadConfig, isConfigComplete, STORAGE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supaStatus = document.getElementById('supabase-status');
const supaTrendState = document.getElementById('supabase-trend-state');
const supaTrendCanvasWrap = document.querySelector('.supabase-trend-canvas');
const supaTrendCanvas = document.getElementById('supabase-trend-chart');
const supaTrendToggleButtons = document.querySelectorAll('[data-trend-metric]');

let supabaseConfig = null;
let supabaseClient = null;
let supabaseUser = null;
let supabaseAuthSubscription = null;
let statusTimer = null;
let remoteHistory = [];
let remoteHistoryLoaded = false;
let remoteHistoryLoading = false;
let trendMetric = 'total';
let trendChart = null;
let chartModulePromise = null;
let chartLibraryInitialized = false;

const trendValueLabelPlugin = {
  id: 'trendValueLabel',
  afterDatasetsDraw(chart, args, pluginOptions){
    const meta = chart.getDatasetMeta(0);
    if (!meta || meta.hidden) return;

    const dataset = chart.data.datasets?.[meta.index ?? 0];
    if (!dataset || !Array.isArray(meta.data)) return;

    const options = {
      color: '#1f2937',
      offset: 6,
      font: {
        size: 12,
        family: 'system-ui,Segoe UI,Roboto,Helvetica,Arial'
      },
      formatValue: (value) => value
    };

    const config = {
      ...options,
      ...(pluginOptions || {})
    };

    const fontSize = config.font?.size ?? 12;
    const fontFamily = config.font?.family ?? 'system-ui,Segoe UI,Roboto,Helvetica,Arial';
    const offset = typeof config.offset === 'number' ? config.offset : 6;

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = config.color ?? '#1f2937';
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (let index = 0; index < meta.data.length; index += 1){
      const element = meta.data[index];
      if (!element || element.hidden || element.skip) continue;

      const rawValue = dataset.data?.[index];
      if (rawValue === undefined || rawValue === null) continue;

      const formatted = config.formatValue ? config.formatValue(rawValue, index, chart) : rawValue;
      if (formatted === undefined || formatted === null) continue;

      const text = typeof formatted === 'number' ? String(formatted) : `${formatted}`;
      if (!text.length) continue;

      const position = element.tooltipPosition();
      let y = position.y - offset;
      const minY = chartArea.top + fontSize;
      if (y < minY){
        y = minY;
      }

      ctx.fillText(text, position.x, y);
    }

    ctx.restore();
  }
};

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
  if (!chartLibraryInitialized){
    if (registerables?.length && typeof Chart.register === 'function'){
      Chart.register(...registerables);
    }
    if (typeof Chart.register === 'function'){
      Chart.register(trendValueLabelPlugin);
    }
    chartLibraryInitialized = true;
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
          },
          tooltip: {
            callbacks: {
              label(context){
                const value = context.parsed?.y;
                if (value === null || value === undefined) return context.label || '';
                if (trendMetric === 'average'){
                  return `${context.dataset.label}: ${Number(value).toFixed(2)}`;
                }
                return `${context.dataset.label}: ${value}`;
              }
            }
          },
          trendValueLabel: {
            formatValue(value){
              if (value === null || value === undefined) return '';
              if (typeof value === 'number' && trendMetric === 'average'){
                return Number(value).toFixed(2);
              }
              return value;
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
  chart.options.plugins = chart.options.plugins ?? {};
  chart.options.plugins.trendValueLabel = chart.options.plugins.trendValueLabel ?? {};
  chart.options.plugins.trendValueLabel.formatValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && trendMetric === 'average'){
      return Number(value).toFixed(2);
    }
    return value;
  };
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
    setTrendState(message);
  } else {
    setTrendState(null);
  }
  destroyTrendChart();
}

function setAuthUser(user){
  supabaseUser = user;
  if (!user){
    resetRemoteHistory('Sign in on the settings page to view charts of your saved rolls.');
  } else if (remoteHistoryLoaded){
    void loadRemoteHistory(true);
  } else {
    void loadRemoteHistory();
  }
}

async function loadRemoteHistory(force = false){
  if (!supaTrendCanvasWrap || !supaTrendCanvas) return;
  if (!supabaseConfig?.enabled){
    resetRemoteHistory('Enable sync from the settings page to view charts of your saved rolls.');
    return;
  }
  if (!supabaseClient){
    resetRemoteHistory('Save your Supabase settings to view charts of your saved rolls.');
    return;
  }
  if (!supabaseUser){
    resetRemoteHistory('Sign in on the settings page to view charts of your saved rolls.');
    return;
  }
  if (remoteHistoryLoading) return;
  if (remoteHistoryLoaded && !force) return;

  remoteHistoryLoading = true;
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
    await refreshTrendChart();
  } catch (error){
    console.error('Failed to load Supabase history', error);
    setTrendState(`Unable to load saved rolls: ${error.message}`, 'error');
    destroyTrendChart();
    remoteHistoryLoaded = false;
    remoteHistory = [];
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
    resetRemoteHistory('Enable sync from the settings page to view charts of your saved rolls.');
    return;
  }

  if (!isConfigComplete(config)){
    setStatus('Supabase sync is enabled, but the table name is missing. Update the settings page.', 'error');
    resetRemoteHistory('Add a table name on the settings page to view charts of your saved rolls.');
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
      await loadRemoteHistory(true);
    } else {
      setStatus('Supabase connection ready. Sign in from the settings page to sync rolls.', 'pending');
      resetRemoteHistory('Sign in on the settings page to view charts of your saved rolls.');
    }
  } catch (error){
    console.error('Failed to create Supabase client', error);
    setStatus(`Supabase setup failed: ${error.message}`, 'error');
    supabaseClient = null;
    setAuthUser(null);
    resetRemoteHistory('Supabase setup failed. Update your settings and try again.');
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

const initialConfig = loadConfig();
void applyConfig(initialConfig);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY){
    const updatedConfig = loadConfig();
    void applyConfig(updatedConfig);
  }
});

