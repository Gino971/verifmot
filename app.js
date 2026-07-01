const state = {
  words: [],
  set: null,
  ready: false,
  visibleLimit: 0,
  allResults: []
};

const INITIAL_LIMIT = 500;
const LOAD_MORE_STEP = 200;

const elements = {
  status: document.getElementById("odsLoadStatus"),
  wordInput: document.getElementById("wordInput"),
  verifyBtn: document.getElementById("verifyBtn"),
  verifyResult: document.getElementById("verifyResult"),
  lengthSelect: document.getElementById("lengthSelect"),
  lettersContainer: document.getElementById("lettersContainer"),
  modeRow: document.getElementById("modeRow"),
  searchBtn: document.getElementById("searchBtn"),
  resetBtn: document.getElementById("resetBtn"),
  moreBtn: document.getElementById("moreBtn"),
  moreInfo: document.getElementById("moreInfo"),
  searchResults: document.getElementById("searchResults")
};

window.addEventListener("DOMContentLoaded", init);

function init() {
  initLengthOptions();
  renderLetterBoxes();
  bindEvents();
  registerServiceWorker();
  loadODS();
}

function bindEvents() {
  elements.verifyBtn.addEventListener("click", verifyWord);
  elements.wordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") verifyWord();
  });

  elements.lengthSelect.addEventListener("change", () => {
    renderLetterBoxes();
    clearSearchOutput();
  });

  elements.searchBtn.addEventListener("click", searchWords);
  elements.resetBtn.addEventListener("click", resetFields);
  elements.moreBtn.addEventListener("click", () => {
    state.visibleLimit = Math.min(state.allResults.length, state.visibleLimit + LOAD_MORE_STEP);
    renderResults();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

function initLengthOptions() {
  elements.lengthSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Toutes";
  elements.lengthSelect.appendChild(allOption);

  for (let i = 2; i <= 15; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = String(i);
    elements.lengthSelect.appendChild(option);
  }
}

function renderLetterBoxes() {
  const selected = elements.lengthSelect.value;
  const isAll = selected === "all";
  const length = isAll ? 15 : Number(selected);
  const previous = Array.from(elements.lettersContainer.querySelectorAll(".letter-input")).map((input) => input.value);

  elements.lettersContainer.innerHTML = "";
  for (let i = 0; i < length; i += 1) {
    const input = document.createElement("input");
    input.className = "letter-input";
    input.type = "text";
    input.maxLength = 1;
    input.inputMode = "text";
    input.autocomplete = "off";
    input.value = sanitizeLetters(previous[i] || "");
    input.dataset.index = String(i);

    input.addEventListener("input", (event) => {
      event.target.value = sanitizeLetters(event.target.value);
      if (event.target.value && i < length - 1) {
        const next = elements.lettersContainer.querySelector(`.letter-input[data-index=\"${i + 1}\"]`);
        if (next) next.focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value && i > 0) {
        const previousInput = elements.lettersContainer.querySelector(`.letter-input[data-index=\"${i - 1}\"]`);
        if (previousInput) previousInput.focus();
      }
      if (event.key === "Enter") searchWords();
    });

    elements.lettersContainer.appendChild(input);
  }

  const exactRadio = document.querySelector("input[name='searchMode'][value='exact']");
  const anywhereRadio = document.querySelector("input[name='searchMode'][value='anywhere']");

  if (isAll) {
    exactRadio.disabled = true;
    anywhereRadio.checked = true;
  } else {
    exactRadio.disabled = false;
  }
}

async function loadODS() {
  setStatus("Chargement du dictionnaire...", "loading");

  try {
    const response = await fetch("ODS9.txt");
    if (!response.ok) throw new Error("ODS9 indisponible");

    const content = await response.text();
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    state.words = lines;
    state.set = new Set(lines.map(normalizeWord));
    state.ready = state.set.size > 0;

    if (!state.ready) throw new Error("Dictionnaire vide");
    setStatus(`${state.words.length} mots charges`, "ready");
  } catch (error) {
    state.words = [];
    state.set = null;
    state.ready = false;
    setStatus("Impossible de charger ODS9.txt", "error");
  }
}

function verifyWord() {
  const value = (elements.wordInput.value || "").trim();
  if (!value) {
    elements.verifyResult.innerHTML = '<span class="result-unknown">Entrez un mot</span>';
    return;
  }

  if (!state.ready) {
    elements.verifyResult.innerHTML = '<span class="result-unknown">Dictionnaire indisponible</span>';
    return;
  }

  const normalized = normalizeWord(value);
  const isValid = state.set.has(normalized);

  if (isValid) {
    elements.verifyResult.innerHTML = `<span class="result-ok">${escapeHtml(value.toUpperCase())} est valide</span>`;
  } else {
    const anagrams = findAnagrams(value);
    if (anagrams.length) {
      elements.verifyResult.innerHTML = `<span class="result-bad">${escapeHtml(value.toUpperCase())} est invalide.</span><br>Anagrammes: ${escapeHtml(anagrams.join(", "))}`;
    } else {
      elements.verifyResult.innerHTML = `<span class="result-bad">${escapeHtml(value.toUpperCase())} est invalide</span>`;
    }
  }

  elements.wordInput.value = "";
  elements.wordInput.focus();
}

function findAnagrams(word) {
  const target = sortLetters(word);
  const upperWord = normalizeWord(word);
  const found = [];
  const seen = new Set();

  for (const candidate of state.words) {
    if (normalizeWord(candidate).length !== upperWord.length) continue;
    if (sortLetters(candidate) !== target) continue;

    const key = normalizeWord(candidate);
    if (key === upperWord) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    found.push(candidate);
  }

  return found;
}

function searchWords() {
  if (!state.ready) {
    elements.searchResults.innerHTML = "<p>Dictionnaire indisponible.</p>";
    return;
  }

  const boxes = Array.from(elements.lettersContainer.querySelectorAll(".letter-input"));
  if (!boxes.length) {
    elements.searchResults.innerHTML = "<p>Choisissez une longueur.</p>";
    return;
  }

  const selected = elements.lengthSelect.value;
  const isAll = selected === "all";
  const length = isAll ? null : Number(selected);

  const modeInput = document.querySelector("input[name='searchMode']:checked");
  const mode = isAll ? "anywhere" : modeInput.value;

  const pattern = boxes.map((box) => sanitizeLetters(box.value));
  const requiredLetters = pattern.filter(Boolean);

  const buckets = new Map();
  const dedupe = new Set();

  for (const word of state.words) {
    const normalized = normalizeWord(word);

    if (!isAll && normalized.length !== length) continue;
    if (isAll && (normalized.length < 2 || normalized.length > 15)) continue;

    if (mode === "exact") {
      let pass = true;
      for (let i = 0; i < pattern.length; i += 1) {
        if (!pattern[i]) continue;
        if (normalized[i] !== pattern[i]) {
          pass = false;
          break;
        }
      }
      if (!pass) continue;
    } else {
      let pass = true;
      for (const requiredLetter of requiredLetters) {
        if (!normalized.includes(requiredLetter)) {
          pass = false;
          break;
        }
      }
      if (!pass) continue;
    }

    if (dedupe.has(normalized)) continue;
    dedupe.add(normalized);

    const groupKey = normalized.length;
    if (!buckets.has(groupKey)) buckets.set(groupKey, []);
    buckets.get(groupKey).push(word);
  }

  const ordered = Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .flatMap((groupKey) => buckets.get(groupKey));

  state.allResults = ordered;
  state.visibleLimit = Math.min(INITIAL_LIMIT, ordered.length);

  if (!ordered.length) {
    clearSearchOutput();
    elements.searchResults.innerHTML = "<p>Aucun mot trouve.</p>";
    return;
  }

  renderResults();
}

function renderResults() {
  const visible = state.allResults.slice(0, state.visibleLimit);
  const byLength = new Map();

  for (const word of visible) {
    const key = normalizeWord(word).length;
    if (!byLength.has(key)) byLength.set(key, []);
    byLength.get(key).push(word);
  }

  const html = Array.from(byLength.keys())
    .sort((a, b) => a - b)
    .map((key) => {
      const items = byLength.get(key).map((word) => `<li>${escapeHtml(word)}</li>`).join("");
      return `<section class="search-group"><h3>${key} lettres</h3><ul class="words-list">${items}</ul></section>`;
    })
    .join("");

  elements.searchResults.innerHTML = html;
  updateMoreInfo();
}

function updateMoreInfo() {
  const total = state.allResults.length;
  const visible = state.visibleLimit;
  const remaining = Math.max(0, total - visible);

  if (!total) {
    elements.moreBtn.hidden = true;
    elements.moreInfo.textContent = "";
    return;
  }

  if (remaining > 0) {
    elements.moreBtn.hidden = false;
    elements.moreInfo.textContent = `${visible} affiches sur ${total}. ${remaining} restants.`;
  } else {
    elements.moreBtn.hidden = true;
    elements.moreInfo.textContent = `${total} mots affiches.`;
  }
}

function clearSearchOutput() {
  state.allResults = [];
  state.visibleLimit = 0;
  elements.moreBtn.hidden = true;
  elements.moreInfo.textContent = "";
  elements.searchResults.innerHTML = "";
}

function resetFields() {
  elements.wordInput.value = "";
  elements.verifyResult.innerHTML = "";
  elements.lengthSelect.value = "all";
  renderLetterBoxes();
  clearSearchOutput();

  for (const input of elements.lettersContainer.querySelectorAll(".letter-input")) {
    input.value = "";
  }

  elements.wordInput.focus();
}

function setStatus(text, kind) {
  if (!elements.status) return;
  elements.status.textContent = text;
  elements.status.className = `status-pill ${kind}`;
}

function normalizeWord(value) {
  const source = String(value || "");
  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function sanitizeLetters(value) {
  return normalizeWord(value).replace(/[^A-Z]/g, "").slice(0, 1);
}

function sortLetters(value) {
  return normalizeWord(value)
    .replace(/[^A-Z]/g, "")
    .split("")
    .sort()
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
