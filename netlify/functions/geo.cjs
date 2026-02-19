// netlify/functions/geo.cjs
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const payload = JSON.parse(event.body || "{}");
    const { q, lat, lng } = payload || {};

    const headers = {
      "Content-Type": "application/json",
      // Nominatim exige User-Agent identificável
      "User-Agent": "praia-segura/1.0 (Netlify Function)",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    };

    // 1) Busca por texto (ex: "Praia do Morro")
    if (q && typeof q === "string") {
      const query = encodeURIComponent(q.includes("Brasil") ? q : `${q}, Brasil`);
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${query}`;

      const r = await fetch(url, { headers });
      const data = await r.json();

      if (!Array.isArray(data) || data.length === 0) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "NOT_FOUND" }),
        };
      }

      const item = data[0];
      const address = item.address || {};
      const city =
        address.city || address.town || address.village || address.municipality || address.county || "";
      const state = address.state || "";
      const stateCode = address["ISO3166-2-lvl4"]?.split("-")?.[1] || ""; // às vezes vem "BR-ES"

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          display_name: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          city,
          state,
          stateCode,
          raw: item,
        }),
      };
    }

    // 2) Reverse geocode por coordenadas (GPS)
    if (typeof lat === "number" && typeof lng === "number") {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;

      const r = await fetch(url, { headers });
      const data = await r.json();

      if (!data || !data.lat) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "NOT_FOUND" }),
        };
      }

      const address = data.address || {};
      const city =
        address.city || address.town || address.village || address.municipality || address.county || "";
      const state = address.state || "";
      const stateCode = address["ISO3166-2-lvl4"]?.split("-")?.[1] || "";

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          display_name: data.display_name,
          lat: Number(data.lat),
          lng: Number(data.lon),
          city,
          state,
          stateCode,
          raw: data,
        }),
      };
    }

    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing q OR lat/lng" }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};