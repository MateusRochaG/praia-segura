export const handler = async (event) => {
  try {
    // OPTIONS (pré-flight) - não atrapalha
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

    // Só aceita POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
      };
    }

    // Corpo esperado: { model, contents, config }
    const payload = JSON.parse(event.body || "{}");
    const { model, contents, config } = payload || {};

    if (!model || !contents) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing model or contents" }),
      };
    }

    // ✅ Endpoint REST
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    // ✅ REST espera tools/toolConfig/systemInstruction no TOP LEVEL
    const body = { contents };

    if (config && typeof config === "object") {
      const cfg = { ...config };

      // Se vier string, converte para o formato esperado pelo REST
      if (typeof cfg.systemInstruction === "string") {
        cfg.systemInstruction = { parts: [{ text: cfg.systemInstruction }] };
      }

      Object.assign(body, cfg); // ✅ aqui é o ponto principal
    }

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey, // ✅ melhor que ?key=...
      },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));

    // Helper "text" pra manter compatível com seu parse atual
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        ?.filter(Boolean)
        ?.join("") || "";

    return {
      statusCode: r.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ ...data, text }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};
