// ---------- Elements ----------
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const locateBtn = document.getElementById('locate');
const unitsSel = document.getElementById('units');
const refreshBtn = document.getElementById('refresh');

const statusEl = document.getElementById('status');
const currentCard = document.getElementById('current');
const placeNameEl = document.getElementById('place-name');
const coordsEl = document.getElementById('coords');

const nowIconEl = document.getElementById('now-icon');
const nowTempEl = document.getElementById('now-temp');
const nowDescEl = document.getElementById('now-desc');
const nowFeelsEl = document.getElementById('now-feels');
const nowHumidityEl = document.getElementById('now-humidity');
const nowWindEl = document.getElementById('now-wind');
const nowPopEl = document.getElementById('now-pop');

const dailyEl = document.getElementById('daily');
const hourlyCanvas = document.getElementById('hourlyChart');

// ---------- State ----------
let state = {
  lat: null,
  lon: null,
  name: null,
  units: 'metric',
  chart: null
};

// ---------- Utils ----------
function showStatus(msg){ statusEl.textContent = msg; statusEl.classList.remove('hidden'); }
function hideStatus(){ statusEl.classList.add('hidden'); }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function pad(n){ return n < 10 ? '0'+n : ''+n; }
function toLocalHM(iso){ const d = new Date(iso); return pad(d.getHours())+':'+pad(d.getMinutes()); }
function weekday(iso){ return new Date(iso).toLocaleDateString(undefined,{weekday:'short'}); }
function mmdd(iso){ const d = new Date(iso); return (d.getMonth()+1)+'/'+d.getDate(); }

const WX = {
  // Open-Meteo weathercode mapping (simple emoji set)
  icon(code){
    if ([0].includes(code)) return '☀️';
    if ([1,2].includes(code)) return '🌤️';
    if ([3].includes(code)) return '☁️';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,56,57].includes(code)) return '🌦️';
    if ([61,63,65].includes(code)) return '🌧️';
    if ([66,67].includes(code)) return '🌧️❄️';
    if ([71,73,75,77].includes(code)) return '❄️';
    if ([80,81,82].includes(code)) return '🌧️';
    if ([85,86].includes(code)) return '❄️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '❓';
  },
  text(code){
    const map = {
      0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
      45:'Fog', 48:'Depositing rime fog',
      51:'Drizzle: light', 53:'Drizzle: moderate', 55:'Drizzle: dense',
      56:'Freezing drizzle: light', 57:'Freezing drizzle: dense',
      61:'Rain: slight', 63:'Rain: moderate', 65:'Rain: heavy',
      66:'Freezing rain: light', 67:'Freezing rain: heavy',
      71:'Snow fall: slight', 73:'Snow: moderate', 75:'Snow: heavy', 77:'Snow grains',
      80:'Rain showers: slight', 81:'Rain showers: moderate', 82:'Rain showers: violent',
      85:'Snow showers: slight', 86:'Snow showers: heavy',
      95:'Thunderstorm', 96:'Thunderstorm w/ slight hail', 99:'Thunderstorm w/ heavy hail'
    };
    return map[code] || '—';
  }
};

// ---------- API helpers (Open-Meteo; no key needed) ----------
async function geocode(query){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return (data.results || []).map(r => ({
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude
  }));
}

async function fetchWeather(lat, lon, units){
  const isMetric = units === 'metric';
  const tempUnit = isMetric ? 'celsius' : 'fahrenheit';
  const windUnit = isMetric ? 'ms' : 'mph';

  // Hourly for next 48h; daily for 7d
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,apparent_temperature,relativehumidity_2m,precipitation_probability,weathercode,windspeed_10m` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
    `&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Forecast fetch failed');
  return res.json();
}

// ---------- Render ----------
function renderCurrent(name, lat, lon, hourly, daily, units){
  // choose "now" as first hourly entry that is >= current time
  const nowIdx = Math.max(0, hourly.time.findIndex(t => new Date(t) >= new Date()));
  const t = hourly.temperature_2m[nowIdx] ?? hourly.temperature_2m[0];
  const feels = hourly.apparent_temperature[nowIdx] ?? t;
  const hum = hourly.relativehumidity_2m[nowIdx];
  const pop = hourly.precipitation_probability[nowIdx];
  const wcode = hourly.weathercode[nowIdx];
  const wind = hourly.windspeed_10m[nowIdx];

  placeNameEl.textContent = name;
  coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  nowIconEl.textContent = WX.icon(wcode);
  nowTempEl.textContent = `${Math.round(t)}° ${units === 'metric' ? 'C' : 'F'}`;
  nowDescEl.textContent = WX.text(wcode);
  nowFeelsEl.textContent = `${Math.round(feels)}°`;
  nowHumidityEl.textContent = `${hum}%`;
  nowWindEl.textContent = `${wind} ${units === 'metric' ? 'm/s' : 'mph'}`;
  nowPopEl.textContent = `${pop ?? 0}%`;

  show(currentCard);
}

