const WEEKS_PER_YEAR = 52;

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
const gridLayoutElement = document.getElementById("gridLayout");
const gridElement = document.getElementById("grid");
const axisWeeksElement = document.getElementById("axis-weeks");
const axisYearsElement = document.getElementById("axis-years");
const legendElement = document.getElementById("legend");
const summaryElement = document.getElementById("summary");
const legendTemplate = document.getElementById("legend-item-template");
const summaryTemplate = document.getElementById("summary-item-template");
const categoryForm = document.getElementById("categoryForm");
const categoryNameInput = document.getElementById("newCategoryName");
const categoryColorInput = document.getElementById("newCategoryColor");
const categoryDescriptionInput = document.getElementById("newCategoryDescription");
const categoryListElement = document.getElementById("categoryList");
const weekSelectionElement = document.getElementById("weekSelection");
const selectedWeekLabelElement = document.getElementById("selectedWeekLabel");
const selectedWeekRangeElement = document.getElementById("selectedWeekRange");
const selectedWeekStatusElement = document.getElementById("selectedWeekStatus");
const clearWeekButton = document.getElementById("clearWeekButton");
const categoryPickerElement = document.getElementById("categoryPicker");
const tabButtons = document.querySelectorAll('[data-tab-target]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');

let categories = [];
let state = {
    birthdate: "",
    lifespan: 90,
    weeks: {}
};

let selectedWeekIndex = null;

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
            state = {
                ...state,
                birthdate: typeof saved.birthdate === "string" ? saved.birthdate : state.birthdate,
                lifespan:
                    typeof saved.lifespan === "number" && Number.isFinite(saved.lifespan)
                        ? saved.lifespan
                        : state.lifespan,
                weeks: saved.weeks ?? {}
            };
        }
        if (!Array.isArray(saved?.categories)) {
            categories = [...DEFAULT_CATEGORIES];
        } else {
            categories = saved.categories.map((category) => ({ ...category }));
        }
        if (categories.length === 0) {
            categories = [...DEFAULT_CATEGORIES];
        }
    } catch (error) {
        console.error("Failed to load saved state", error);
        categories = [...DEFAULT_CATEGORIES];
    }
}

