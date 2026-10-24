const fs = require("fs");
const path = require("path");

// Load geocode cache
let geocodeCache = {};
try {
  const possiblePaths = [
    path.join(__dirname, "geocode_cache.json"),
    path.join(__dirname, "..", "geocode_cache.json"),
    path.join(process.cwd(), "geocode_cache.json"),
    path.join(process.cwd(), "api", "geocode_cache.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      geocodeCache = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
} catch (e) {
  // Silent fallback
}

function metersPerDegree(refLat) {
  const mLat = 111320.0;
  const mLon = 111320.0 * Math.cos((refLat * Math.PI) / 180.0);
  return { mLat, mLon };
}

function solveTrilateration(pts) {
  const refLat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
  const refLon = pts.reduce((sum, p) => sum + p.lon, 0) / pts.length;
  const { mLat, mLon } = metersPerDegree(refLat);

  const localPts = pts.map((p) => ({
    x: (p.lon - refLon) * mLon,
    y: (p.lat - refLat) * mLat,
    d: p.dist_m,
    name: p.name,
  }));

  const weights = pts.map((p) => 1.0 / Math.max(p.dist_m, 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  let px = localPts.reduce((sum, p, i) => sum + weights[i] * p.x, 0) / totalW;
  let py = localPts.reduce((sum, p, i) => sum + weights[i] * p.y, 0) / totalW;

  for (let iter = 0; iter < 200; iter++) {
    let JtJ_00 = 0,
      JtJ_01 = 0,
      JtJ_11 = 0;
    let Jtr_0 = 0,
      Jtr_1 = 0;

    for (const p of localPts) {
      const dx = px - p.x;
      const dy = py - p.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const res = dist - p.d;

      const jx = dx / dist;
      const jy = dy / dist;

      JtJ_00 += jx * jx;
      JtJ_01 += jx * jy;
      JtJ_11 += jy * jy;

      Jtr_0 += jx * res;
      Jtr_1 += jy * res;
    }

    const lambda = 1e-3;
    const a = JtJ_00 + lambda;
    const b = JtJ_01;
    const c = JtJ_11 + lambda;
    const det = a * c - b * b;

    if (Math.abs(det) < 1e-12) break;

    const deltaX = (c * Jtr_0 - b * Jtr_1) / det;
    const deltaY = (a * Jtr_1 - b * Jtr_0) / det;

    px -= deltaX;
    py -= deltaY;

    if (Math.hypot(deltaX, deltaY) < 1e-5) break;
  }

  const estLat = refLat + py / mLat;
  const estLon = refLon + px / mLon;

  let sqErrors = 0;
  const residuals = [];
  for (const p of localPts) {
    const computed = Math.hypot(px - p.x, py - p.y);
    const err = computed - p.d;
    sqErrors += err * err;
    residuals.push({
      name: p.name,
      given_m: p.d,
      computed_m: Math.round(computed * 10) / 10,
      error_m: Math.round(err * 10) / 10,
    });
  }
  const rmse = Math.sqrt(sqErrors / localPts.length);

  return {
    lat: estLat,
    lon: estLon,
    rmse: Math.round(rmse * 100) / 100,
    residuals,
    map_url: `https://maps.google.com/?q=${estLat.toFixed(6)},${estLon.toFixed(6)}`,
  };
}

function bestTrilateration(candidates, minPts = 4, maxPts = 8) {
  if (candidates.length < 2) return null;
  candidates.sort((a, b) => a.dist_m - b.dist_m);
  const subset = candidates.slice(0, 12);

  let best = null;
  function combinations(arr, k) {
    const res = [];
    function backtrack(start, combo) {
      if (combo.length === k) {
        res.push([...combo]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        backtrack(i + 1, combo);
        combo.pop();
      }
    }
    backtrack(0, []);
    return res;
  }

  for (let k = Math.min(minPts, subset.length); k <= Math.min(maxPts, subset.length); k++) {
    for (const combo of combinations(subset, k)) {
      const sol = solveTrilateration(combo);
      if (!best || sol.rmse < best.rmse) {
        best = { ...sol, points_used: k };
        if (best.rmse < 5.0) return best;
      }
    }
  }

  return best || solveTrilateration(candidates.slice(0, Math.min(4, candidates.length)));
}

async function geocodeLandmarks(rawPOIs, regionName) {
  const located = [];
  const cacheKeys = Object.keys(geocodeCache);

  for (const item of rawPOIs) {
    const nameLower = item.name.toLowerCase().trim();
    let found = null;
    const directKey = `${nameLower}|${regionName.toLowerCase()}`;

    if (geocodeCache[directKey]) {
      found = geocodeCache[directKey];
    } else {
      const match = cacheKeys.find((k) => k.toLowerCase().startsWith(`${nameLower}|`));
      if (match) {
        found = geocodeCache[match];
      }
    }

    if (found && found.lat != null && found.lon != null) {
      located.push({
        name: item.name,
        lat: Number(found.lat),
        lon: Number(found.lon),
        dist_m: item.dist_m,
      });
      continue;
    }

    // Fallback lookup if not enough points found yet
    if (located.length < 5) {
      try {
        const query = `${item.name}, ${regionName}`;
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=2`;
        const nomRes = await fetch(nomUrl, {
          headers: {
            "User-Agent": "TecnocasaManualLocator/1.0 (contact@tecnocasa.tn)",
          },
        });
        if (nomRes.ok) {
          const list = await nomRes.json();
          if (Array.isArray(list) && list.length > 0) {
            const lat = parseFloat(list[0].lat);
            const lon = parseFloat(list[0].lon);
            located.push({
              name: item.name,
              lat,
              lon,
              dist_m: item.dist_m,
            });
            geocodeCache[directKey] = { lat, lon };
          }
        }
      } catch (e) {
        // Ignore network errors for single geocodes
      }
    }
  }

  return located;
}

function parseDistanceMeters(distanceText) {
  if (!distanceText) return null;
  const text = String(distanceText).trim().toLowerCase().replace(/\s/g, "").replace(",", ".");
  const match = text.match(/[0-9.]+/);
  if (!match) return null;
  const val = parseFloat(match[0]);
  if (text.includes("km")) return Math.round(val * 1000);
  return Math.round(val);
}

function extractGalleryImages(html, estate) {
  const images = new Set();
  const regex = /https?:\/\/[^"'\\s]+gallery\.jpeg(?:\?[^"'\\s]*)?/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    images.add(match[0].replace(/\\/g, ""));
  }
  if (Array.isArray(estate.images)) {
    estate.images.forEach((img) => {
      if (typeof img === "string") images.add(img);
      else if (img && img.url) images.add(img.url);
    });
  }
  return Array.from(images);
}

module.exports = async function handler(req, res) {
  // CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilisez POST." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  let rawUrl = (body.url || "").trim();
  if (!rawUrl) {
    return res.status(400).json({ error: "Aucune URL Tecnocasa fournie." });
  }

  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    rawUrl = `https://${rawUrl}`;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (e) {
    return res.status(400).json({ error: "Format d'URL invalide." });
  }

  if (!parsedUrl.hostname.toLowerCase().includes("tecnocasa.tn")) {
    return res.status(400).json({ error: "L'URL doit provenir du site Tecnocasa Tunisie (tecnocasa.tn)." });
  }

  try {
    const tecnoRes = await fetch(rawUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    if (!tecnoRes.ok) {
      return res.status(502).json({
        error: `Impossible de charger l'annonce sur Tecnocasa (Erreur HTTP ${tecnoRes.status}).`,
      });
    }

    const htmlText = await tecnoRes.text();
    const estateMatch = htmlText.match(/:estate="([^"]+)"/);
    if (!estateMatch) {
      return res.status(400).json({
        error: "Aucune fiche d'annonce exploitable n'a été détectée sur cette page.",
      });
    }

    const unescaped = estateMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    const estate = JSON.parse(unescaped);

    // Extract ID and Contract Type
    const idFromUrl = (rawUrl.match(/\/(\d+)\.html/i) || rawUrl.match(/\/(\d+)\/?$/) || [])[1];
    const estateId = String(estate.id || idFromUrl || Date.now()).trim();

    const contractHint = String(estate.contract_type || "").toLowerCase();
    let contractType = "acquis";
    if (
      ["locazi", "rent", "rental", "location", "louer"].some((k) => contractHint.includes(k)) ||
      rawUrl.toLowerCase().includes("location") ||
      rawUrl.toLowerCase().includes("louer")
    ) {
      contractType = "locazi";
    }

    const regionName = [estate.city?.title, "Tunisia"].filter(Boolean).join(", ");
    const pois = estate.points_of_interest || {};
    const rawPOIs = [];

    for (const group of Object.values(pois)) {
      if (!Array.isArray(group)) continue;
      for (const item of group) {
        const name = (item.name || "").trim();
        if (!name) continue;
        const distM = parseDistanceMeters(item.distance);
        if (distM == null) continue;
        rawPOIs.push({ name, dist_m: distM });
      }
    }

    // Geocode landmarks & calculate position
    const located = await geocodeLandmarks(rawPOIs, regionName);
    const triResult = bestTrilateration(located);

    let lat = triResult ? triResult.lat : null;
    let lon = triResult ? triResult.lon : null;
    let mapUrl = triResult ? triResult.map_url : null;
    let errorMargin = triResult ? triResult.rmse : null;
    let approxUsed = false;
    let locatorError = null;

    if (!mapUrl && estate.approx_lat && estate.approx_lon) {
      lat = parseFloat(estate.approx_lat);
      lon = parseFloat(estate.approx_lon);
      mapUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
      approxUsed = true;
      locatorError = "Position approximative fournie par le site.";
    } else if (!mapUrl) {
      locatorError = "Points de repère insuffisants pour trianguler la position.";
    }

    const images = extractGalleryImages(htmlText, estate);

    const item = {
      estate_id: estateId,
      contract_type: contractType,
      id: estateId,
      type: contractType,
      title: estate.title || "Sans titre",
      location: estate.subtitle || estate.location || "",
      price: estate.price || "-",
      rooms: estate.rooms || "-",
      rooms_short: estate.rooms_short || estate.rooms || "-",
      surface: estate.surface || "-",
      exclusive: Boolean(estate.exclusive),
      discount: estate.discount || null,
      discount_percentage: estate.discount_percentage || null,
      previous_price: estate.previous_price || null,
      is_discounted: Boolean(estate.is_discounted),
      city_title: estate.city?.title || "",
      district_title: estate.district?.title || "",
      region_title: estate.region?.title || estate.city?.title || "",
      province_title: estate.province?.title || "",
      detail_url: rawUrl,
      lat,
      lon,
      map_url: mapUrl,
      error_margin: errorMargin,
      locator_error: locatorError,
      approx_used: approxUsed,
      images,
      card_image: images[0] || null,
    };

    // Optionally upsert to Supabase if configured in environment
    const supabaseUrl = process.env.SUPABASE_URL || body.supabaseUrl;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || body.supabaseKey;

    if (supabaseUrl && supabaseKey) {
      try {
        const estateRow = {
          estate_id: estateId,
          contract_type: contractType,
          title: item.title,
          location: item.location,
          price: item.price,
          rooms: item.rooms,
          rooms_short: item.rooms_short,
          surface: item.surface,
          exclusive: item.exclusive,
          detail_url: rawUrl,
          lat: item.lat,
          lon: item.lon,
          map_url: item.map_url,
          error_margin: item.error_margin,
          locator_error: item.locator_error,
          approx_used: item.approx_used,
          city_title: item.city_title,
          district_title: item.district_title,
          region_title: item.region_title,
          province_title: item.province_title,
          card_image: item.card_image,
        };

        await fetch(`${supabaseUrl}/rest/v1/estates`, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify([estateRow]),
        });
      } catch (sbErr) {
        // Non-blocking error for database upsert
      }
    }

    return res.status(200).json({
      ok: true,
      estate_id: estateId,
      contract_type: contractType,
      map_url: mapUrl,
      detail_url: rawUrl,
      item,
    });
  } catch (error) {
    return res.status(500).json({
      error: `Erreur lors du traitement de l'annonce : ${error.message}`,
    });
  }
};
