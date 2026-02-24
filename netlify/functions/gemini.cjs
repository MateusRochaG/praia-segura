exports.handler = async (event) => {
  try {
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

    const payload = JSON.parse(event.body || "{}");
    const { model, contents, config } = payload || {};

    if (!model || !contents) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing model or contents" }),
      };
    }

    // ✅ Converte para o formato REST do Gemini (sem "config" aninhado)
    const body = { contents };

    if (config && typeof config === "object") {
      if (config.systemInstruction) {
        body.systemInstruction =
          typeof config.systemInstruction === "string"
            ? { parts: [{ text: config.systemInstruction }] }
            : config.systemInstruction;
      }

      // ✅ remove googleMaps se vier (quebra fora do AI Studio)
      if (Array.isArray(config.tools)) {
        const tools = config.tools.filter((t) => !t.googleMaps);
        if (tools.length) body.tools = tools;
      }

      if (config.toolConfig) body.toolConfig = config.toolConfig;
      if (config.generationConfig) body.generationConfig = config.generationConfig;
      if (config.safetySettings) body.safetySettings = config.safetySettings;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};