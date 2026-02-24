exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const qs = event.queryStringParameters || {};
    const q = (qs.q || "").trim();
    const lat = qs.lat;
    const lng = qs.lng;

    if (lat && lng) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

      const r = await fetch(url, {
        headers: { "User-Agent": "PraiaSegura/1.0" },
      });

      const data = await r.json();
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(data),
      };
    }

    if (q) {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q + ", Brasil"
      )}&addressdetails=1&limit=5`;

      const r = await fetch(url, {
        headers: { "User-Agent": "PraiaSegura/1.0" },
      });

      const data = await r.json();
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(data),
      };
    }

    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Informe q ou lat/lng" }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};