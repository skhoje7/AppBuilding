const DEFAULT_CATEGORIES = [
    {
        id: "milestone",
        label: "Milestones & Achievements",
        color: "#fbbf24",
        description: "Graduations, promotions, big goals accomplished or important life events."
    },
    {
        id: "growth",
        label: "Growth & Learning",
        color: "#60a5fa",
        description: "Weeks centered on skill-building, education, or personal development."
    },
    {
        id: "relationships",
        label: "Relationships & Connection",
        color: "#f472b6",
        description: "Time invested in family, friendships, and meaningful social connections."
    },
    {
        id: "health",
        label: "Health & Wellness",
        color: "#34d399",
        description: "Focus on physical and mental wellbeing, rest, and healthy habits."
    },
    {
        id: "adventure",
        label: "Adventure & Travel",
        color: "#fb923c",
        description: "Exploration, travel, and stepping outside the comfort zone."
    },
    {
        id: "craft",
        label: "Work & Craft",
        color: "#9ca3af",
        description: "Progress in career, craft, or deep work projects."
    },
    {
        id: "rest",
        label: "Rest & Recharge",
        color: "#a78bfa",
        description: "Intentional downtime, sabbaticals, and restorative breaks."
    },
    {
        id: "reflection",
        label: "Reflection & Planning",
        color: "#2dd4bf",
        description: "Journaling, retrospectives, and strategic planning for what's next."
    },
    {
        id: "resilience",
        label: "Challenge & Resilience",
        color: "#f87171",
        description: "Overcoming setbacks, difficult transitions, or resilience-building weeks."
    },
    {
        id: "creativity",
        label: "Creativity & Play",
        color: "#f472d0",
        description: "Art, play, and imaginative pursuits that spark joy."
    }
];

const STORAGE_KEY = "weeks-of-life-tracker";

const birthdateInput = document.getElementById("birthdate");
const lifespanInput = document.getElementById("lifespan");
const categorySelect = document.getElementById("category");
const customColorInput = document.getElementById("customColor");
const saveCustomColorButton = document.getElementById("saveCustomColor");
const gridElement = document.getElementById("grid");
const legendElement = document.getElementById("legend");
const summaryElement = document.getElementById("summary");
const legendTemplate = document.getElementById("legend-item-template");
const summaryTemplate = document.getElementById("summary-item-template");

let categories = [];
let state = {
    birthdate: "",
    lifespan: 90,
    weeks: {}
};

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
            state = {
                ...state,
                ...saved,
                weeks: saved.weeks ?? {}
            };
        }
        if (!Array.isArray(saved?.categories)) {
            categories = [...DEFAULT_CATEGORIES];
        } else {
            categories = mergeCategories(saved.categories);
        }
    } catch (error) {
        console.error("Failed to load saved state", error);
        categories = [...DEFAULT_CATEGORIES];
    }
}

function mergeCategories(savedCategories) {
    const savedMap = new Map(savedCategories.map((cat) => [cat.id, cat]));
    const merged = DEFAULT_CATEGORIES.map((cat) => savedMap.get(cat.id) ?? cat);

    savedCategories.forEach((cat) => {
        if (!merged.some((existing) => existing.id === cat.id)) {
            merged.push(cat);
        }
    });

    return merged;
}

function saveState() {
    const payload = {
        ...state,
        categories
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function populateCategorySelect() {
    categorySelect.innerHTML = "";
    categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.label;
        categorySelect.append(option);
    });
}

function renderLegend() {
    legendElement.innerHTML = "";
    categories.forEach((category) => {
        const fragment = legendTemplate.content.cloneNode(true);
        const item = fragment.querySelector(".legend-item");
        item.querySelector(".swatch").style.backgroundColor = category.color;
        item.querySelector(".label").textContent = category.label;
        item.querySelector(".description").textContent = category.description ?? "";
        legendElement.append(fragment);
    });
}

