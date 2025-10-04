const STORAGE_KEY = 'todo.advanced.v1';

// elements (shared)
const listView = document.getElementById('list-view');
const calView  = document.getElementById('cal-view');
const viewListBtn = document.getElementById('view-list');
const viewCalBtn  = document.getElementById('view-cal');

const listEl = document.getElementById('list');
const form = document.getElementById('new-form');
const titleInput = document.getElementById('title');
const dueInput = document.getElementById('due');
const prioInput = document.getElementById('priority');
const catInput = document.getElementById('category');
const notesInput = document.getElementById('notes');

const qInput = document.getElementById('q');
const statusSel = document.getElementById('filter-status');
const catSel = document.getElementById('filter-cat');
const sortSel = document.getElementById('sort');

const clearDoneBtn = document.getElementById('clear-done');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('import-file');

const summaryEl = document.getElementById('summary');
const itemTmpl = document.getElementById('item-tmpl');
const editTmpl = document.getElementById('edit-tmpl');

// calendar els
const calGrid = document.getElementById('cal-grid');
const calTitle = document.getElementById('cal-title');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const calToday = document.getElementById('cal-today');

// state
let items = load();
let ui = {
  view: 'list',
  filter: { q: '', status: 'all', cat: 'all', sort: 'due_asc' },
  month: startOfMonth(new Date())
};

// ---------- storage ----------
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()); }
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

// ---------- item logic ----------
function addItem({title, due, priority, category, notes}){
  items.push({
    id: uid(),
    title: title.trim(),
    due: due || '',
    priority: parseInt(priority,10),
    category: (category||'').trim() || 'General',
    notes: (notes||'').trim(),
    done: false,
    createdAt: Date.now()
  });
  save(); render();
}
function toggleItem(id){
  items = items.map(it => it.id===id ? {...it, done:!it.done} : it);
  save(); render();
}
function deleteItem(id){
  items = items.filter(it => it.id!==id);
  save(); render();
}
function isOverdue(it){
  if (!it.due || it.done) return false;
  const today = new Date();
  const d = new Date(it.due + 'T23:59:59');
  return d < today;
}
function prioLabel(p){ return p===1?'High':p===2?'Medium':'Low'; }
function fmtDue(due){
  if (!due) return 'No due date';
  const d = new Date(due+'T00:00:00');
  return d.toLocaleDateString();
}

// ---------- filters & sorting ----------
function sortItems(list, sortKey){
  const copy = [...list];
  switch (sortKey){
    case 'due_asc': return copy.sort((a,b)=> (a.due||'9999').localeCompare(b.due||'9999') || a.priority-b.priority );
    case 'due_desc': return copy.sort((a,b)=> (b.due||'').localeCompare(a.due||'') || a.priority-b.priority );
    case 'priority_desc': return copy.sort((a,b)=> a.priority - b.priority);
    case 'priority_asc':  return copy.sort((a,b)=> b.priority - a.priority);
    case 'alpha_asc': return copy.sort((a,b)=> a.title.localeCompare(b.title));
    case 'alpha_desc': return copy.sort((a,b)=> b.title.localeCompare(a.title));
    case 'created_desc': return copy.sort((a,b)=> b.createdAt - a.createdAt);
    case 'created_asc': return copy.sort((a,b)=> a.createdAt - b.createdAt);
    default: return copy;
  }
}
function updateCatFilterOptions(){
  const cats = Array.from(new Set(items.map(it => it.category))).sort();
  catSel.innerHTML = '<option value="all">All categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}
function applyFilters(){
  const q = ui.filter.q.toLowerCase();
  let list = items.filter(it => {
    const matchesQ = !q || it.title.toLowerCase().includes(q) || it.notes.toLowerCase().includes(q) || it.category.toLowerCase().includes(q);
    const matchesStatus = ui.filter.status==='all' ||
      (ui.filter.status==='active' && !it.done) ||
      (ui.filter.status==='done' && it.done) ||
      (ui.filter.status==='overdue' && isOverdue(it));
    const matchesCat = (ui.filter.cat==='all') || (it.category.toLowerCase()===ui.filter.cat.toLowerCase());
    return matchesQ && matchesStatus && matchesCat;
  });
  return sortItems(list, ui.filter.sort);
}

// ---------- list view ----------
function renderList(){
  const list = applyFilters();
  updateCatFilterOptions();
  listEl.innerHTML = '';
  for (const it of list){
    const node = itemTmpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = it.id;
    if (it.done) node.classList.add('done');
    if (isOverdue(it)) node.classList.add('overdue');
    node.querySelector('input[type=checkbox]').checked = !!it.done;
    node.querySelector('.title').textContent = it.title;
    node.querySelector('.badge.cat').textContent = it.category;
    const pr = node.querySelector('.badge.prio');
    pr.textContent = prioLabel(it.priority);
    pr.dataset.v = it.priority;
    node.querySelector('.due').textContent = fmtDue(it.due);
    node.querySelector('.notes').textContent = it.notes || '';
    listEl.appendChild(node);
  }
  const total = items.length;
  const done = items.filter(i=>i.done).length;
  const overdue = items.filter(i=>isOverdue(i)).length;
  summaryEl.textContent = `Total: ${total} · Completed: ${done} · Overdue: ${overdue}`;
}

// ---------- calendar ----------
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function ymd(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
function monthSpanDays(monthDate){
  const first = startOfMonth(monthDate);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = [];
  for (let i=0;i<42;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    days.push(d);
  }
  return days;
}
function tasksOnDate(dateStr){ return items.filter(it => it.due === dateStr); }

function renderCalendar(){
  const month = ui.month;
  const monthLabel = month.toLocaleString(undefined, { month:'long', year:'numeric' });
  calTitle.textContent = monthLabel;

  while (calGrid.children.length > 7) calGrid.removeChild(calGrid.lastChild);

  const days = monthSpanDays(month);
  const thisMonth = month.getMonth();
  const todayStr = ymd(new Date());

  for (const d of days){
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    const dstr = ymd(d);
    if (d.getMonth() !== thisMonth) cell.classList.add('out');
    if (dstr === todayStr) cell.classList.add('today');

    const dnum = document.createElement('div');
    dnum.className = 'dnum';
    dnum.textContent = d.getDate();

    const chips = document.createElement('div');
    chips.className = 'chips';
    const ts = tasksOnDate(dstr);
    ts.slice(0,2).forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (t.done ? ' done' : '');
      chip.textContent = `${t.title} (${prioLabel(t.priority)[0]})`;
      chips.appendChild(chip);
    });
    if (ts.length > 2){
      const more = document.createElement('div');
      more.className = 'more';
      more.textContent = `+${ts.length - 2} more`;
      chips.appendChild(more);
    }

    cell.appendChild(dnum);
    cell.appendChild(chips);
    cell.addEventListener('click', () => {
      dueInput.value = dstr;
      titleInput.focus();
    });
    calGrid.appendChild(cell);
  }
}

