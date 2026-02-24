// netlify/functions/gemini.cjs

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing GEMINI_API_KEY on Netlify" }),
      };
    }

    const payload = JSON.parse(event.body || "{}");
    const { model, contents, config } = payload;

    if (!model || !contents) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing model or contents" }),
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${apiKey}`;

    // ⚠️ Para a API REST do Gemini, o campo systemInstruction precisa estar no formato parts
    let finalConfig = config;
    if (config?.systemInstruction && typeof config.systemInstruction === "string") {
      finalConfig = {
        ...config,
        systemInstruction: {
          parts: [{ text: config.systemInstruction }],
        },
      };
    }

    const body = {
      contents,
      ...(finalConfig ? { generationConfig: finalConfig.generationConfig } : {}),
      ...(finalConfig?.tools ? { tools: finalConfig.tools } : {}),
      ...(finalConfig?.toolConfig ? { toolConfig: finalConfig.toolConfig } : {}),
      ...(finalConfig?.systemInstruction
        ? { systemInstruction: finalConfig.systemInstruction }
        : {}),
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));

    // Monta text igual SDK (pra não quebrar seu parse)
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        ?.filter(Boolean)
        ?.join("") || "";

    data.text = text;

    // Retorna o erro real do Google (pra você ver no Network)
    if (!r.ok) {
      return {
        statusCode: r.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Gemini API error",
          details: data,
        }),
      };
    }

    return {
      statusCode: 200,
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
      body: JSON.stringify({
        error: "Function crash",
        details: String(e?.message || e),
      }),
    };
  }
};