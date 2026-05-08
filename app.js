const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SATISFACTION_LABELS = {
  1: "Upset",
  2: "Okay",
  3: "Happy",
};


const els = {
  intro: document.getElementById("view-intro"),
  week: document.getElementById("view-week"),
  heroBox: document.getElementById("hero-box"),
  heroBoxImage: document.getElementById("hero-box-image"),
  introScene: document.getElementById("intro-scene"),
  weekGrid: document.getElementById("week-grid"),
  pullColumns: document.getElementById("pull-columns"),
  weekChaseStrip: document.getElementById("week-chase-strip"),
  weekTotalSpent: document.getElementById("week-total-spent"),
  weekSatisfactionImage: document.getElementById("week-satisfaction-image"),
  simBudgetSlider: document.getElementById("sim-budget-slider"),
  simBudgetValue: document.getElementById("sim-budget-value"),
  simMetricPulls: document.getElementById("sim-metric-pulls"),
  simMetricSpend: document.getElementById("sim-metric-spend"),
  simMetricSat: document.getElementById("sim-metric-sat"),
  simColorDots: document.getElementById("sim-color-dots"),
  simNote: document.getElementById("sim-note"),
  allChaseModal: document.getElementById("all-chase-modal"),
  allChaseModalContent: document.getElementById("all-chase-modal-content"),
  btnCloseAllChases: document.getElementById("btn-close-all-chases"),
  btnOpenAll: document.getElementById("btn-open-all"),
  introBlackout: document.getElementById("intro-blackout"),
};

let dataset = null;

let pullSlots = [];

let selectedDay = null;

let openAllMode = false;
let chaseFocusDay = DAYS[0];

const revealedPullsByDay = {};

function isPullRevealed(day, index) {
  return revealedPullsByDay[day]?.has(index) ?? false;
}

