const env = window.__ENV || {};
const storage = window.localStorage;

const config = {
  url: env.SUPABASE_URL || storage.getItem("SUPABASE_URL") || "",
  key: env.SUPABASE_ANON_KEY || storage.getItem("SUPABASE_ANON_KEY") || "",
  authEmail: env.SUPABASE_AUTH_EMAIL || storage.getItem("SUPABASE_AUTH_EMAIL") || "",
};

let supabaseClient = null;
let currentSession = null;
let searchTimer = null;
let statusTicker = null;
const checkedStorageKey = "TECNOCASA_CHECKED_HOUSES";

const state = {
  items: [],
  allItems: [],
  filteredItems: [],
  checkedKeys: new Set(JSON.parse(storage.getItem(checkedStorageKey) || "[]")),
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 1,
  loading: false,
  query: "",
  type: "all",
  propertyKind: "all",
  groupBy: "none",
  sortBy: "title",
  sortOrder: "asc",
  hideApprox: true,
  place: "",
  minPrice: "",
  maxPrice: "",
  minSurface: "",
  minRooms: "",
  checkedFilter: "all",
};

const elements = {
  count: document.getElementById("count"),
  inventoryCount: document.getElementById("inventoryCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  status: document.getElementById("status"),
  insights: document.getElementById("insights"),
  groups: document.getElementById("groups"),
  pageSizeInput: document.getElementById("pageSizeInput"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  searchInput: document.getElementById("searchInput"),
  placeFilter: document.getElementById("placeFilter"),
  minPrice: document.getElementById("minPrice"),
  maxPrice: document.getElementById("maxPrice"),
  minSurface: document.getElementById("minSurface"),
  minRooms: document.getElementById("minRooms"),
  checkedFilter: document.getElementById("checkedFilter"),
  typeFilterGroup: document.getElementById("typeFilterGroup"),
  kindFilterGroup: document.getElementById("kindFilterGroup"),
  groupBy: document.getElementById("groupBy"),
  sortBy: document.getElementById("sortBy"),
  sortOrder: document.getElementById("sortOrder"),
  hideApproxToggle: document.getElementById("hideApproxToggle"),
  reloadBtn: document.getElementById("reloadBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  filtersToggleBtn: document.getElementById("filtersToggleBtn"),
  filterCloseBtn: document.getElementById("filterCloseBtn"),
  filterApplyBtn: document.getElementById("filterApplyBtn"),
  filterDrawer: document.getElementById("filterDrawer"),
  filterBackdrop: document.getElementById("filterBackdrop"),
  activeFilterCount: document.getElementById("activeFilterCount"),
  activeFilterSummary: document.getElementById("activeFilterSummary"),
  configPanel: document.getElementById("configPanel"),
  supabaseUrlInput: document.getElementById("supabaseUrlInput"),
  supabaseKeyInput: document.getElementById("supabaseKeyInput"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  authPanel: document.getElementById("authPanel"),
  authEmailRow: document.getElementById("authEmailRow"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authLoginBtn: document.getElementById("authLoginBtn"),
  authMessage: document.getElementById("authMessage"),
  signOutBtn: document.getElementById("signOutBtn"),
  details: document.getElementById("details"),
  backdrop: document.getElementById("backdrop"),
  detailClose: document.getElementById("detailClose"),
  detailType: document.getElementById("detailType"),
  detailTitle: document.getElementById("detailTitle"),
  detailLocation: document.getElementById("detailLocation"),
  detailImages: document.getElementById("detailImages"),
  detailKind: document.getElementById("detailKind"),
  detailPrice: document.getElementById("detailPrice"),
  detailSurface: document.getElementById("detailSurface"),
  detailRooms: document.getElementById("detailRooms"),
  detailExclusive: document.getElementById("detailExclusive"),
  detailLat: document.getElementById("detailLat"),
  detailLon: document.getElementById("detailLon"),
  detailError: document.getElementById("detailError"),
  detailApprox: document.getElementById("detailApprox"),
  detailEstateId: document.getElementById("detailEstateId"),
  detailUpdated: document.getElementById("detailUpdated"),
  detailMap: document.getElementById("detailMap"),
  detailSource: document.getElementById("detailSource"),
  detailProximity: document.getElementById("detailProximity"),
  detailErrorMessage: document.getElementById("detailErrorMessage"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#b23b3b" : "";
}

function startLiveStatus(messages, isError = false) {
  stopLiveStatus();
  const startedAt = Date.now();
  const steps = Array.isArray(messages) ? messages : [messages];
  let index = 0;

  const update = () => {
    const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const message = steps[Math.min(index, steps.length - 1)];
    setStatus(`${message} (${elapsed}s)`, isError);
    index = (index + 1) % steps.length;
  };

  update();
  statusTicker = window.setInterval(update, 1800);
}

function stopLiveStatus() {
  if (statusTicker) {
    window.clearInterval(statusTicker);
    statusTicker = null;
  }
}

function startElementTicker(element, messages, wrapperTag = "p") {
  const startedAt = Date.now();
  const steps = Array.isArray(messages) ? messages : [messages];
  let index = 0;

  const update = () => {
    const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const message = steps[Math.min(index, steps.length - 1)];
    element.innerHTML = `<${wrapperTag} class="status">${message} (${elapsed}s)</${wrapperTag}>`;
    index = (index + 1) % steps.length;
  };

  update();
  return window.setInterval(update, 1500);
}

function hasConfig() {
  return Boolean(config.url && config.key);
}

function initSupabase() {
  if (!hasConfig()) {
    return null;
  }
  if (!supabaseClient) {
    const sdk = window.supabase;
    if (!sdk || !sdk.createClient) {
      setStatus("SDK Supabase non chargé", true);
      return null;
    }
    supabaseClient = sdk.createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

function showAuthPanel(message) {
  elements.authPanel.classList.remove("hidden");
  elements.authMessage.textContent = message || "";
  elements.authMessage.style.color = message ? "#b23b3b" : "";

  if (config.authEmail) {
    elements.authEmail.value = config.authEmail;
    elements.authEmailRow.classList.add("hidden");
  } else {
    elements.authEmailRow.classList.remove("hidden");
  }
}

function hideAuthPanel() {
  elements.authPanel.classList.add("hidden");
  elements.authMessage.textContent = "";
}

async function requireAuth() {
  const client = initSupabase();
  if (!client) {
    openConfigPanel();
    return false;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    showAuthPanel("Erreur d'authentification : " + error.message);
    return false;
  }
  if (!data.session) {
    showAuthPanel("Connexion requise");
    return false;
  }

  currentSession = data.session;

  hideAuthPanel();
  elements.signOutBtn.classList.remove("hidden");
  return true;
}

function openConfigPanel() {
  elements.configPanel.classList.remove("hidden");
  elements.supabaseUrlInput.value = config.url;
  elements.supabaseKeyInput.value = config.key;
}

function closeConfigPanel() {
  elements.configPanel.classList.add("hidden");
}

function saveConfig() {
  config.url = elements.supabaseUrlInput.value.trim();
  config.key = elements.supabaseKeyInput.value.trim();
  config.authEmail = elements.authEmail.value.trim() || config.authEmail;
  storage.setItem("SUPABASE_URL", config.url);
  storage.setItem("SUPABASE_ANON_KEY", config.key);
  if (config.authEmail) {
    storage.setItem("SUPABASE_AUTH_EMAIL", config.authEmail);
  }
  closeConfigPanel();
  resetAndLoad();
}

function supabaseHeaders() {
  const token = currentSession?.access_token;
  return {
    apikey: config.key,
    Authorization: `Bearer ${token || config.key}`,
    Prefer: "count=exact",
  };
}

function escapeLike(value) {
  return value.replace(/[\\%*]/g, "\\$&");
}

function setActiveTypeButton() {
  elements.typeFilterGroup.querySelectorAll("[data-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === state.type);
  });
}

function setActiveKindButton() {
  elements.kindFilterGroup.querySelectorAll("[data-kind]").forEach((button) => {
    button.classList.toggle("active", button.dataset.kind === state.propertyKind);
  });
}

function updatePaginationControls() {
  elements.pageInfo.textContent = `Page ${state.page} sur ${state.totalPages}`;
  elements.prevPageBtn.disabled = state.page <= 1 || state.loading;
  elements.nextPageBtn.disabled = state.page >= state.totalPages || state.loading;
  elements.pageSizeInput.value = String(state.pageSize);
}

function checkedKey(item) {
  return `${item.contract_type || ""}:${item.estate_id || item.id || ""}`;
}

function isChecked(item) {
  return state.checkedKeys.has(checkedKey(item));
}

function saveCheckedState() {
  storage.setItem(checkedStorageKey, JSON.stringify(Array.from(state.checkedKeys)));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numericValue(value) {
  const match = String(value ?? "").replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function firstValue(item, fields) {
  for (const field of fields) {
    const value = item[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

const updatedAtFields = [
  "updated_at",
  "last_updated_at",
  "last_update",
  "scraped_at",
  "last_scraped_at",
  "fetched_at",
  "collected_at",
  "created_at",
  "inserted_at",
  "timestamp",
];

const propertyKindFields = [
  "property_kind",
  "kind",
  "category",
  "category_title",
  "estate_type",
  "property_type",
  "typology",
  "typology_title",
  "type",
  "type_title",
  "subtype",
  "subtype_title",
];

function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractUpdatedAt(item) {
  return parseDateValue(firstValue(item, updatedAtFields));
}

function latestUpdatedAt(items) {
  return items.reduce((latest, item) => {
    const date = extractUpdatedAt(item);
    if (!date) return latest;
    return !latest || date > latest ? date : latest;
  }, null);
}

function formatDateTime(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeTime(date) {
  if (!date) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.345, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];
  let duration = seconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" }).format(
        Math.round(duration),
        division.unit
      );
    }
    duration /= division.amount;
  }
  return "";
}

function detectPropertyKind(item) {
  const explicit = normalizeText(firstValue(item, propertyKindFields));
  const titleText = normalizeText([item.title, item.location].join(" "));
  const haystack = normalizeText([explicit, titleText, item.rooms, item.rooms_short, item.surface].join(" "));
  const landPattern = /\b(terrain|terrains|terreno|terreni|land|lot|parcelle|constructible|agricole|ferme)\b/;
  const homePattern = /\b(maison|villa|appartement|apartment|studio|duplex|triplex|etage|chambre|piece|pieces|immobilier|residence|logement)\b/;

  if (explicit && landPattern.test(explicit)) {
    return "land";
  }

  if (explicit && (homePattern.test(explicit) || explicit.includes("s+"))) {
    return "home";
  }

  if (landPattern.test(titleText) && !homePattern.test(titleText)) {
    return "land";
  }

  if (homePattern.test(haystack) || haystack.includes("s+")) {
    return "home";
  }

  if (landPattern.test(haystack)) {
    return "land";
  }

  return "other";
}

function propertyKindLabel(kind) {
  if (kind === "land") return "Terrain";
  if (kind === "home") return "Logement";
  return "Autre";
}

function contractLabel(contractType) {
  if (contractType === "acquis") return "Vente";
  if (contractType === "locazi") return "Location";
  return contractType || "-";
}

function median(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : Math.round((numbers[middle - 1] + numbers[middle]) / 2);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function itemSearchText(item) {
  const rowValues = Object.values(item)
    .filter((value) => ["string", "number", "boolean"].includes(typeof value))
    .join(" ");
  return normalizeText([
    rowValues,
    item.estate_id,
    item.contract_type,
    item.title,
    item.location,
    item.price,
    item.surface,
    item.rooms,
    item.rooms_short,
    item.city_title,
    item.district_title,
    item.region_title,
    item.province_title,
    propertyKindLabel(detectPropertyKind(item)),
    formatDateTime(extractUpdatedAt(item)),
    item.exclusive ? "exclusif exclusive oui" : "",
    item.approx_used ? "approximatif approx" : "",
    isChecked(item) ? "verifie checked" : "a verifier unchecked",
  ].join(" "));
}

function matchesFilters(item) {
  if (state.type !== "all" && item.contract_type !== state.type) return false;
  if (state.propertyKind !== "all" && detectPropertyKind(item) !== state.propertyKind) return false;
  if (state.hideApprox && item.approx_used) return false;

  if (state.checkedFilter === "checked" && !isChecked(item)) return false;
  if (state.checkedFilter === "unchecked" && isChecked(item)) return false;

  const query = normalizeText(state.query);
  if (query && !itemSearchText(item).includes(query)) return false;

  const place = normalizeText(state.place);
  if (place) {
    const placeText = normalizeText([
      item.location,
      item.city_title,
      item.district_title,
      item.region_title,
      item.province_title,
    ].join(" "));
    if (!placeText.includes(place)) return false;
  }

  const price = numericValue(item.price);
  const surface = numericValue(item.surface);
  const rooms = numericValue(item.rooms ?? item.rooms_short);
  const minPrice = numericValue(state.minPrice);
  const maxPrice = numericValue(state.maxPrice);
  const minSurface = numericValue(state.minSurface);
  const minRooms = numericValue(state.minRooms);

  if (minPrice !== null && (price === null || price < minPrice)) return false;
  if (maxPrice !== null && (price === null || price > maxPrice)) return false;
  if (minSurface !== null && (surface === null || surface < minSurface)) return false;
  if (minRooms !== null && (rooms === null || rooms < minRooms)) return false;

  return true;
}

function sortValue(item) {
  if (state.sortBy === "price") return numericValue(item.price);
  if (state.sortBy === "surface") return numericValue(item.surface);
  if (state.sortBy === "rooms") return numericValue(item.rooms ?? item.rooms_short);
  if (state.sortBy === "updated_at") return extractUpdatedAt(item)?.getTime() ?? null;
  if (state.sortBy === "error_margin") return numericValue(item.error_margin);
  return normalizeText(item.title || "");
}

function sortItems(items) {
  const direction = state.sortOrder === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av === null || av === "") return 1;
    if (bv === null || bv === "") return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av).localeCompare(String(bv), "fr", { numeric: true }) * direction;
  });
}

function renderInsights() {
  elements.insights.innerHTML = "";

  if (!state.allItems.length) {
    return;
  }

  const visible = state.filteredItems;
  const checkedCount = visible.filter(isChecked).length;
  const uncheckedCount = visible.length - checkedCount;
  const landCount = visible.filter((item) => detectPropertyKind(item) === "land").length;
  const homeCount = visible.filter((item) => detectPropertyKind(item) === "home").length;
  const medianPrice = median(visible.map((item) => numericValue(item.price)));
  const medianSurface = median(visible.map((item) => numericValue(item.surface)));

  const insights = [
    ["À vérifier", uncheckedCount],
    ["Vérifiés", checkedCount],
    ["Terrains", landCount],
    ["Logements", homeCount],
    ["Prix médian", medianPrice ? formatNumber(medianPrice) : "-"],
    ["Surface médiane", medianSurface ? `${formatNumber(medianSurface)} m²` : "-"],
  ];

  insights.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "insight";

    const valueEl = document.createElement("span");
    valueEl.className = "insight-value";
    valueEl.textContent = String(value);

    const labelEl = document.createElement("span");
    labelEl.className = "insight-label";
    labelEl.textContent = label;

    item.appendChild(valueEl);
    item.appendChild(labelEl);
    elements.insights.appendChild(item);
  });
}

function activeFilterLabels() {
  const labels = [];
  if (state.query) labels.push(`Recherche: ${state.query}`);
  if (state.type !== "all") labels.push(contractLabel(state.type));
  if (state.propertyKind !== "all") labels.push(propertyKindLabel(state.propertyKind));
  if (state.place) labels.push(`Lieu: ${state.place}`);
  if (state.minPrice) labels.push(`Prix min ${state.minPrice}`);
  if (state.maxPrice) labels.push(`Prix max ${state.maxPrice}`);
  if (state.minSurface) labels.push(`Surface min ${state.minSurface}`);
  if (state.minRooms) labels.push(`Pièces min ${state.minRooms}`);
  if (state.checkedFilter === "checked") labels.push("Vérifiés");
  if (state.checkedFilter === "unchecked") labels.push("À vérifier");
  if (state.hideApprox) labels.push("Sans approx.");
  if (state.groupBy !== "none") labels.push(`Groupé: ${elements.groupBy.selectedOptions[0]?.textContent || state.groupBy}`);
  if (state.sortBy !== "title" || state.sortOrder !== "asc") {
    labels.push(`Tri: ${elements.sortBy.selectedOptions[0]?.textContent || state.sortBy} ${state.sortOrder}`);
  }
  return labels;
}

function renderFilterSummary() {
  const labels = activeFilterLabels();
  elements.activeFilterCount.textContent = String(labels.length);
  elements.activeFilterCount.classList.toggle("empty", labels.length === 0);
  elements.activeFilterSummary.innerHTML = "";

  const visibleLabels = labels.length ? labels : ["Tous les biens"];
  visibleLabels.slice(0, 6).forEach((label) => {
    const chip = document.createElement("span");
    chip.className = labels.length ? "filter-chip" : "filter-chip muted";
    chip.textContent = label;
    elements.activeFilterSummary.appendChild(chip);
  });

  if (labels.length > 6) {
    const chip = document.createElement("span");
    chip.className = "filter-chip";
    chip.textContent = `+${labels.length - 6}`;
    elements.activeFilterSummary.appendChild(chip);
  }
}

function updateHeaderStats() {
  elements.count.textContent = `${state.items.length}/${state.total}`;
  elements.inventoryCount.textContent = String(state.allItems.length);

  const lastUpdated = latestUpdatedAt(state.allItems);
  if (lastUpdated) {
    const relative = formatRelativeTime(lastUpdated);
    elements.lastUpdated.textContent = relative || formatDateTime(lastUpdated);
    elements.lastUpdated.title = formatDateTime(lastUpdated);
  } else {
    elements.lastUpdated.textContent = state.allItems.length ? `Chargé ${formatDateTime(new Date())}` : "-";
    elements.lastUpdated.title = "";
  }
}

function applyFilters() {
  state.filteredItems = sortItems(state.allItems.filter(matchesFilters));
  state.total = state.filteredItems.length;
  state.totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  state.page = Math.min(state.page, state.totalPages);
  const start = (state.page - 1) * state.pageSize;
  state.items = state.filteredItems.slice(start, start + state.pageSize);
  updateHeaderStats();
  renderInsights();
  renderFilterSummary();
  renderGroups();
  if (!state.loading) {
    setStatus(`${state.total} bien${state.total > 1 ? "s" : ""} affiché${state.total > 1 ? "s" : ""}`);
  }
  updatePaginationControls();
}

function buildQueryParams() {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("order", "estate_id.asc.nullslast");

  return params;
}

async function fetchEstates(reset = false) {
  if (!hasConfig()) {
    openConfigPanel();
    return;
  }

  const authed = await requireAuth();
  if (!authed) {
    return;
  }

  if (state.loading) {
    return;
  }

  state.loading = true;
  updatePaginationControls();
  startLiveStatus([
    "Connexion à Supabase",
    "Préparation de la liste des biens",
    "Lecture des annonces par lots",
  ]);

  if (reset) {
    state.items = [];
    state.allItems = [];
    state.filteredItems = [];
    state.page = 1;
    state.total = 0;
    state.totalPages = 1;
    updateHeaderStats();
    renderInsights();
    renderGroups();
  }

  const params = buildQueryParams();
  const rows = [];
  let from = 0;
  const chunkSize = 1000;

  while (true) {
    const to = from + chunkSize - 1;
    setStatus(`Lecture Supabase : lignes ${from + 1}-${to + 1}, ${rows.length} biens déjà reçus`);
    const response = await fetch(
      `${config.url}/rest/v1/estates?${params.toString()}`,
      {
        headers: {
          ...supabaseHeaders(),
          Range: `${from}-${to}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      stopLiveStatus();
      setStatus(`Échec du chargement : ${errorText}`, true);
      state.loading = false;
      updatePaginationControls();
      return;
    }

    const data = await response.json();
    rows.push(...data);
    setStatus(`Lot reçu : ${data.length} biens, ${rows.length} biens chargés au total`);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }

  stopLiveStatus();
  state.allItems = rows;
  applyFilters();
  setActiveTypeButton();
  setActiveKindButton();
  setStatus(`${state.total} bien${state.total > 1 ? "s" : ""} trouvé${state.total > 1 ? "s" : ""}`);
  state.loading = false;
  updatePaginationControls();

  if (!reset) {
    document.querySelector("main")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function resetAndLoad() {
  state.page = 1;
  fetchEstates(true);
}

function matchesGroup(item, groupKey) {
  if (!groupKey) return "Tous les biens";
  return item[groupKey] || "Autre";
}

function createTag(value, variant = "") {
  const tag = document.createElement("span");
  tag.className = variant ? `tag ${variant}` : "tag";
  tag.textContent = value;
  return tag;
}

function renderGroups() {
  elements.groups.innerHTML = "";

  if (!state.items.length) {
    const empty = document.createElement("p");
    empty.textContent = state.allItems.length ? "Aucun bien ne correspond aux filtres." : "Aucun résultat pour le moment.";
    elements.groups.appendChild(empty);
    return;
  }

  const groupKey = state.groupBy === "none" ? "" : state.groupBy;
  const grouped = {};

  state.items.forEach((item) => {
    const key = matchesGroup(item, groupKey);
    grouped[key] = grouped[key] || [];
    grouped[key].push(item);
  });

  Object.keys(grouped).sort().forEach((groupName) => {
    const section = document.createElement("section");
    section.className = "group";

    const header = document.createElement("h2");
    header.textContent = `${groupName} (${grouped[groupName].length})`;
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "cards-grid";

    grouped[groupName].forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "card";
      if (isChecked(item)) card.classList.add("checked");
      card.style.animationDelay = `${index * 0.02}s`;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("click", () => openDetails(item));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails(item);
        }
      });

      const media = document.createElement("div");
      media.className = "card-media";

      const imageUrl = item.card_image || item.images?.[0];
      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = item.title || "Image du bien";
        img.loading = "lazy";
        media.appendChild(img);
      } else {
        const label = document.createElement("span");
        label.textContent = "Sans image";
        media.appendChild(label);
      }

      const body = document.createElement("div");
      body.className = "card-body";

      const topLine = document.createElement("div");
      topLine.className = "card-topline";

      const checkButton = document.createElement("button");
      checkButton.type = "button";
      checkButton.className = "check-btn";
      checkButton.textContent = isChecked(item) ? "Vérifié" : "À vérifier";
      checkButton.setAttribute("aria-pressed", String(isChecked(item)));
      checkButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = checkedKey(item);
        if (state.checkedKeys.has(key)) {
          state.checkedKeys.delete(key);
        } else {
          state.checkedKeys.add(key);
        }
        saveCheckedState();
        applyFilters();
      });

      const kindTag = createTag(propertyKindLabel(detectPropertyKind(item)), "kind-tag");
      const updatedAt = extractUpdatedAt(item);
      const freshTag = createTag(updatedAt ? formatDateTime(updatedAt) : "Date inconnue", "fresh-tag");

      topLine.appendChild(checkButton);
      topLine.appendChild(kindTag);
      topLine.appendChild(freshTag);

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = item.title || "Sans titre";

      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = item.location || "";

      const facts = document.createElement("div");
      facts.className = "card-facts";

      [
        ["Prix", item.price || "-"],
        ["Surface", item.surface || "-"],
        ["Pièces", item.rooms || item.rooms_short || "-"],
      ].forEach(([label, value]) => {
        const fact = document.createElement("div");
        fact.className = "card-fact";

        const factValue = document.createElement("strong");
        factValue.textContent = value;

        const factLabel = document.createElement("span");
        factLabel.textContent = label;

        fact.appendChild(factValue);
        fact.appendChild(factLabel);
        facts.appendChild(fact);
      });

      const tags = document.createElement("div");
      tags.className = "card-tags";
      if (item.city_title) tags.appendChild(createTag(item.city_title));
      if (item.district_title) tags.appendChild(createTag(item.district_title));
      if (item.exclusive) tags.appendChild(createTag("Exclusif"));
      if (item.approx_used) tags.appendChild(createTag("Coord. approx.", "warning-tag"));

      body.appendChild(topLine);
      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(facts);
      body.appendChild(tags);

      card.appendChild(media);
      card.appendChild(body);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    elements.groups.appendChild(section);
  });
}

async function fetchImages(estate) {
  if (!hasConfig() || !currentSession) return [];

  const params = new URLSearchParams({
    select: "url",
    estate_id: `eq.${estate.estate_id}`,
    contract_type: `eq.${estate.contract_type}`,
    order: "id.asc",
  });

  const response = await fetch(
    `${config.url}/rest/v1/estate_images?${params.toString()}`,
    { headers: supabaseHeaders() }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.map((entry) => entry.url);
}

async function fetchProximities(estate) {
  if (!hasConfig() || !currentSession) return [];

  const params = new URLSearchParams({
    select: "name,dist_m,region",
    estate_id: `eq.${estate.estate_id}`,
    contract_type: `eq.${estate.contract_type}`,
    order: "dist_m.asc",
    limit: "10",
  });

  const response = await fetch(
    `${config.url}/rest/v1/estate_proximities?${params.toString()}`,
    { headers: supabaseHeaders() }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

function openDetails(item) {
  const updatedAt = extractUpdatedAt(item);
  elements.detailType.textContent = contractLabel(item.contract_type);
  elements.detailTitle.textContent = item.title || "Sans titre";
  elements.detailLocation.textContent = item.location || "";
  elements.detailKind.textContent = propertyKindLabel(detectPropertyKind(item));
  elements.detailPrice.textContent = item.price || "-";
  elements.detailSurface.textContent = item.surface || "-";
  elements.detailRooms.textContent = item.rooms || item.rooms_short || "-";
  elements.detailExclusive.textContent = item.exclusive ? "Oui" : "Non";
  elements.detailLat.textContent = item.lat ?? "-";
  elements.detailLon.textContent = item.lon ?? "-";
  elements.detailError.textContent = item.error_margin ?? "-";
  elements.detailApprox.textContent = item.approx_used ? "Oui" : "Non";
  elements.detailEstateId.textContent = item.estate_id || item.id || "-";
  elements.detailUpdated.textContent = updatedAt ? `${formatDateTime(updatedAt)} (${formatRelativeTime(updatedAt)})` : "-";
  elements.detailErrorMessage.textContent = item.locator_error || "";

  if (item.map_url) {
    elements.detailMap.href = item.map_url;
    elements.detailMap.style.pointerEvents = "auto";
    elements.detailMap.style.opacity = "1";
  } else {
    elements.detailMap.href = "#";
    elements.detailMap.style.pointerEvents = "none";
    elements.detailMap.style.opacity = "0.5";
  }

  if (item.detail_url) {
    elements.detailSource.href = item.detail_url;
    elements.detailSource.style.pointerEvents = "auto";
    elements.detailSource.style.opacity = "1";
  } else {
    elements.detailSource.href = "#";
    elements.detailSource.style.pointerEvents = "none";
    elements.detailSource.style.opacity = "0.5";
  }

  const imageTicker = startElementTicker(elements.detailImages, [
    "Demande des images à Supabase",
    "Recherche des URLs de galerie",
    "Préparation de l'aperçu photo",
  ]);
  const proximityTicker = startElementTicker(elements.detailProximity, [
    "Demande des proximités à Supabase",
    "Tri des points proches par distance",
    "Préparation de la liste de proximité",
  ], "li");

  fetchImages(item).then((images) => {
    window.clearInterval(imageTicker);
    elements.detailImages.innerHTML = "";
    const list = images.length ? images : (item.card_image ? [item.card_image] : []);
    if (!list.length) {
      elements.detailImages.innerHTML = "<p class=\"status\">Aucune image</p>";
      return;
    }
    list.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = item.title || "Image du bien";
      img.loading = "lazy";
      elements.detailImages.appendChild(img);
    });
    setStatus(`${list.length} image${list.length > 1 ? "s" : ""} chargée${list.length > 1 ? "s" : ""} pour ${item.estate_id || item.title || "ce bien"}`);
  }).catch((error) => {
    window.clearInterval(imageTicker);
    elements.detailImages.innerHTML = `<p class="status">Images indisponibles : ${error.message}</p>`;
  });

  fetchProximities(item).then((points) => {
    window.clearInterval(proximityTicker);
    elements.detailProximity.innerHTML = "";
    if (!points.length) {
      elements.detailProximity.innerHTML = "<li>Aucune donnée de proximité</li>";
      return;
    }
    points.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.name} - ${entry.dist_m} m`;
      elements.detailProximity.appendChild(li);
    });
    setStatus(`${points.length} point${points.length > 1 ? "s" : ""} de proximité chargé${points.length > 1 ? "s" : ""}`);
  }).catch((error) => {
    window.clearInterval(proximityTicker);
    elements.detailProximity.innerHTML = `<li>Proximités indisponibles : ${error.message}</li>`;
  });

  elements.details.classList.remove("hidden");
  elements.backdrop.classList.remove("hidden");
  document.body.classList.add("details-open");
}

function closeDetails() {
  elements.details.classList.add("hidden");
  elements.backdrop.classList.add("hidden");
  document.body.classList.remove("details-open");
}

function openFilters() {
  if (window.matchMedia("(min-width: 860px)").matches) {
    return;
  }
  elements.filterDrawer.classList.add("open");
  elements.filterBackdrop.classList.remove("hidden");
  elements.filtersToggleBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("filters-open");
}

function closeFilters() {
  elements.filterDrawer.classList.remove("open");
  elements.filterBackdrop.classList.add("hidden");
  elements.filtersToggleBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("filters-open");
}

function toggleFilters() {
  if (elements.filterDrawer.classList.contains("open")) {
    closeFilters();
  } else {
    openFilters();
  }
}

async function handleLogin() {
  const client = initSupabase();
  if (!client) {
    openConfigPanel();
    return;
  }

  const email = (config.authEmail || elements.authEmail.value || "").trim();
  const password = (elements.authPassword.value || "").trim();
  if (!email || !password) {
    showAuthPanel("E-mail et mot de passe requis");
    return;
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    showAuthPanel(error ? error.message : "Connexion impossible");
    return;
  }

  config.authEmail = email;
  storage.setItem("SUPABASE_AUTH_EMAIL", email);
  elements.authPassword.value = "";
  hideAuthPanel();
  elements.signOutBtn.classList.remove("hidden");
  resetAndLoad();
}

async function handleSignOut() {
  const client = initSupabase();
  if (!client) {
    return;
  }
  await client.auth.signOut();
  currentSession = null;
  elements.signOutBtn.classList.add("hidden");
  showAuthPanel("Déconnecté");
}

function scheduleFilterUpdate() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = elements.searchInput.value.trim();
    state.place = elements.placeFilter.value.trim();
    state.minPrice = elements.minPrice.value.trim();
    state.maxPrice = elements.maxPrice.value.trim();
    state.minSurface = elements.minSurface.value.trim();
    state.minRooms = elements.minRooms.value.trim();
    state.checkedFilter = elements.checkedFilter.value;
    state.page = 1;
    applyFilters();
  }, 180);
}

function clearFilters() {
  elements.searchInput.value = "";
  elements.placeFilter.value = "";
  elements.minPrice.value = "";
  elements.maxPrice.value = "";
  elements.minSurface.value = "";
  elements.minRooms.value = "";
  elements.checkedFilter.value = "all";
  elements.hideApproxToggle.checked = true;
  state.type = "all";
  state.propertyKind = "all";
  state.query = "";
  state.place = "";
  state.minPrice = "";
  state.maxPrice = "";
  state.minSurface = "";
  state.minRooms = "";
  state.checkedFilter = "all";
  state.hideApprox = true;
  state.page = 1;
  setActiveKindButton();
  setActiveTypeButton();
  applyFilters();
}

function attachEvents() {
  elements.saveConfigBtn.addEventListener("click", saveConfig);
  elements.reloadBtn.addEventListener("click", resetAndLoad);
  elements.authLoginBtn.addEventListener("click", handleLogin);
  elements.signOutBtn.addEventListener("click", handleSignOut);
  elements.filtersToggleBtn.addEventListener("click", toggleFilters);
  elements.filterCloseBtn.addEventListener("click", closeFilters);
  elements.filterApplyBtn.addEventListener("click", closeFilters);
  elements.filterBackdrop.addEventListener("click", closeFilters);
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 860px)").matches) {
      closeFilters();
    }
  });

  elements.searchInput.addEventListener("input", scheduleFilterUpdate);
  elements.placeFilter.addEventListener("input", scheduleFilterUpdate);
  elements.minPrice.addEventListener("input", scheduleFilterUpdate);
  elements.maxPrice.addEventListener("input", scheduleFilterUpdate);
  elements.minSurface.addEventListener("input", scheduleFilterUpdate);
  elements.minRooms.addEventListener("input", scheduleFilterUpdate);
  elements.checkedFilter.addEventListener("change", scheduleFilterUpdate);
  elements.clearFiltersBtn.addEventListener("click", clearFilters);

  elements.typeFilterGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    state.type = button.dataset.type;
    setActiveTypeButton();
    state.page = 1;
    applyFilters();
  });

  elements.kindFilterGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    state.propertyKind = button.dataset.kind;
    setActiveKindButton();
    state.page = 1;
    applyFilters();
  });

  elements.groupBy.addEventListener("change", () => {
    state.groupBy = elements.groupBy.value;
    renderGroups();
    renderFilterSummary();
  });

  elements.sortBy.addEventListener("change", () => {
    state.sortBy = elements.sortBy.value;
    state.page = 1;
    applyFilters();
  });

  elements.sortOrder.addEventListener("change", () => {
    state.sortOrder = elements.sortOrder.value;
    state.page = 1;
    applyFilters();
  });

  elements.hideApproxToggle.addEventListener("change", () => {
    state.hideApprox = elements.hideApproxToggle.checked;
    state.page = 1;
    applyFilters();
  });

  elements.pageSizeInput.addEventListener("change", () => {
    state.pageSize = Math.max(1, Math.min(200, Number(elements.pageSizeInput.value || 24)));
    state.page = 1;
    applyFilters();
  });

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    applyFilters();
  });

  elements.nextPageBtn.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    applyFilters();
  });

  elements.detailClose.addEventListener("click", closeDetails);
  elements.backdrop.addEventListener("click", closeDetails);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeFilters();
    closeDetails();
  });
}

function init() {
  attachEvents();
  updateHeaderStats();
  renderInsights();
  renderFilterSummary();
  setActiveTypeButton();
  setActiveKindButton();
  if (!hasConfig()) {
    openConfigPanel();
  }
  const client = initSupabase();
  if (client) {
    client.auth.onAuthStateChange((_event, session) => {
      currentSession = session || null;
      if (session) {
        elements.signOutBtn.classList.remove("hidden");
        hideAuthPanel();
      } else {
        elements.signOutBtn.classList.add("hidden");
        showAuthPanel("Connexion requise");
      }
    });
  }
  resetAndLoad();
}

init();
