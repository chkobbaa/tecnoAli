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
  status: document.getElementById("status"),
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
  groupBy: document.getElementById("groupBy"),
  sortBy: document.getElementById("sortBy"),
  sortOrder: document.getElementById("sortOrder"),
  hideApproxToggle: document.getElementById("hideApproxToggle"),
  reloadBtn: document.getElementById("reloadBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
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
  detailPrice: document.getElementById("detailPrice"),
  detailSurface: document.getElementById("detailSurface"),
  detailRooms: document.getElementById("detailRooms"),
  detailExclusive: document.getElementById("detailExclusive"),
  detailLat: document.getElementById("detailLat"),
  detailLon: document.getElementById("detailLon"),
  detailError: document.getElementById("detailError"),
  detailApprox: document.getElementById("detailApprox"),
  detailMap: document.getElementById("detailMap"),
  detailSource: document.getElementById("detailSource"),
  detailProximity: document.getElementById("detailProximity"),
  detailErrorMessage: document.getElementById("detailErrorMessage"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#b23b3b" : "";
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
    item.exclusive ? "exclusif exclusive oui" : "",
    item.approx_used ? "approximatif approx" : "",
    isChecked(item) ? "verifie checked" : "a verifier unchecked",
  ].join(" "));
}

function matchesFilters(item) {
  if (state.type !== "all" && item.contract_type !== state.type) return false;
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

function applyFilters() {
  state.filteredItems = sortItems(state.allItems.filter(matchesFilters));
  state.total = state.filteredItems.length;
  state.totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  state.page = Math.min(state.page, state.totalPages);
  const start = (state.page - 1) * state.pageSize;
  state.items = state.filteredItems.slice(start, start + state.pageSize);
  elements.count.textContent = `${state.items.length}/${state.total}`;
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
  setStatus("Chargement...");

  if (reset) {
    state.items = [];
    state.allItems = [];
    state.filteredItems = [];
    state.page = 1;
    state.total = 0;
    state.totalPages = 1;
    renderGroups();
  }

  const params = buildQueryParams();
  const rows = [];
  let from = 0;
  const chunkSize = 1000;

  while (true) {
    const to = from + chunkSize - 1;
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
      setStatus(`Échec du chargement : ${errorText}`, true);
      state.loading = false;
      updatePaginationControls();
      return;
    }

    const data = await response.json();
    rows.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }

  state.allItems = rows;
  applyFilters();
  setActiveTypeButton();
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

function createTag(value) {
  const tag = document.createElement("span");
  tag.className = "tag";
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

      const actions = document.createElement("div");
      actions.className = "card-actions";

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
      actions.appendChild(checkButton);

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = item.title || "Sans titre";

      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = item.location || "";

      const tags = document.createElement("div");
      tags.className = "card-tags";
      if (item.city_title) tags.appendChild(createTag(item.city_title));
      if (item.district_title) tags.appendChild(createTag(item.district_title));
      if (item.price) tags.appendChild(createTag(item.price));
      if (item.surface) tags.appendChild(createTag(item.surface));
      if (item.rooms) tags.appendChild(createTag(`${item.rooms} pièces`));
      if (item.exclusive) tags.appendChild(createTag("Exclusif"));

      body.appendChild(actions);
      body.appendChild(title);
      body.appendChild(meta);
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
  elements.detailType.textContent = item.contract_type === "acquis" ? "Vente" : item.contract_type === "locazi" ? "Location" : "-";
  elements.detailTitle.textContent = item.title || "Sans titre";
  elements.detailLocation.textContent = item.location || "";
  elements.detailPrice.textContent = item.price || "-";
  elements.detailSurface.textContent = item.surface || "-";
  elements.detailRooms.textContent = item.rooms || item.rooms_short || "-";
  elements.detailExclusive.textContent = item.exclusive ? "Oui" : "Non";
  elements.detailLat.textContent = item.lat ?? "-";
  elements.detailLon.textContent = item.lon ?? "-";
  elements.detailError.textContent = item.error_margin ?? "-";
  elements.detailApprox.textContent = item.approx_used ? "Oui" : "Non";
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

  elements.detailImages.innerHTML = "<p class=\"status\">Chargement des images...</p>";
  elements.detailProximity.innerHTML = "<li>Chargement des proximités...</li>";

  fetchImages(item).then((images) => {
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
  });

  fetchProximities(item).then((points) => {
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
  state.query = "";
  state.place = "";
  state.minPrice = "";
  state.maxPrice = "";
  state.minSurface = "";
  state.minRooms = "";
  state.checkedFilter = "all";
  state.hideApprox = true;
  state.page = 1;
  applyFilters();
}

function attachEvents() {
  elements.saveConfigBtn.addEventListener("click", saveConfig);
  elements.reloadBtn.addEventListener("click", resetAndLoad);
  elements.authLoginBtn.addEventListener("click", handleLogin);
  elements.signOutBtn.addEventListener("click", handleSignOut);

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

  elements.groupBy.addEventListener("change", () => {
    state.groupBy = elements.groupBy.value;
    renderGroups();
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
}

function init() {
  attachEvents();
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