function markPullRevealed(day, index) {
  if (!revealedPullsByDay[day]) revealedPullsByDay[day] = new Set();
  revealedPullsByDay[day].add(index);
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function moodFromAverage(avg) {
  if (avg < 1.67) return "low";
  if (avg < 2.34) return "mid";
  return "high";
}

function costTier(cost) {
  const value = Number(cost);
  if (!Number.isFinite(value)) return "mid";
  if (value <= 6) return "low";
  if (value <= 18) return "mid";
  return "high";
}

function groupOpensByDay(opens) {
  const map = {};
  for (const d of DAYS) map[d] = [];
  for (const o of opens) {
    if (map[o.day]) map[o.day].push(o);
  }
  return map;
}

function formatMoney(n) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function renderTotalSpent() {
  if (!dataset || !els.weekTotalSpent) return;
  const byDay = groupOpensByDay(getActiveOpens());
  let total = 0;
  const revealedSatisfaction = [];
  for (const day of DAYS) {
    const revealed = revealedPullsByDay[day];
    if (!revealed || revealed.size === 0) continue;
    const opens = byDay[day];
    for (const idx of revealed) {
      const open = opens[idx];
      if (!open) continue;
      total += Number(open.cost || 0);
      revealedSatisfaction.push(Number(open.satisfaction) || 2);
    }
  }
  els.weekTotalSpent.textContent = `Total spent: ${formatMoney(total)}`;
  renderTotalSatisfactionImage(revealedSatisfaction);
}

function renderTotalSatisfactionImage(satisfactionValues) {
  if (!els.weekSatisfactionImage) return;
  if (!Array.isArray(satisfactionValues) || satisfactionValues.length === 0) {
    els.weekSatisfactionImage.src = "asset/normal.png";
    els.weekSatisfactionImage.alt = "Normal mood";
    return;
  }
  const avgSat = average(satisfactionValues);
  let src = "asset/happy.PNG";
  let alt = "Happy mood";

  if (avgSat < 1.67) {
    src = "asset/sad.PNG";
    alt = "Sad mood";
  } else if (avgSat < 2.34) {
    src = "asset/meh.PNG";
    alt = "Okay mood";
  }

  els.weekSatisfactionImage.src = src;
  els.weekSatisfactionImage.alt = alt;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleByWeight(items, rand) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return items[0]?.value;
  let pick = rand() * total;
  for (const item of items) {
    pick -= item.weight;
    if (pick <= 0) return item.value;
  }
  return items[items.length - 1]?.value;
}

function buildSimulationData(percent) {
  if (!dataset) return null;
  const actual = dataset.opens.map((open) => ({
    day: open.day,
    satisfaction: Number(open.satisfaction) || 2,
    cost: Number(open.cost) || 0,
    itemLabel: open.itemLabel,
    itemImage: open.itemImage || null,
    simulated: false,
  }));
  if (!actual.length) return { pulls: [], totalSpend: 0, avgSat: 0 };
  const dayWeights = DAYS.map((day) => ({
    value: day,
    weight: actual.filter((p) => p.day === day).length || 1,
  }));
  const rand = mulberry32(97 + percent * 13 + actual.length * 17);

  if (percent < 0) {
    const keepRatio = Math.max(0.05, 1 + percent / 100);
    const keepCount = Math.max(1, Math.round(actual.length * keepRatio));
    const cheapPool = actual.filter((p) => Number(p.cost) <= 5);
    const sourcePool = cheapPool.length ? cheapPool : [...actual].sort((a, b) => a.cost - b.cost).slice(0, 3);
    const kept = Array.from({ length: keepCount }, () => {
      const sample = sourcePool[Math.floor(rand() * sourcePool.length)] || sourcePool[0];
      return {
        day: sampleByWeight(dayWeights, rand),
        satisfaction: sample.satisfaction,
        cost: sample.cost,
        itemLabel: sample.itemLabel,
        itemImage: sample.itemImage || null,
        simulated: true,
      };
    });
    return {
      pulls: kept,
      totalSpend: kept.reduce((sum, p) => sum + Number(p.cost || 0), 0),
      avgSat: average(kept.map((p) => Number(p.satisfaction) || 2)),
    };
  }

  const extraCount = Math.round(actual.length * (percent / 100));
  const pullWeights = actual.map((pull, idx) => ({ value: idx, weight: 1 }));
  const simulated = Array.from({ length: extraCount }, () => {
    const sourceIdx = sampleByWeight(pullWeights, rand);
    const sample = actual[sourceIdx] || actual[0];
    return {
      day: sampleByWeight(dayWeights, rand),
      satisfaction: sample.satisfaction,
      cost: sample.cost,
      itemLabel: sample?.itemLabel || "Simulated pull",
      itemImage: sample?.itemImage || null,
      simulated: true,
    };
  });
  const pulls = [...actual, ...simulated];
  return {
    pulls,
    totalSpend: pulls.reduce((sum, p) => sum + Number(p.cost || 0), 0),
    avgSat: average(pulls.map((p) => Number(p.satisfaction) || 2)),
  };
}

function getSimulationPercent() {
  return Number(els.simBudgetSlider?.value || 0);
}

function getActiveOpens() {
  if (!dataset) return [];
  const result = buildSimulationData(getSimulationPercent());
  if (!result) return dataset.opens;
  return result.pulls.map((pull, i) => ({
    day: pull.day,
    satisfaction: pull.satisfaction,
    cost: pull.cost,
    itemLabel: pull.simulated ? `${pull.itemLabel} (Sim ${i + 1})` : pull.itemLabel,
    itemImage: pull.itemImage || undefined,
  }));
}

function renderSimulation() {
  if (!dataset || !els.simBudgetSlider) return;
  const percent = Number(els.simBudgetSlider.value || 0);
  const result = buildSimulationData(percent);
  if (!result) return;

  const pulls = result.pulls;
  els.simBudgetValue && (els.simBudgetValue.textContent = `${percent > 0 ? "+" : ""}${percent}%`);
  if (els.simMetricPulls) els.simMetricPulls.textContent = `Pulls: ${pulls.length}`;
  if (els.simMetricSpend) els.simMetricSpend.textContent = `Spend: ${formatMoney(result.totalSpend)}`;
  if (els.simMetricSat) els.simMetricSat.textContent = `Avg satisfaction: ${result.avgSat.toFixed(2)} / 3`;
  if (els.simColorDots) {
    els.simColorDots.innerHTML = "";
    const maxDots = 48;
    pulls.slice(0, maxDots).forEach((pull) => {
      const dot = document.createElement("span");
      dot.className = "sim-color-dot";
      dot.dataset.level = String(pull.satisfaction);
      els.simColorDots.appendChild(dot);
    });
  }

  if (els.simNote) {
    els.simNote.textContent =
      "Move slider to simulate spending less or more. Pull outcomes follow the real distribution, so spending more does not guarantee better results.";
  }
}

function wireSimulationSlider() {
  if (!els.simBudgetSlider) return;
  els.simBudgetSlider.addEventListener("input", () => {
    renderSimulation();
    clearPullStage();
    renderWeekGrid();
    if (openAllMode) {
      renderAllPullColumns();
    } else if (selectedDay) {
      renderPullColumn(selectedDay);
    }
  });
}

async function loadData() {
  const res = await fetch(new URL("./data/blindbox-data.json", import.meta.url));
  if (!res.ok) throw new Error("Could not load data/blindbox-data.json");
  dataset = await res.json();
  if (!dataset.chaseItemsByDay && dataset.chaseItems !== undefined) {
    dataset.chaseItemsByDay = {};
    const fallback = Array.isArray(dataset.chaseItems) ? [...dataset.chaseItems] : [];
    for (const d of DAYS) {
      dataset.chaseItemsByDay[d] = [...fallback];
    }
  }
  if (!dataset.chaseItemsByDay) {
    dataset.chaseItemsByDay = {};
    for (const d of DAYS) dataset.chaseItemsByDay[d] = [];
  }
}

function chaseItemsForDay(day) {
  if (!dataset?.chaseItemsByDay) return [];
  const arr = dataset.chaseItemsByDay[day];
  return Array.isArray(arr) ? arr : [];
}

function chaseImageSrc(item) {
  const raw = String(item || "").trim();
  if (!raw) return "";
  const noAt = raw.startsWith("@") ? raw.slice(1) : raw;
  if (noAt.includes("/")) return noAt.replace(/^\.\//, "");
  return `asset/chase/${noAt}`;
}

function normalizeKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function imageBasename(path) {
  const clean = String(path || "").split("?")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function guessChasePrice(src, day) {
  if (!dataset?.opens?.length) return null;
  const srcKey = normalizeKey(imageBasename(src));
  const sameDayOpens = dataset.opens.filter((o) => o.day === day);
  const allOpens = dataset.opens;

  const scoreMatch = (open) => {
    const imageKey = normalizeKey(imageBasename(open.itemImage || ""));
    const labelKey = normalizeKey(open.itemLabel || "");
    if (!srcKey) return false;
    return (
      imageKey.includes(srcKey) ||
      srcKey.includes(imageKey) ||
      labelKey.includes(srcKey) ||
      srcKey.includes(labelKey)
    );
  };

  let matched = sameDayOpens.filter(scoreMatch);
  if (!matched.length) matched = allOpens.filter(scoreMatch);
  if (matched.length) {
    return average(matched.map((m) => Number(m.cost) || 0));
  }

  if (sameDayOpens.length) {
    return average(sameDayOpens.map((m) => Number(m.cost) || 0));
  }
  return null;
}

function appendChaseImages(el, items, day) {
  const grid = document.createElement("div");
  grid.className = "chase-gallery";
  items.forEach((item, i) => {
    const src = chaseImageSrc(item);
    if (!src) return;
    const wrap = document.createElement("div");
    wrap.className = "chase-thumb-wrap";
    const img = document.createElement("img");
    img.className = "chase-thumb";
    img.src = src;
    img.alt = `${day} chase item ${i + 1}`;
    img.loading = "lazy";
    img.decoding = "async";
    if (/(hobchase|linkclickfelixbadge|linkclickcharlesbadge)\.png$/i.test(src)) {
      img.classList.add("chase-thumb--landscape");
    }
    const guessedPrice = guessChasePrice(src, day);
    const priceText = guessedPrice == null ? "Price: —" : `Price: ${formatMoney(guessedPrice)}`;
    const hoverPanel = document.createElement("div");
    hoverPanel.className = "chase-thumb__hover-panel";
    const previewImg = document.createElement("img");
    previewImg.className = "chase-thumb__hover-image";
    if (img.classList.contains("chase-thumb--landscape")) {
      previewImg.classList.add("chase-thumb__hover-image--landscape");
      hoverPanel.classList.add("chase-thumb__hover-panel--landscape");
    }
    previewImg.src = src;
    previewImg.alt = `${day} chase item ${i + 1} preview`;
    previewImg.loading = "lazy";
    previewImg.decoding = "async";
    const priceTag = document.createElement("div");
    priceTag.className = "chase-thumb__hover-price";
    priceTag.textContent = priceText;
    hoverPanel.appendChild(previewImg);
    hoverPanel.appendChild(priceTag);
    wrap.appendChild(img);
    wrap.appendChild(hoverPanel);
    grid.appendChild(wrap);
  });
  if (grid.childElementCount) {
    el.appendChild(grid);
  }
}

function appendChaseHeader(el, title, showAllButton) {
  const head = document.createElement("div");
  head.className = "chase-strip__head";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  head.appendChild(h3);
  if (showAllButton) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-chase chase-strip__all-btn";
    btn.textContent = "See all chases";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-controls", "all-chase-modal");
    btn.addEventListener("click", openAllChasesModal);
    head.appendChild(btn);
  }
  el.appendChild(head);
}

function fillChasePanel(el) {
  if (!dataset) return;
  el.innerHTML = "";

  if (openAllMode) {
    appendChaseHeader(el, "Chase targets", true);

    const tabs = document.createElement("div");
    tabs.className = "chase-day-tabs";
    for (const day of DAYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chase-day-tab";
      if (chaseFocusDay === day) btn.classList.add("is-active");
      btn.textContent = day.slice(0, 3);
      btn.setAttribute("aria-pressed", String(chaseFocusDay === day));
      btn.addEventListener("click", () => {
        chaseFocusDay = day;
        refreshChaseDisplays();
      });
      tabs.appendChild(btn);
    }
    el.appendChild(tabs);

    const items = chaseItemsForDay(chaseFocusDay);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "chase-empty";
      p.textContent = `No chase list for ${chaseFocusDay}.`;
      el.appendChild(p);
    } else {
      appendChaseImages(el, items, chaseFocusDay);
    }
    return;
  }

  if (selectedDay) {
    const items = chaseItemsForDay(selectedDay);
    appendChaseHeader(el, `Chasing on ${selectedDay}`, false);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "chase-empty";
      p.textContent = "No chase list for this day.";
      el.appendChild(p);
    } else {
      appendChaseImages(el, items, selectedDay);
    }
    return;
  }

  appendChaseHeader(el, "Chase items", false);
  const p = document.createElement("p");
  p.className = "chase-hint";
  p.textContent = "Tap a day’s box below to see chase targets for that opening.";
  el.appendChild(p);
}

