// netlify/functions/gemini.cjs

exports.handler = async (event) => {
  try {
    // Só aceita POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Chave fica só no servidor (Netlify)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing GEMINI_API_KEY" };
    }

    // Corpo esperado: { model, contents, config }
    const payload = JSON.parse(event.body || "{}");
    const { model, contents, config } = payload;

    if (!model || !contents) {
      return { statusCode: 400, body: "Missing model or contents" };
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=` + apiKey;

    const body = { contents };
    if (config) body.config = config;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    // Cria um "text" (parecido com o SDK) pra facilitar seu parse atual
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
        // (opcional) CORS se você chamar de outro domínio
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
