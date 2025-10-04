// ============= Elements =============
const fileInput = document.getElementById('fileInput');
const addBtn = document.getElementById('addBtn');
const clearBtn = document.getElementById('clearBtn');

const audio = document.getElementById('audio');
const trackTitle = document.getElementById('trackTitle');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const seek = document.getElementById('seek');

const prevBtn = document.getElementById('prevBtn');
const playBtn = document.getElementById('playBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');

const muteBtn = document.getElementById('muteBtn');
const volume = document.getElementById('volume');

const playlistEl = document.getElementById('playlist');

// ============= State =============
let tracks = []; // [{name, url, file?, duration?}]
let index = -1;
let isPlaying = false;
let shuffle = JSON.parse(localStorage.getItem('mp.shuffle') ?? 'false');
let repeat = JSON.parse(localStorage.getItem('mp.repeat') ?? 'false');

// keep object URLs to revoke on clear
let objectUrls = [];

// ============= Helpers =============
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
};
const setPressed = (btn, val) => btn.setAttribute('aria-pressed', String(!!val));

// ============= Playlist =============
function addFiles(fileList){
  const arr = Array.from(fileList).filter(f => f.type.startsWith('audio/'));
  const newTracks = arr.map(f => {
    const url = URL.createObjectURL(f);
    objectUrls.push(url);
    return { name: f.name.replace(/\.[^.]+$/,''), url, file: f, duration: NaN };
  });
  tracks = tracks.concat(newTracks);
  renderPlaylist();
  if (index === -1 && tracks.length) {
    load(0);
  }
}

function clearPlaylist(){
  tracks = [];
  index = -1;
  isPlaying = false;
  audio.pause();
  trackTitle.textContent = 'No track loaded';
  seek.value = 0;
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playlistEl.innerHTML = '';
  // revoke object urls
  objectUrls.forEach(u => URL.revokeObjectURL(u));
  objectUrls = [];
}

function renderPlaylist(){
  playlistEl.innerHTML = '';
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'track';
    li.draggable = true;
    li.dataset.idx = i;
    li.innerHTML = `
      <span class="handle">☰</span>
      <span class="name">${t.name}</span>
      <span class="dur">${Number.isFinite(t.duration) ? fmtTime(t.duration) : '--:--'}</span>
    `;
    if (i === index) li.classList.add('active');

    // play on click
    li.addEventListener('click', (e) => {
      if (e.target.closest('.handle')) return; // ignore handle clicks
      if (i === index) {
        togglePlay();
      } else {
        load(i, true);
      }
    });

    // drag & drop
    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', i.toString());
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = i;
      if (from === to) return;
      const moved = tracks.splice(from, 1)[0];
      tracks.splice(to, 0, moved);

      // adjust current index after reorder
      if (index === from) index = to;
      else if (from < index && to >= index) index -= 1;
      else if (from > index && to <= index) index += 1;

      renderPlaylist();
    });

    playlistEl.appendChild(li);
  });
  // reflect toggle states
  setPressed(shuffleBtn, shuffle);
  setPressed(repeatBtn, repeat);
}

// ============= Player core =============
function load(i, autoplay = false){
  index = i;
  const t = tracks[index];
  if (!t) return;

  audio.src = t.url;
  trackTitle.textContent = t.name || `Track ${index+1}`;
  currentTimeEl.textContent = '0:00';
  seek.value = 0;

  // Once metadata loads, show duration and optionally autoplay
  audio.addEventListener('loadedmetadata', onMetaOnce, { once: true });
  function onMetaOnce(){
    durationEl.textContent = fmtTime(audio.duration);
    seek.max = Math.max(1, audio.duration || 1);
    tracks[index].duration = audio.duration;
    renderPlaylist(); // update duration text
    if (autoplay) play();
  }

  highlightActive();
}

function highlightActive(){
  document.querySelectorAll('.track').forEach((li, i) => {
    li.classList.toggle('active', i === index);
  });
}

function play(){
  if (index < 0 && tracks.length) load(0);
  if (index < 0) return;
  audio.play();
  isPlaying = true;
  playBtn.textContent = '⏸';
}
function pause(){
  audio.pause();
  isPlaying = false;
  playBtn.textContent = '▶️';
}
function togglePlay(){ isPlaying ? pause() : play(); }

function next(){
  if (!tracks.length) return;
  if (shuffle){
    let r;
    if (tracks.length === 1) r = 0;
    else {
      do { r = Math.floor(Math.random() * tracks.length); } while (r === index);
    }
    load(r, true);
  } else {
    const ni = (index + 1) % tracks.length;
    if (ni === 0 && !repeat) { pause(); audio.currentTime = 0; highlightActive(); return; }
    load(ni, true);
  }
}
function prev(){
  if (!tracks.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const pi = (index - 1 + tracks.length) % tracks.length;
  load(pi, true);
}

// ============= Events =============
// file add
addBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value=''; });
clearBtn.addEventListener('click', () => { if (confirm('Clear playlist?')) clearPlaylist(); });

// drag & drop onto page
document.addEventListener('dragover', (e)=> e.preventDefault());
document.addEventListener('drop', (e)=> {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

// playback
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);

shuffleBtn.addEventListener('click', () => {
  shuffle = !shuffle; localStorage.setItem('mp.shuffle', JSON.stringify(shuffle));
  setPressed(shuffleBtn, shuffle);
});
repeatBtn.addEventListener('click', () => {
  repeat = !repeat; localStorage.setItem('mp.repeat', JSON.stringify(repeat));
  setPressed(repeatBtn, repeat);
});

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? '🔇' : '🔈';
});
volume.addEventListener('input', () => {
  audio.volume = parseFloat(volume.value);
  if (audio.volume === 0 && !audio.muted) audio.muted = true;
  if (audio.volume > 0 && audio.muted) audio.muted = false;
  muteBtn.textContent = audio.muted ? '🔇' : '🔈';
});

// seek
seek.addEventListener('input', () => {
  if (!isFinite(audio.duration)) return;
  const t = parseFloat(seek.value);
  audio.currentTime = t;
});

// time update
audio.addEventListener('timeupdate', () => {
  if (isFinite(audio.duration)) {
    seek.max = Math.max(1, audio.duration);
    seek.value = audio.currentTime;
  }
  currentTimeEl.textContent = fmtTime(audio.currentTime);
});
audio.addEventListener('ended', () => {
  if (repeat && !shuffle && index === tracks.length - 1){
    load(0, true); // loop playlist
  } else if (repeat && tracks.length === 1){
    load(0, true); // single track loop
  } else {
    next();
  }
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); togglePlay(); break;     // Space
    case 'k': togglePlay(); break;
    case 'j': prev(); break;
    case 'l': next(); break;
    case 's': shuffleBtn.click(); break;
    case 'r': repeatBtn.click(); break;
    case 'm': muteBtn.click(); break;
    case 'arrowleft': audio.currentTime = Math.max(0, audio.currentTime - 5); break;
    case 'arrowright': audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); break;
    case 'arrowup': volume.value = Math.min(1, parseFloat(volume.value) + 0.05).toFixed(2); volume.dispatchEvent(new Event('input')); break;
    case 'arrowdown': volume.value = Math.max(0, parseFloat(volume.value) - 0.05).toFixed(2); volume.dispatchEvent(new Event('input')); break;
  }
});

// init UI
setPressed(shuffleBtn, shuffle);
setPressed(repeatBtn, repeat);
