// ==== Storage Keys ====
const STORAGE_KEY = "expense-tracker-data-v1";

// ==== State ====
let expenses = []; // {id, date(YYYY-MM-DD), category, description, amount(Number)}
let filters = { month: "", category: "", text: "" };

// ==== Elements ====
const form = document.getElementById("expense-form");
const formTitle = document.getElementById("form-title");
const dateEl = document.getElementById("date");
const categoryEl = document.getElementById("category");
const descEl = document.getElementById("description");
const amountEl = document.getElementById("amount");
const editingIdEl = document.getElementById("editing-id");
const resetBtn = document.getElementById("reset-btn");

const tbody = document.getElementById("expense-tbody");
const emptyState = document.getElementById("empty-state");

const filterMonth = document.getElementById("filter-month");
const filterCategory = document.getElementById("filter-category");
const filterText = document.getElementById("filter-text");

const sumTotal = document.getElementById("sum-total");
const categoryIds = ["Food","Transport","Shopping","Housing","Utilities","Health","Entertainment","Other"];
const sumByCatEls = Object.fromEntries(categoryIds.map(c => [c, document.getElementById(`sum-${c}`)]));

const exportCsvBtn = document.getElementById("export-csv");
const exportJsonBtn = document.getElementById("export-json");
const importFileInput = document.getElementById("import-file");
const clearAllBtn = document.getElementById("clear-all");

// ==== Utilities ====
const fmtCurrency = (n) => (n ?? 0).toLocaleString(undefined, {style:"currency", currency:"USD"});
const uid = () => crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2);

// ==== Persistence ====
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) expenses = JSON.parse(raw);
  } catch(e) { console.error("Failed to load", e); }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

// ==== Render ====
function applyFilters(list) {
  return list.filter(x => {
    const okMonth = !filters.month || (x.date && x.date.startsWith(filters.month));
    const okCat = !filters.category || x.category === filters.category;
    const okText = !filters.text || x.description.toLowerCase().includes(filters.text.toLowerCase());
    return okMonth && okCat && okText;
  });
}