function refreshChaseDisplays() {
  if (!dataset) return;
  fillChasePanel(els.weekChaseStrip);
}

function renderAllChaseModal() {
  if (!dataset || !els.allChaseModalContent) return;
  els.allChaseModalContent.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "all-chase-days";
  for (const day of DAYS) {
    const block = document.createElement("section");
    block.className = "all-chase-day-block";
    const h3 = document.createElement("h3");
    h3.textContent = day;
    block.appendChild(h3);
    const items = chaseItemsForDay(day);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "chase-empty";
      p.textContent = "No chase items.";
      block.appendChild(p);
    } else {
      appendChaseImages(block, items, day);
    }
    wrap.appendChild(block);
  }
  els.allChaseModalContent.appendChild(wrap);
}

function ensurePullSlots() {
  els.pullColumns.innerHTML = "";
  pullSlots = DAYS.map((day) => {
    const slot = document.createElement("div");
    slot.className = "pull-slot";
    slot.dataset.day = day;
    els.pullColumns.appendChild(slot);
    return slot;
  });
}

function clearPullStage() {
  pullSlots.forEach((slot) => {
    slot.innerHTML = "";
  });
}

function moodFromRevealedPulls(day, opens) {
  if (!opens.length) return null;
  const revealed = revealedPullsByDay[day];
  if (!revealed || revealed.size === 0) return null;
  const vals = [];
  for (let i = 0; i < opens.length; i++) {
    if (revealed.has(i)) vals.push(opens[i].satisfaction);
  }
  if (!vals.length) return null;
  return moodFromAverage(average(vals));
}

