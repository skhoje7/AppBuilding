const hexEl = document.getElementById('hex');
const rgbEl = document.getElementById('rgb');
const contrastEl = document.getElementById('contrast');
const favEl = document.getElementById('favorites');

const btnRandom = document.getElementById('random');
const btnCopy = document.getElementById('copy');
const btnLock = document.getElementById('lock');
const btnAdd = document.getElementById('add');
const btnClear = document.getElementById('clear');

const STORAGE_KEY = 'bgcolor.favs.v1';

let locked = false;
let current = '#ffffff';

function rand255(){ return Math.floor(Math.random()*256); }
function toHex(n){ return n.toString(16).padStart(2,'0'); }
function rgbToHex(r,g,b){ return '#' + toHex(r)+toHex(g)+toHex(b); }
function hexToRgb(hex){
  const v = hex.replace('#','');
  const r = parseInt(v.slice(0,2),16);
  const g = parseInt(v.slice(2,4),16);
  const b = parseInt(v.slice(4,6),16);
  return {r,g,b};
}

function pickRandom(){
  if (locked) return;
  const r = rand255(), g = rand255(), b = rand255();
  setColor(rgbToHex(r,g,b));
}

function luminance({r,g,b}){
  // relative luminance (sRGB) per WCAG
  const srgb = [r,g,b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
}
function contrastRatio(fg, bg){
  const L1 = luminance(fg), L2 = luminance(bg);
  const [bright, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (bright + 0.05) / (dark + 0.05);
}
function bestTextColor(bgHex){
  const white = {r:255,g:255,b:255};
  const black = {r:0,g:0,b:0};
  const bg = hexToRgb(bgHex);
  const cw = contrastRatio(white, bg);
  const cb = contrastRatio(black, bg);
  return cw >= cb ? '#ffffff' : '#000000';
}
function ratingForContrast(cr){
  // Simple hint: >= 7 AAA, >= 4.5 AA, else A-
  if (cr >= 7) return 'AAA';
  if (cr >= 4.5) return 'AA';
  return 'A-';
}

function setColor(hex){
  current = hex.toLowerCase();
  const {r,g,b} = hexToRgb(current);
  document.body.style.background = current;
  const text = bestTextColor(current);
  document.body.style.color = text;
  hexEl.textContent = current;
  rgbEl.textContent = `rgb(${r}, ${g}, ${b})`;
  const cr = contrastRatio(hexToRgb(text), {r,g,b});
  contrastEl.textContent = ratingForContrast(cr);
}

function copyHex(){
  navigator.clipboard.writeText(current).then(()=>{
    btnCopy.textContent = 'Copied!';
    setTimeout(()=>btnCopy.textContent='Copy HEX', 800);
  });
}

function toggleLock(){
  locked = !locked;
  btnLock.textContent = locked ? 'Locked' : 'Lock';
}

function loadFavs(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; }
  catch { return []; }
}
function saveFavs(f){ localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); }

let favs = loadFavs();

function addFavorite(){
  if (!favs.includes(current)){
    favs.unshift(current);
    if (favs.length > 24) favs.pop();
    saveFavs(favs); renderFavs();
  }
}
function removeFavorite(hex){
  favs = favs.filter(c => c !== hex);
  saveFavs(favs); renderFavs();
}
function renderFavs(){
  favEl.innerHTML = '';
  favs.forEach(hex => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.innerHTML = `
      <div class="color"></div>
      <div class="meta">
        <span>${hex}</span>
        <div>
          <button data-act="apply" data-hex="${hex}">Use</button>
          <button data-act="del" data-hex="${hex}">Del</button>
        </div>
      </div>`;
    sw.querySelector('.color').style.background = hex;
    sw.addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-act');
      const hx = e.target.getAttribute('data-hex');
      if (act === 'apply') setColor(hx);
      if (act === 'del') removeFavorite(hx);
    });
    favEl.appendChild(sw);
  });
}

btnRandom.addEventListener('click', pickRandom);
btnCopy.addEventListener('click', copyHex);
btnLock.addEventListener('click', toggleLock);
btnAdd.addEventListener('click', addFavorite);
btnClear.addEventListener('click', () => { favs=[]; saveFavs(favs); renderFavs(); });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space'){ e.preventDefault(); pickRandom(); }
  if (e.key.toLowerCase() === 'c'){ copyHex(); }
});

// init
renderFavs();
setColor('#ffffff');