function renderDaily(daily, units){
  dailyEl.innerHTML = '';
  const days = daily.time.length;
  for (let i = 0; i < days; i++){
    const code = daily.weathercode[i];
    const hi = Math.round(daily.temperature_2m_max[i]);
    const lo = Math.round(daily.temperature_2m_min[i]);
    const pop = daily.precipitation_probability_max[i];

    const day = document.createElement('div');
    day.className = 'day';
    day.innerHTML = `
      <div class="dw">${weekday(daily.time[i])}</div>
      <div class="d">${mmdd(daily.time[i])}</div>
      <div class="ic">${WX.icon(code)}</div>
      <div class="hi">${hi}° ${units==='metric'?'C':'F'}</div>
      <div class="lo">Low: ${lo}°</div>
      <div class="small muted">Precip: ${pop ?? 0}%</div>
    `;
    dailyEl.appendChild(day);
  }
}

function renderHourlyChart(hourly, units){
  // pick next 24 points from now
  const startIdx = Math.max(0, hourly.time.findIndex(t => new Date(t) >= new Date()));
  const labels = hourly.time.slice(startIdx, startIdx+24).map(toLocalHM);
  const temps = hourly.temperature_2m.slice(startIdx, startIdx+24);

  if (state.chart){ state.chart.destroy(); }
  state.chart = new Chart(hourlyCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Temperature (${units==='metric'?'°C':'°F'})`,
        data: temps,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: false }
      }
    }
  });
}

// ---------- Orchestration ----------
async function loadAndRender(){
  try{
    hideStatus();
    if (state.lat == null || state.lon == null) throw new Error('Pick a place or use your location first.');
    const data = await fetchWeather(state.lat, state.lon, state.units);
    renderCurrent(state.name, state.lat, state.lon, data.hourly, data.daily, state.units);
    renderDaily(data.daily, state.units);
    renderHourlyChart(data.hourly, state.units);
  } catch (err){
    showStatus(err.message || 'Something went wrong.');
  }
}

// ---------- Search UI ----------
let searchTimer = null;
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (!q){ suggestions.innerHTML=''; suggestions.classList.add('hidden'); return; }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try{
      const results = await geocode(q);
      if (!results.length){ suggestions.innerHTML='<div class="opt">No results</div>'; suggestions.classList.remove('hidden'); return; }
      suggestions.innerHTML = results.map(r => `<div class="opt" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name}">${r.name}</div>`).join('');
      suggestions.classList.remove('hidden');
    } catch{
      suggestions.innerHTML='<div class="opt">Search error</div>';
      suggestions.classList.remove('hidden');
    }
  }, 300);
});

suggestions.addEventListener('click', (e) => {
  const opt = e.target.closest('.opt'); if (!opt) return;
  const lat = parseFloat(opt.dataset.lat);
  const lon = parseFloat(opt.dataset.lon);
  const name = opt.dataset.name;
  state.lat = lat; state.lon = lon; state.name = name;
  suggestions.classList.add('hidden');
  searchInput.value = name;
  loadAndRender();
});

// hide suggestions on outside click
document.addEventListener('click', (e) => {
  if (!document.querySelector('.search-wrap').contains(e.target)){
    suggestions.classList.add('hidden');
  }
});

// ---------- Geolocation ----------
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation){ showStatus('Geolocation not supported in this browser.'); return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const {latitude:lat, longitude:lon} = pos.coords;
    state.lat = lat; state.lon = lon;
    // reverse geocode (best effort using same API)
    try{
      const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
      const r = await fetch(url); const j = await r.json();
      state.name = (j && j.results && j.results[0]) ?
        [j.results[0].name, j.results[0].admin1, j.results[0].country_code].filter(Boolean).join(', ')
        : 'Your location';
      searchInput.value = state.name;
    } catch{ state.name = 'Your location'; }
    loadAndRender();
  }, (err) => {
    showStatus(err.message || 'Could not get your location.');
  }, { enableHighAccuracy:true, timeout:10000 });
});

// ---------- Units + Refresh ----------
unitsSel.addEventListener('change', () => { state.units = unitsSel.value; loadAndRender(); });
refreshBtn.addEventListener('click', () => loadAndRender());

// ---------- First run ----------
showStatus('Type a city or use your location.');