function createFlipCard(open, i, day) {
  const wrap = document.createElement("div");
  wrap.className = "flip-card";
  wrap.dataset.costTier = costTier(open.cost);
  wrap.dataset.satisfaction = String(open.satisfaction);
  const satisfactionLabel = SATISFACTION_LABELS[open.satisfaction] ?? String(open.satisfaction);
  const priceText = `Price: ${formatMoney(Number(open.cost || 0))}`;
  const satisfactionText = `Satisfaction: ${satisfactionLabel}`;
  const hoverDetails = `${priceText}, ${satisfactionText}`;
  wrap.title = "";
  const already = isPullRevealed(day, i);
  if (already) {
    wrap.classList.add("flipped", "flip-card--restored");
    wrap.classList.add("flip-card--preview-enabled");
    wrap.title = hoverDetails;
    wrap.setAttribute("tabindex", "-1");
    wrap.setAttribute("aria-label", `Pull ${i + 1}, revealed: ${open.itemLabel}, ${satisfactionLabel}, ${hoverDetails}`);
  } else {
    wrap.style.animationDelay = `${i * 0.07}s`;
    wrap.setAttribute("role", "button");
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("aria-label", `Pull ${i + 1}, tap to flip, ${hoverDetails}`);
  }

  const inner = document.createElement("div");
  inner.className = "flip-card__inner";

  const front = document.createElement("div");
  front.className = "flip-card__face flip-card__face--front";
  front.innerHTML = `
    <img class="flip-card__cover" src="asset/card.png" alt="Blind card cover" />
    <span class="flip-hint">Tap to reveal</span>
  `;

  const back = document.createElement("div");
  back.className = "flip-card__face flip-card__face--back";
  back.dataset.level = String(open.satisfaction);

  if (open.itemImage) {
    back.classList.add("flip-card__face--image");
    const img = document.createElement("img");
    img.className = "flip-card__item-image";
    img.src = open.itemImage;
    img.alt = open.itemLabel;
    img.loading = "lazy";
    img.decoding = "async";
    back.appendChild(img);
  } else {
    const lab = document.createElement("div");
    lab.className = "flip-card__label";
    lab.textContent = open.itemLabel;
    back.appendChild(lab);
  }
  inner.appendChild(front);
  inner.appendChild(back);
  wrap.appendChild(inner);

  const hoverMeta = document.createElement("div");
  hoverMeta.className = "flip-card__hover-meta";
  if (open.itemImage) {
    const previewImg = document.createElement("img");
    previewImg.className = "flip-card__hover-image";
    previewImg.src = open.itemImage;
    previewImg.alt = `${open.itemLabel} preview`;
    previewImg.loading = "lazy";
    previewImg.decoding = "async";
    previewImg.addEventListener("load", () => {
      if (previewImg.naturalWidth > previewImg.naturalHeight) {
        previewImg.classList.add("flip-card__hover-image--landscape");
        hoverMeta.classList.add("flip-card__hover-meta--landscape");
      }
    });
    hoverMeta.appendChild(previewImg);
  }
  const hoverText = document.createElement("div");
  hoverText.className = "flip-card__hover-text";
  hoverText.innerHTML = `<div>${priceText}</div><div>${satisfactionText}</div>`;
  hoverMeta.appendChild(hoverText);
  wrap.appendChild(hoverMeta);

  const reveal = () => {
    if (wrap.classList.contains("flipped")) return;
    wrap.classList.add("flipped");
    wrap.classList.add("flip-card--preview-enabled");
    wrap.title = hoverDetails;
    markPullRevealed(day, i);
    renderWeekGrid();
    wrap.setAttribute("aria-label", `Pull ${i + 1}, revealed: ${open.itemLabel}, ${satisfactionLabel}, ${hoverDetails}`);
    wrap.setAttribute("tabindex", "-1");
  };

  wrap.addEventListener("click", (e) => {
    e.stopPropagation();
    reveal();
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      reveal();
    }
  });

  return wrap;
}