function renderTable() {
  const rows = applyFilters(expenses)
    .sort((a,b) => (a.date || "").localeCompare(b.date || ""))
    .map(x => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${x.date || ""}</td>
        <td>${x.category}</td>
        <td>${escapeHtml(x.description)}</td>
        <td class="right">${fmtCurrency(x.amount)}</td>
        <td>
          <div class="actions">
            <button class="action edit" data-id="${x.id}">Edit</button>
            <button class="action delete" data-id="${x.id}">Delete</button>
          </div>
        </td>
      `;
      return tr;
    });

  tbody.innerHTML = "";
  rows.forEach(r => tbody.appendChild(r));
  emptyState.style.display = rows.length ? "none" : "block";
}

function renderSummary() {
  const filtered = applyFilters(expenses);
  const totals = { total: 0 };
  categoryIds.forEach(c => totals[c] = 0);
  for (const e of filtered) {
    totals.total += e.amount;
    if (totals[e.category] !== undefined) totals[e.category] += e.amount;
  }
  sumTotal.textContent = fmtCurrency(totals.total);
  categoryIds.forEach(c => sumByCatEls[c].textContent = fmtCurrency(totals[c]));
}

function renderAll() {
  renderTable();
  renderSummary();
}

// ==== Helpers ====
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function resetForm() {
  form.reset();
  editingIdEl.value = "";
  formTitle.textContent = "Add Expense";
  dateEl.value = new Date().toISOString().slice(0,10); // today
}
function getFormData() {
  const date = dateEl.value;
  const category = categoryEl.value.trim();
  const description = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  if (!date || !category || !description || isNaN(amount) || amount < 0) return null;
  return { date, category, description, amount };
}

// ==== CRUD ====
function addExpense(data){
  expenses.push({ id: uid(), ...data });
  save(); renderAll(); resetForm();
}
function updateExpense(id, data){
  const i = expenses.findIndex(x => x.id === id);
  if (i >= 0) {
    expenses[i] = { ...expenses[i], ...data };
    save(); renderAll(); resetForm();
  }
}
function deleteExpense(id){
  expenses = expenses.filter(x => x.id !== id);
  save(); renderAll();
}

// ==== Events: Form ====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = getFormData();
  if (!data) return alert("Please fill all fields with a non-negative amount.");
  const editingId = editingIdEl.value;
  if (editingId) updateExpense(editingId, data);
  else addExpense(data);
});

resetBtn.addEventListener("click", (e) => {
  e.preventDefault();
  resetForm();
});

// ==== Events: Table (edit/delete) ====
tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains("edit")) {
    const exp = expenses.find(x => x.id === id);
    if (!exp) return;
    formTitle.textContent = "Edit Expense";
    dateEl.value = exp.date;
    categoryEl.value = exp.category;
    descEl.value = exp.description;
    amountEl.value = exp.amount;
    editingIdEl.value = exp.id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (btn.classList.contains("delete")) {
    if (confirm("Delete this expense?")) deleteExpense(id);
  }
});

// ==== Events: Filters ====
filterMonth.addEventListener("input", () => { filters.month = filterMonth.value; renderAll(); });
filterCategory.addEventListener("input", () => { filters.category = filterCategory.value; renderAll(); });
filterText.addEventListener("input", () => { filters.text = filterText.value.trim(); renderAll(); });

// ==== Export / Import ====
exportCsvBtn.addEventListener("click", () => {
  const rows = [["date","category","description","amount"]];
  for (const e of applyFilters(expenses)) {
    rows.push([e.date, e.category, e.description.replaceAll('"','""'), e.amount]);
  }
  const csv = rows.map(r => r.map(x => /[",\n]/.test(String(x)) ? `"${String(x)}"` : String(x)).join(",")).join("\n");
  download("expenses.csv", csv, "text/csv");
});

exportJsonBtn.addEventListener("click", () => {
  const payload = JSON.stringify(applyFilters(expenses), null, 2);
  download("expenses.json", payload, "application/json");
});

importFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    let imported = [];
    if (file.name.endsWith(".json")) {
      imported = JSON.parse(text);
    } else if (file.name.endsWith(".csv")) {
      imported = parseCsv(text);
    } else {
      throw new Error("Unsupported file type");
    }
    // Normalize + assign ids
    const cleaned = imported
      .map(x => ({
        id: uid(),
        date: (x.date || x.Date || "").slice(0,10),
        category: x.category || x.Category || "Other",
        description: x.description || x.Description || "",
        amount: Number(x.amount ?? x.Amount ?? 0)
      }))
      .filter(x => x.date && x.description && !isNaN(x.amount));
    expenses = expenses.concat(cleaned);
    save(); renderAll();
    alert(`Imported ${cleaned.length} expenses.`);
  } catch (err) {
    console.error(err);
    alert("Failed to import. Please provide a valid JSON or CSV exported from this app.");
  } finally {
    importFileInput.value = "";
  }
});

clearAllBtn.addEventListener("click", () => {
  if (!expenses.length) return;
  if (confirm("This will delete ALL expenses in storage. Continue?")) {
    expenses = [];
    save(); renderAll(); resetForm();
  }
});

// Helpers for download / CSV
function download(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}
function parseCsv(csv){
  // simple CSV (comma, quotes, newlines)
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines.shift());
  const idx = Object.fromEntries(header.map((h,i)=>[h.trim().toLowerCase(), i]));
  return lines.map(line => {
    const cells = splitCsvLine(line);
    return {
      date: cells[idx["date"]] || "",
      category: cells[idx["category"]] || "",
      description: cells[idx["description"]] || "",
      amount: cells[idx["amount"]] || ""
    };
  });
}
function splitCsvLine(line){
  const out=[]; let cur=""; let inQ=false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (inQ){
      if (ch === '"'){
        if (line[i+1] === '"'){ cur+='"'; i++; }
        else inQ=false;
      } else cur += ch;
    } else {
      if (ch === ','){ out.push(cur); cur=""; }
      else if (ch === '"'){ inQ=true; }
      else cur += ch;
    }
  }
  out.push(cur); return out;
}

// ==== Init ====
(function init(){
  load();
  resetForm();
  // Preselect current month in filter for a nice first experience
  const today = new Date();
  filterMonth.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  filters.month = filterMonth.value;
  renderAll();
})();
