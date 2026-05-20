const env = window.__ENV || {};
const storage = window.localStorage;

const config = {
  url: env.SUPABASE_URL || storage.getItem("SUPABASE_URL") || "",
  key: env.SUPABASE_ANON_KEY || storage.getItem("SUPABASE_ANON_KEY") || "",
  authEmail: env.SUPABASE_AUTH_EMAIL || storage.getItem("SUPABASE_AUTH_EMAIL") || "",
};

let supabaseClient = null;
let currentSession = null;

const state = {
  items: [],
  page: 0,
  pageSize: 24,
  hasMore: true,
  loading: false,
  query: "",
  type: "all",
  groupBy: "none",
  sortBy: "title",
  sortOrder: "asc",
};

const elements = {
  count: document.getElementById("count"),
  status: document.getElementById("status"),
  groups: document.getElementById("groups"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  groupBy: document.getElementById("groupBy"),
  sortBy: document.getElementById("sortBy"),
  sortOrder: document.getElementById("sortOrder"),
  reloadBtn: document.getElementById("reloadBtn"),
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
      setStatus("Supabase SDK not loaded", true);
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
    showAuthPanel("Auth error: " + error.message);
    return false;
  }
  if (!data.session) {
    showAuthPanel("Login required");
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

function buildQueryParams() {
  const params = new URLSearchParams();
  params.set("select", "*");

  if (state.type !== "all") {
    params.set("contract_type", `eq.${state.type}`);
  }

  if (state.query) {
    const needle = escapeLike(state.query);
    const orParts = [
      `title.ilike.*${needle}*`,
      `location.ilike.*${needle}*`,
      `price.ilike.*${needle}*`,
      `city_title.ilike.*${needle}*`,
      `district_title.ilike.*${needle}*`,
    ];
    params.set("or", `(${orParts.join(",")})`);
  }

  const field = state.sortBy === "error_margin" ? "error_margin" : "title";
  const direction = state.sortOrder === "desc" ? "desc" : "asc";
  params.set("order", `${field}.${direction}.nullslast`);

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

  if (state.loading || (!state.hasMore && !reset)) {
    return;
  }

  state.loading = true;
  setStatus("Loading...");

  if (reset) {
    state.items = [];
    state.page = 0;
    state.hasMore = true;
    renderGroups();
  }

  const params = buildQueryParams();
  const from = state.page * state.pageSize;
  const to = from + state.pageSize - 1;

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
    setStatus(`Load failed: ${errorText}`, true);
    state.loading = false;
    return;
  }

  const data = await response.json();
  const contentRange = response.headers.get("Content-Range") || "";
  const total = Number(contentRange.split("/")[1]) || 0;

  state.items = state.items.concat(data);
  state.page += 1;
  state.hasMore = state.items.length < total;
  elements.count.textContent = String(total || state.items.length);

  renderGroups();
  setStatus(state.hasMore ? "Loaded" : "All results loaded");
  state.loading = false;
}

function resetAndLoad() {
  fetchEstates(true);
}

function matchesGroup(item, groupKey) {
  if (!groupKey) return "Ungrouped";
  return item[groupKey] || "Other";
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
    empty.textContent = "No results yet.";
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
      const card = document.createElement("button");
      card.className = "card";
      card.style.animationDelay = `${index * 0.02}s`;
      card.addEventListener("click", () => openDetails(item));

      const media = document.createElement("div");
      media.className = "card-media";

      const imageUrl = item.card_image || item.images?.[0];
      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = item.title || "Listing image";
        img.loading = "lazy";
        media.appendChild(img);
      } else {
        const label = document.createElement("span");
        label.textContent = "No image";
        media.appendChild(label);
      }

      const body = document.createElement("div");
      body.className = "card-body";

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = item.title || "Untitled";

      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = item.location || "";

      const tags = document.createElement("div");
      tags.className = "card-tags";
      if (item.city_title) tags.appendChild(createTag(item.city_title));
      if (item.district_title) tags.appendChild(createTag(item.district_title));
      if (item.price) tags.appendChild(createTag(item.price));
      if (item.surface) tags.appendChild(createTag(item.surface));
      if (item.rooms) tags.appendChild(createTag(item.rooms));
      if (item.exclusive) tags.appendChild(createTag("Exclusive"));

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
  elements.detailType.textContent = item.contract_type || "-";
  elements.detailTitle.textContent = item.title || "Untitled";
  elements.detailLocation.textContent = item.location || "";
  elements.detailPrice.textContent = item.price || "-";
  elements.detailSurface.textContent = item.surface || "-";
  elements.detailRooms.textContent = item.rooms || item.rooms_short || "-";
  elements.detailExclusive.textContent = item.exclusive ? "Yes" : "No";
  elements.detailLat.textContent = item.lat ?? "-";
  elements.detailLon.textContent = item.lon ?? "-";
  elements.detailError.textContent = item.error_margin ?? "-";
  elements.detailApprox.textContent = item.approx_used ? "Yes" : "No";
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

  elements.detailImages.innerHTML = "<p class=\"status\">Loading images...</p>";
  elements.detailProximity.innerHTML = "<li>Loading proximity...</li>";

  fetchImages(item).then((images) => {
    elements.detailImages.innerHTML = "";
    const list = images.length ? images : (item.card_image ? [item.card_image] : []);
    if (!list.length) {
      elements.detailImages.innerHTML = "<p class=\"status\">No images</p>";
      return;
    }
    list.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = item.title || "Listing image";
      img.loading = "lazy";
      elements.detailImages.appendChild(img);
    });
  });

  fetchProximities(item).then((points) => {
    elements.detailProximity.innerHTML = "";
    if (!points.length) {
      elements.detailProximity.innerHTML = "<li>No proximity data</li>";
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
}

function closeDetails() {
  elements.details.classList.add("hidden");
  elements.backdrop.classList.add("hidden");
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
    showAuthPanel("Email and password required");
    return;
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    showAuthPanel(error ? error.message : "Login failed");
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
  showAuthPanel("Signed out");
}

function attachEvents() {
  elements.saveConfigBtn.addEventListener("click", saveConfig);
  elements.reloadBtn.addEventListener("click", resetAndLoad);
  elements.loadMoreBtn.addEventListener("click", () => fetchEstates(false));
  elements.authLoginBtn.addEventListener("click", handleLogin);
  elements.signOutBtn.addEventListener("click", handleSignOut);

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    resetAndLoad();
  });

  elements.typeFilter.addEventListener("change", () => {
    state.type = elements.typeFilter.value;
    resetAndLoad();
  });

  elements.groupBy.addEventListener("change", () => {
    state.groupBy = elements.groupBy.value;
    renderGroups();
  });

  elements.sortBy.addEventListener("change", () => {
    state.sortBy = elements.sortBy.value;
    resetAndLoad();
  });

  elements.sortOrder.addEventListener("change", () => {
    state.sortOrder = elements.sortOrder.value;
    resetAndLoad();
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
        showAuthPanel("Login required");
      }
    });
  }
  resetAndLoad();
}

init();