function renderPullColumn(day) {
  if (!dataset) return;
  clearPullStage();
  const idx = DAYS.indexOf(day);
  const slot = pullSlots[idx];
  const opens = groupOpensByDay(getActiveOpens())[day];

  if (opens.length === 0) {
    const empty = document.createElement("p");
    empty.className = "pull-slot__empty";
    empty.textContent = "No boxes this day.";
    slot.appendChild(empty);
    return;
  }

  const meta = document.createElement("div");
  meta.className = "pull-slot__meta";
  meta.textContent = `${day} · ${opens.length} pull${opens.length === 1 ? "" : "s"}`;

  slot.appendChild(meta);
  opens.forEach((open, i) => {
    slot.appendChild(createFlipCard(open, i, day));
  });
}

function renderAllPullColumns() {
  if (!dataset) return;
  clearPullStage();
  const byDay = groupOpensByDay(getActiveOpens());

  DAYS.forEach((day, idx) => {
    const slot = pullSlots[idx];
    const opens = byDay[day];
    if (opens.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pull-slot__empty";
      empty.textContent = "No boxes this day.";
      slot.appendChild(empty);
      return;
    }

    opens.forEach((_, i) => markPullRevealed(day, i));

    const meta = document.createElement("div");
    meta.className = "pull-slot__meta";
    meta.textContent = `${day} · ${opens.length} pull${opens.length === 1 ? "" : "s"}`;
    slot.appendChild(meta);

    opens.forEach((open, i) => {
      slot.appendChild(createFlipCard(open, i, day));
    });
  });
}