// ---------- render ----------
function render(){
  if (ui.view === 'list'){
    listView.classList.remove('hidden');
    calView.classList.add('hidden');
    viewListBtn.classList.add('active');
    viewCalBtn.classList.remove('active');
    renderList();
  } else {
    listView.classList.add('hidden');
    calView.classList.remove('hidden');
    viewCalBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    renderCalendar();
  }
}

// ---------- events ----------
form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  addItem({ title, due: dueInput.value, priority: prioInput.value, category: catInput.value, notes: notesInput.value });
  form.reset();
  prioInput.value = '2';
  titleInput.focus();
});

listEl.addEventListener('click', (e)=>{
  const itemEl = e.target.closest('.item'); if (!itemEl) return;
  const id = itemEl.dataset.id;
  const act = e.target.dataset.action || e.target.getAttribute('data-action');
  if (act==='toggle') toggleItem(id);
  if (act==='delete') deleteItem(id);
  if (act==='edit'){
    const it = items.find(x=>x.id===id);
    const wrap = editTmpl.content.firstElementChild.cloneNode(true);
    wrap.querySelector('[data-role=title]').value = it.title;
    wrap.querySelector('[data-role=due]').value = it.due;
    wrap.querySelector('[data-role=priority]').value = String(it.priority);
    wrap.querySelector('[data-role=category]').value = it.category;
    wrap.querySelector('[data-role=notes]').value = it.notes;
    itemEl.replaceChildren(wrap);
  }
  if (act==='save-edit'){
    const wrap = itemEl.querySelector('.editing');
    const data = {
      title: wrap.querySelector('[data-role=title]').value.trim(),
      due: wrap.querySelector('[data-role=due]').value,
      priority: parseInt(wrap.querySelector('[data-role=priority]').value,10),
      category: wrap.querySelector('[data-role=category]').value.trim() || 'General',
      notes: wrap.querySelector('[data-role=notes]').value.trim(),
    };
    items = items.map(x=> x.id===id ? {...x, ...data} : x);
    save(); render();
  }
  if (act==='cancel-edit'){ render(); }
});

qInput.addEventListener('input', ()=>{ ui.filter.q = qInput.value; render(); });
statusSel.addEventListener('change', ()=>{ ui.filter.status = statusSel.value; render(); });
catSel.addEventListener('change', ()=>{ ui.filter.cat = catSel.value; render(); });
sortSel.addEventListener('change', ()=>{ ui.filter.sort = sortSel.value; render(); });

clearDoneBtn.addEventListener('click', ()=>{
  if (confirm('Clear all completed tasks?')){
    items = items.filter(it=>!it.done);
    save(); render();
  }
});

// ---------- Export to CSV ----------
exportBtn.addEventListener('click', () => {
  const rows = applyFilters();
  const pLabel = (p) => (p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low');
  const header = ['Title','Due','Priority','Category','Notes','Done','Created At'];
  const lines = [header.join(',')];

  rows.forEach(it => {
    const created = new Date(it.createdAt || Date.now()).toLocaleString();
    const vals = [
      it.title || '',
      it.due || '',
      pLabel(Number(it.priority || 2)),
      it.category || 'General',
      (it.notes || '').replace(/"/g,'""'),
      it.done ? 'Yes' : 'No',
      created
    ];
    lines.push(vals.map(v => `"${String(v)}"`).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'todo-export.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// ---------- Import JSON ----------
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    if (Array.isArray(data)){
      items = data.map(d => ({
        id: d.id || uid(),
        title: String(d.title||'').trim(),
        due: d.due || '',
        priority: Number(d.priority||2),
        category: String(d.category||'General'),
        notes: String(d.notes||''),
        done: !!d.done,
        createdAt: Number(d.createdAt||Date.now())
      }));
      save(); render();
    } else { alert('Invalid file'); }
  } catch { alert('Could not parse JSON'); }
  importFile.value = '';
});

// ---------- calendar controls ----------
viewListBtn.addEventListener('click', ()=>{ ui.view='list'; render(); });
viewCalBtn.addEventListener('click', ()=>{ ui.view='calendar'; render(); });
calPrev.addEventListener('click', ()=>{ ui.month = addMonths(ui.month, -1); render(); });
calNext.addEventListener('click', ()=>{ ui.month = addMonths(ui.month, 1); render(); });
calToday.addEventListener('click', ()=>{ ui.month = startOfMonth(new Date()); render(); });

// ---------- init ----------
render();
