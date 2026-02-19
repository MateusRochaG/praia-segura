// netlify/functions/gemini.cjs

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing GEMINI_API_KEY" };
    }

    const payload = JSON.parse(event.body || "{}");
    const { model, contents, config } = payload;

    if (!model || !contents) {
      return { statusCode: 400, body: "Missing model or contents" };
    }

    // ✅ Normaliza config pro formato REST
    const normalizedConfig = { ...(config || {}) };

    // ✅ REST precisa systemInstruction como objeto (não string)
    if (typeof normalizedConfig.systemInstruction === "string") {
      normalizedConfig.systemInstruction = {
        parts: [{ text: normalizedConfig.systemInstruction }],
      };
    }

    // ✅ AQUI é a correção principal: config vai no topo, não em body.config
    const body = {
      contents,
      ...normalizedConfig,
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        ?.filter(Boolean)
        ?.join("") || "";

    data.text = text;

    return {
      statusCode: r.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};