function syncOpenAllUI() {
  els.week.classList.toggle("view-week--open-all", openAllMode);
  els.btnOpenAll.setAttribute("aria-pressed", String(openAllMode));
  els.btnOpenAll.classList.toggle("is-active", !openAllMode);
  els.btnOpenAll.textContent = openAllMode ? "Close all boxes" : "Open all boxes";
}

function setOpenAll(on) {
  if (!dataset) return;
  openAllMode = on;
  syncOpenAllUI();

  if (on) {
    if (selectedDay) {
      selectedDay = null;
    }
    renderAllPullColumns();
  } else {
    clearPullStage();
  }
  renderWeekGrid();
}

function onSelectDay(day) {
  if (!dataset) return;

  if (openAllMode) {
    setOpenAll(false);
    selectedDay = day;
    renderPullColumn(day);
    renderWeekGrid();
    return;
  }

  if (selectedDay === day) {
    selectedDay = null;
    clearPullStage();
    renderWeekGrid();
    return;
  }

  selectedDay = day;
  renderPullColumn(day);
  renderWeekGrid();
}

function miniBlindboxHTML(isOpen) {
  const src = isOpen ? "asset/opened.png" : "asset/box.png";
  const alt = isOpen ? "Opened blind box" : "Closed blind box";
  const stateClass = isOpen ? "day-box__img--opened" : "day-box__img--closed";
  return `
    <div class="day-box__img-shell" aria-hidden="true">
      <img class="day-box__img ${stateClass}" src="${src}" alt="${alt}" />
    </div>
  `;
}