function saveState() {
    const payload = {
        ...state,
        categories
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function renderCategoryPicker(activeCategoryId = null) {
    if (!categoryPickerElement) return;

    categoryPickerElement.innerHTML = "";

    if (categories.length === 0) {
        const empty = document.createElement("p");
        empty.className = "category-picker__empty";
        empty.textContent = "Add a category to start assigning weeks.";
        categoryPickerElement.append(empty);
        return;
    }

    categories.forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "category-picker__option";
        button.dataset.categoryId = category.id;
        button.setAttribute("aria-pressed", category.id === activeCategoryId ? "true" : "false");
        if (category.id === activeCategoryId) {
            button.dataset.selected = "true";
        }

        const swatch = document.createElement("span");
        swatch.className = "category-picker__swatch";
        swatch.style.backgroundColor = category.color;
        button.append(swatch);

        const label = document.createElement("span");
        label.className = "category-picker__label";
        label.textContent = category.label;
        button.append(label);

        if (category.description) {
            button.title = category.description;
        }

        button.addEventListener("click", () => {
            if (selectedWeekIndex === null) return;
            assignCategoryToWeek(selectedWeekIndex, category.id);
        });

        categoryPickerElement.append(button);
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

function renderCategoryList() {
    if (!categoryListElement) return;

    categoryListElement.innerHTML = "";

    const counts = new Map();
    Object.values(state.weeks).forEach((value) => {
        if (!value?.categoryId) return;
        counts.set(value.categoryId, (counts.get(value.categoryId) ?? 0) + 1);
    });

    categories.forEach((category) => {
        const item = document.createElement("li");
        item.className = "category-card";

        const swatch = document.createElement("span");
        swatch.className = "category-card__swatch";
        swatch.style.backgroundColor = category.color;
        item.append(swatch);

        const content = document.createElement("div");
        content.className = "category-card__content";
        item.append(content);

        const header = document.createElement("div");
        header.className = "category-card__header";
        content.append(header);

        const title = document.createElement("h3");
        title.className = "category-card__title";
        title.textContent = category.label;
        header.append(title);

        if (categories.length > 1) {
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => handleRemoveCategory(category.id));
            header.append(removeButton);
        }

        const assigned = counts.get(category.id);
        if (assigned) {
            const usage = document.createElement("p");
            usage.className = "category-card__meta";
            usage.textContent = `${assigned} assigned week${assigned === 1 ? "" : "s"}`;
            content.append(usage);
        }

        if (category.description) {
            const description = document.createElement("p");
            description.className = "category-card__description";
            description.textContent = category.description;
            content.append(description);
        }

        categoryListElement.append(item);
    });
}

function sanitizeId(label) {
    return label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
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

function clearWeeksForCategory(categoryId) {
    let removed = false;
    Object.keys(state.weeks).forEach((index) => {
        if (state.weeks[index]?.categoryId === categoryId) {
            delete state.weeks[index];
            removed = true;
        }
    });

    return removed;
}

function handleCategoryFormSubmit(event) {
    event.preventDefault();
    if (!categoryNameInput) return;

    const label = categoryNameInput.value.trim();
    if (!label) return;

    const color = categoryColorInput?.value ?? "#6366f1";
    const description = categoryDescriptionInput?.value.trim() ?? "";

    let baseId = sanitizeId(label);
    if (!baseId) {
        baseId = "category";
    }
    let id = baseId;
    let suffix = 2;
    while (categories.some((category) => category.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
    }

    const category = {
        id,
        label,
        color,
        description
    };

    categories = [...categories, category];
    renderLegend();
    renderCategoryList();
    renderSummary();

    if (selectedWeekIndex !== null) {
        assignCategoryToWeek(selectedWeekIndex, category.id);
    } else {
        renderCategoryPicker();
        saveState();
    }

    categoryForm?.reset();
    if (categoryColorInput) {
        categoryColorInput.value = color;
    }
    if (categoryNameInput) {
        categoryNameInput.focus();
    }
}

function handleRemoveCategory(categoryId) {
    if (categories.length <= 1) {
        alert("Keep at least one category to continue assigning weeks.");
        return;
    }

    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    const confirmed = window.confirm(
        `Remove "${category.label}"? Any weeks using this category will be cleared.`
    );

    if (!confirmed) return;

    categories = categories.filter((item) => item.id !== categoryId);
    clearWeeksForCategory(categoryId);
    renderCategoryPicker();
    renderLegend();
    renderCategoryList();
    renderGrid();
    renderSummary();
    saveState();
}

function getWeekPosition(index) {
    const year = Math.floor(index / WEEKS_PER_YEAR);
    const week = (index % WEEKS_PER_YEAR) + 1;
    return { year, week };
}

function getWeekDates(index) {
    if (!state.birthdate) return null;
    const birth = new Date(state.birthdate);
    if (Number.isNaN(birth.valueOf())) return null;

    const start = new Date(birth);
    start.setDate(start.getDate() + index * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return { start, end };
}

function weekTooltip(index) {
    const { year, week } = getWeekPosition(index);
    const parts = [`Week ${index + 1} of your life`, `Year ${year + 1} · Week ${week}`];
    const dates = getWeekDates(index);

    if (dates) {
        const formatter = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
        const startLabel = formatter.format(dates.start);
        const endLabel = formatter.format(dates.end);
        parts.push(`${startLabel} – ${endLabel}`);
    }

    return parts.join(" • ");
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

function renderAxes(totalWeeks, currentWeekIndex) {
    if (!gridLayoutElement || !axisWeeksElement || !axisYearsElement) return;

    const totalYears = Math.ceil(totalWeeks / WEEKS_PER_YEAR);
    gridLayoutElement.style.setProperty("--year-count", String(totalYears));
    gridLayoutElement.style.setProperty("--weeks-per-year", String(WEEKS_PER_YEAR));

    axisWeeksElement.innerHTML = "";
    axisYearsElement.innerHTML = "";

    const currentYear = currentWeekIndex !== null ? Math.floor(currentWeekIndex / WEEKS_PER_YEAR) : null;
    const currentWeek = currentWeekIndex !== null ? (currentWeekIndex % WEEKS_PER_YEAR) + 1 : null;

    for (let week = 1; week <= WEEKS_PER_YEAR; week += 1) {
        const label = document.createElement("span");
        label.className = "axis-label";
        if (week === WEEKS_PER_YEAR || (week - 1) % 4 === 0) {
            label.textContent = String(week);
        } else {
            label.classList.add("axis-label--empty");
        }

        if (currentWeek !== null && week === currentWeek) {
            label.classList.add("axis-label--current");
        }

        axisWeeksElement.append(label);
    }

    for (let year = 0; year < totalYears; year += 1) {
        const label = document.createElement("span");
        label.className = "axis-label";
        label.textContent = `Age ${year}`;

        if (currentYear !== null && year === currentYear) {
            label.classList.add("axis-label--current");
        }

        axisYearsElement.append(label);
    }
}

function renderGrid() {
    if (!gridElement) return;
    gridElement.innerHTML = "";
    const totalWeeks = Math.max(1, Math.round(state.lifespan * WEEKS_PER_YEAR));
    const currentWeekIndex = getCurrentWeekIndex();

    if (selectedWeekIndex !== null && selectedWeekIndex >= totalWeeks) {
        selectedWeekIndex = null;
    }

    renderAxes(totalWeeks, currentWeekIndex);

    for (let index = 0; index < totalWeeks; index += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "week";
        cell.dataset.index = index;
        const { year } = getWeekPosition(index);
        cell.dataset.year = String(year);
        const tooltip = weekTooltip(index);
        cell.title = tooltip;
        cell.setAttribute("aria-label", `${tooltip}. Select to assign a category.`);

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

        cell.addEventListener("click", () => selectWeek(index));
        cell.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectWeek(index);
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

    updateSelectedWeekHighlight();
    updateWeekSelectionPanel();
}

function updateSelectedWeekHighlight() {
    if (!gridElement) return;
    gridElement.querySelectorAll(".week[data-selected]").forEach((cell) => {
        cell.removeAttribute("data-selected");
    });

    if (selectedWeekIndex === null) return;
    const activeCell = gridElement.querySelector(`.week[data-index="${selectedWeekIndex}"]`);
    if (activeCell) {
        activeCell.dataset.selected = "true";
    }
}

function selectWeek(index) {
    const wasActive = selectedWeekIndex === index;
    selectedWeekIndex = wasActive ? null : index;
    updateSelectedWeekHighlight();
    updateWeekSelectionPanel();

    if (!wasActive && selectedWeekIndex !== null) {
        const settingsPanel = document.querySelector('[data-tab-panel="settings"]');
        if (settingsPanel?.hidden) {
            activateTab("settings");
        }
        if (weekSelectionElement) {
            weekSelectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        const firstCategoryButton = categoryPickerElement?.querySelector("button");
        if (firstCategoryButton) {
            firstCategoryButton.focus();
        } else {
            clearWeekButton?.focus();
        }
    }
}

function updateWeekSelectionPanel() {
    if (!weekSelectionElement) return;

    if (selectedWeekIndex === null) {
        weekSelectionElement.hidden = true;
        renderCategoryPicker();
        if (selectedWeekLabelElement) {
            selectedWeekLabelElement.textContent = "";
        }
        if (selectedWeekRangeElement) {
            selectedWeekRangeElement.textContent = "";
            selectedWeekRangeElement.hidden = true;
        }
        if (selectedWeekStatusElement) {
            selectedWeekStatusElement.textContent = "";
        }
        if (clearWeekButton) {
            clearWeekButton.disabled = true;
        }
        return;
    }

    weekSelectionElement.hidden = false;

    if (selectedWeekLabelElement) {
        const { year, week } = getWeekPosition(selectedWeekIndex);
        selectedWeekLabelElement.textContent = `Week ${selectedWeekIndex + 1} • Year ${year + 1}, Week ${week}`;
    }

    if (selectedWeekRangeElement) {
        const dates = getWeekDates(selectedWeekIndex);
        if (dates) {
            const formatter = new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
            selectedWeekRangeElement.textContent = `${formatter.format(dates.start)} – ${formatter.format(dates.end)}`;
            selectedWeekRangeElement.hidden = false;
        } else {
            selectedWeekRangeElement.textContent = "";
            selectedWeekRangeElement.hidden = true;
        }
    }

    const saved = state.weeks[selectedWeekIndex];
    const savedCategory = saved ? categories.find((category) => category.id === saved.categoryId) : undefined;

    renderCategoryPicker(savedCategory?.id ?? null);

    if (clearWeekButton) {
        clearWeekButton.disabled = !saved;
    }

    if (selectedWeekStatusElement) {
        if (savedCategory) {
            selectedWeekStatusElement.textContent = `Assigned to ${savedCategory.label}.`;
        } else {
            selectedWeekStatusElement.textContent = "Not assigned. Choose a category below.";
        }
    }
}

function assignCategoryToWeek(index, categoryId) {
    const category = categories.find((cat) => cat.id === categoryId);
    if (!category) return;

    state.weeks[index] = {
        categoryId,
        color: category.color
    };

    saveState();
    updateWeekCell(index);
    renderSummary();
    renderCategoryList();
    updateWeekSelectionPanel();
}

function clearWeek(index) {
    if (state.weeks[index]) {
        delete state.weeks[index];
        saveState();
        updateWeekCell(index);
        renderSummary();
        renderCategoryList();
        updateWeekSelectionPanel();
    }
}

function updateWeekCell(index) {
    const cell = gridElement.querySelector(`.week[data-index="${index}"]`);
    if (!cell) return;

    const saved = state.weeks[index];
    const tooltip = weekTooltip(index);
    cell.title = tooltip;
    if (saved) {
        const category = categories.find((cat) => cat.id === saved.categoryId);
        cell.style.backgroundColor = category?.color ?? saved.color;
        cell.setAttribute(
            "aria-label",
            `${tooltip}. Assigned to ${category?.label ?? "custom"}. Select to change or clear the category.`
        );
    } else {
        cell.style.removeProperty("background-color");
        cell.setAttribute("aria-label", `${tooltip}. Select to assign a category.`);
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

function hydrateControls() {
    if (state.birthdate) {
        birthdateInput.value = state.birthdate;
    }
    if (state.lifespan) {
        lifespanInput.value = state.lifespan;
    }
}

function activateTab(target) {
    if (!target) return;
    tabButtons.forEach((button) => {
        const isActive = button.dataset.tabTarget === target;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
        button.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    tabPanels.forEach((panel) => {
        const isActive = panel.dataset.tabPanel === target;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
        panel.setAttribute("aria-hidden", String(!isActive));
    });
}

function init() {
    loadState();
    renderCategoryPicker();
    renderLegend();
    renderCategoryList();
    hydrateControls();
    renderGrid();
    renderSummary();

    birthdateInput.addEventListener("change", handleBirthdateChange);
    lifespanInput.addEventListener("change", handleLifespanChange);
    categoryForm?.addEventListener("submit", handleCategoryFormSubmit);
    clearWeekButton?.addEventListener("click", () => {
        if (selectedWeekIndex !== null) {
            clearWeek(selectedWeekIndex);
        }
    });

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
    });

    const defaultTab = document.querySelector(".tab.is-active");
    if (defaultTab) {
        activateTab(defaultTab.dataset.tabTarget);
    }
}

init();
