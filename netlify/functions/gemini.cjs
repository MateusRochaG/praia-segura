// netlify/functions/gemini.cjs
exports.handler = async (event) => {
  try {
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

    // ✅ URL REST do Gemini
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=` + apiKey;

    // ✅ A API NÃO aceita "config" dentro do body.
    // Precisamos espalhar (merge) o config no body
    const body = {
      contents,
      ...(config || {}),
    };

    // ✅ systemInstruction no REST pode precisar ser objeto
    if (typeof body.systemInstruction === "string") {
      body.systemInstruction = { parts: [{ text: body.systemInstruction }] };
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    // ✅ Cria "text" para seu parse (igual SDK)
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