function renderWeekGrid() {
  if (!dataset) return;
  const byDay = groupOpensByDay(getActiveOpens());
  els.weekGrid.innerHTML = "";
  els.week.classList.toggle("view-week--day-open", Boolean(selectedDay));

  for (const day of DAYS) {
    const opens = byDay[day];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-box";
    btn.dataset.day = day;
    btn.setAttribute("aria-label", `${day}, ${opens.length} box${opens.length === 1 ? "" : "es"}`);

    const shouldShowOpen = (openAllMode && opens.length > 0) || selectedDay === day;

    if (openAllMode && opens.length > 0) {
      btn.classList.add("day-box--open");
    } else if (selectedDay === day) {
      btn.classList.add("day-box--selected", "day-box--open");
    }

    const moodKey = moodFromRevealedPulls(day, opens);
    const revealed = revealedPullsByDay[day];
    const allRevealed = opens.length > 0 && revealed && revealed.size >= opens.length;

    if (moodKey === null) {
      btn.dataset.visited = "false";
      btn.dataset.complete = "false";
    } else {
      btn.dataset.visited = "true";
      btn.dataset.mood = moodKey;
      btn.dataset.complete = String(allRevealed);
    }

    const isOpen = shouldShowOpen;
    const scene = document.createElement("div");
    scene.className = "day-box__mini-scene";
    scene.innerHTML = miniBlindboxHTML(isOpen);

    const label = document.createElement("div");
    label.className = "day-box__label";
    label.textContent = day.slice(0, 3);

    const count = document.createElement("div");
    count.className = "day-box__count";
    count.textContent = opens.length ? `${opens.length} pull${opens.length === 1 ? "" : "s"}` : "—";

    btn.appendChild(scene);
    btn.appendChild(label);
    btn.appendChild(count);

    btn.addEventListener("click", () => onSelectDay(day));
    els.weekGrid.appendChild(btn);
  }
  renderTotalSpent();
  refreshChaseDisplays();
}

function goToWeekFromIntro() {
  let finished = false;
  const finishIntro = () => {
    if (finished) return;
    finished = true;
    els.intro.classList.add("hidden");
    els.week.classList.remove("hidden");
    els.introScene.classList.remove("zoom-into-box");
    els.heroBox.classList.remove("is-diving");
    els.introBlackout?.classList.remove("is-active");
  };

  els.heroBox.classList.add("is-opened");
  if (els.heroBoxImage) {
    els.heroBoxImage.src = "asset/opened.png";
    els.heroBoxImage.alt = "Opened blind box";
  }

  setTimeout(() => {
    els.heroBox.classList.add("is-diving");
  }, 320);

  setTimeout(() => {
    els.introScene.classList.add("zoom-into-box");
  }, 560);

  setTimeout(() => {
    els.introBlackout?.classList.add("is-active");
  }, 1480);

  setTimeout(() => {
    finishIntro();
  }, 2020);
}

function wireIntro() {
  const start = () => {
    if (els.heroBox.classList.contains("is-opened")) return;
    goToWeekFromIntro();
  };
  els.heroBox.addEventListener("click", start);
  els.heroBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      start();
    }
  });
}

function wireOpenAllToggle() {
  els.btnOpenAll.addEventListener("click", () => {
    setOpenAll(!openAllMode);
  });
}

function openAllChasesModal() {
  renderAllChaseModal();
  els.allChaseModal?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeAllChasesModal() {
  els.allChaseModal?.classList.add("hidden");
  document.body.style.overflow = "";
}

function wireAllChasesModal() {
  els.btnCloseAllChases?.addEventListener("click", closeAllChasesModal);
  els.allChaseModal?.addEventListener("click", (e) => {
    if (e.target === els.allChaseModal) closeAllChasesModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.allChaseModal && !els.allChaseModal.classList.contains("hidden")) {
      closeAllChasesModal();
    }
  });
}

async function init() {
  wireIntro();
  wireOpenAllToggle();
  wireAllChasesModal();
  wireSimulationSlider();
  ensurePullSlots();
  try {
    await loadData();
  } catch (e) {
    console.error(e);
    els.weekGrid.innerHTML =
      '<p style="color:var(--muted);text-align:center;grid-column:1/-1;">Load <code>data/blindbox-data.json</code> via a local server (e.g. <code>npx serve</code>) so the browser can fetch it.</p>';
    return;
  }
  renderSimulation();
  renderWeekGrid();
}

init();