function renderSummary() {
    summaryElement.innerHTML = "";
    const counts = new Map();

    for (const [, value] of Object.entries(state.weeks)) {
        const key = value.categoryId;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    categories.forEach((category) => {
        if (!counts.has(category.id)) return;
        const fragment = summaryTemplate.content.cloneNode(true);
        const item = fragment.querySelector(".summary-item");
        item.querySelector(".swatch").style.backgroundColor = category.color;
        item.querySelector(".label").textContent = category.label;
        item.querySelector(".count").textContent = `${counts.get(category.id)} week(s)`;
        summaryElement.append(fragment);
    });

    if (summaryElement.children.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "Select a week and assign a category to see a summary.";
        emptyMessage.classList.add("empty");
        summaryElement.append(emptyMessage);
    }
}

function weekLabel(index) {
    const year = Math.floor(index / 52) + 1;
    const week = (index % 52) + 1;
    return `Year ${year}, Week ${week}`;
}

function getCurrentWeekIndex() {
    if (!state.birthdate) return null;
    const birth = new Date(state.birthdate);
    const now = new Date();
    if (Number.isNaN(birth.valueOf())) return null;
    const diff = now - birth;
    if (diff < 0) return null;
    const weekMs = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / weekMs);
}

function renderGrid() {
    gridElement.innerHTML = "";
    const totalWeeks = Math.max(1, Math.round(state.lifespan * 52));
    const currentWeekIndex = getCurrentWeekIndex();

    for (let index = 0; index < totalWeeks; index += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "week";
        cell.dataset.index = index;
        cell.title = weekLabel(index);
        cell.setAttribute("aria-label", `${weekLabel(index)}. Click to assign a category.`);

        const saved = state.weeks[index];
        if (saved) {
            const category = categories.find((cat) => cat.id === saved.categoryId);
            cell.style.backgroundColor = category?.color ?? saved.color;
        }

        if (currentWeekIndex !== null) {
            if (index === currentWeekIndex) {
                cell.dataset.current = "true";
            }
            if (index < currentWeekIndex) {
                cell.dataset.past = "true";
            }
        }

        cell.addEventListener("click", () => assignCategoryToWeek(index));
        cell.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                assignCategoryToWeek(index);
            } else if (event.key === "Backspace" || event.key === "Delete") {
                event.preventDefault();
                clearWeek(index);
            }
        });
        cell.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearWeek(index);
        });

        gridElement.append(cell);
    }
}

function assignCategoryToWeek(index) {
    const categoryId = categorySelect.value;
    const category = categories.find((cat) => cat.id === categoryId);
    if (!category) return;

    state.weeks[index] = {
        categoryId,
        color: category.color
    };

    saveState();
    updateWeekCell(index);
    renderSummary();
}

function clearWeek(index) {
    if (state.weeks[index]) {
        delete state.weeks[index];
        saveState();
        updateWeekCell(index);
        renderSummary();
    }
}

function updateWeekCell(index) {
    const cell = gridElement.querySelector(`.week[data-index="${index}"]`);
    if (!cell) return;

    const saved = state.weeks[index];
    if (saved) {
        const category = categories.find((cat) => cat.id === saved.categoryId);
        cell.style.backgroundColor = category?.color ?? saved.color;
        cell.setAttribute("aria-label", `${weekLabel(index)}. Assigned to ${category?.label ?? "custom"}.`);
    } else {
        cell.style.backgroundColor = "#e5e7eb";
        cell.setAttribute("aria-label", `${weekLabel(index)}. Click to assign a category.`);
    }
}

function handleBirthdateChange(event) {
    state.birthdate = event.target.value;
    saveState();
    renderGrid();
}

function handleLifespanChange(event) {
    const years = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(years) || years < 1) return;
    state.lifespan = years;
    saveState();
    renderGrid();
    renderSummary();
}

function handleSaveCustomColor() {
    const color = customColorInput.value;
    const label = prompt("Name this category", "Custom Week");
    if (!label) return;

    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const description = prompt("Add a short description (optional)", "");

    const existingIndex = categories.findIndex((cat) => cat.id === id);
    const category = {
        id: id || `custom-${Date.now()}`,
        label: label.trim(),
        color,
        description: description?.trim() ?? "Custom category"
    };

    if (existingIndex >= 0) {
        categories[existingIndex] = category;
    } else {
        categories.push(category);
    }

    populateCategorySelect();
    renderLegend();
    saveState();
    categorySelect.value = category.id;
}

function hydrateControls() {
    if (state.birthdate) {
        birthdateInput.value = state.birthdate;
    }
    if (state.lifespan) {
        lifespanInput.value = state.lifespan;
    }
}

function init() {
    loadState();
    populateCategorySelect();
    renderLegend();
    hydrateControls();
    renderGrid();
    renderSummary();

    birthdateInput.addEventListener("change", handleBirthdateChange);
    lifespanInput.addEventListener("change", handleLifespanChange);
    saveCustomColorButton.addEventListener("click", handleSaveCustomColor);
}

init();
