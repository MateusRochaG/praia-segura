import { BeachData, RiskLevel, GroundingSource } from "../types";

/**
 * Chama a Netlify Function (server-side) que conversa com o Gemini usando a API key segura no Netlify.
 * A API key NUNCA deve ficar no front-end.
 */
const callGemini = async (payload: {
  model: string;
  contents: any;
  config?: any;
}) => {
  const r = await fetch("/.netlify/functions/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
};

const IDENTIFY_MODEL = "gemini-2.5-flash";
const ASSISTANT_MODEL = "gemini-3-flash-preview";

const IDENTIFY_SYSTEM_INSTRUCTION = `
Você é o sistema "Praia Segura", especialista em salvamento aquático e prevenção de afogamentos.
Sua tarefa é analisar a praia solicitada e retornar dados de segurança rigorosos.

Retorne APENAS um bloco JSON válido com a seguinte estrutura:

{
  "name": "Nome Oficial da Praia",
  "city": "Cidade",
  "state": "Estado (Sigla)",
  "riskLevel": "Baixo" | "Médio" | "Alto",
  "mainWarning": "Aviso de 1 frase de impacto",
  "hazards": ["Perigo 1", "Perigo 2"],
  "rockRisk": "Análise de pedras/limo",
  "seaCharacteristics": "Descrição técnica do mar",
  "depthDescription": "Perfil de profundidade",
  "childFriendly": boolean,
  "childFriendlyReason": "Justificativa específica",
  "lifeguardPresence": boolean,
  "bestTime": "Maré/Horário ideal",
  "accidentHistory": "Fatos históricos de segurança",
  "distanceToCenter": "Distância estimada"
}

REGRAS CRÍTICAS PARA O CAMPO 'childFriendlyReason':
1. PROIBIDO usar frases genéricas como "Condições favoráveis" ou "Atenção redobrada".
2. DEVE mencionar o nome da praia na justificativa.
3. DEVE descrever uma característica física real (ex: "A Praia de X possui mar de tombo com profundidade súbita", "Em Y existem canais de retorno invisíveis", "Z tem águas rasas por 50 metros sem ondas").
4. Se o dado for incerto, priorize a segurança: classifique como NÃO recomendado e explique os perigos potenciais.
`;

const cleanJsonString = (str: string): string => {
  let cleaned = str.replace(/```json\n?/g, "").replace(/```/g, "");
  cleaned = cleaned.replace(/\/\/.*$/gm, "");
  return cleaned.trim();
};

const parseGeminiResponse = (
  response: any,
  defaultCoords?: { lat: number; lng: number }
): BeachData => {
  const text = response.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON não encontrado na resposta.");

  const parsedData = JSON.parse(cleanJsonString(jsonMatch[0]));

  let rLevel = RiskLevel.UNKNOWN;
  const rLevelStr = (parsedData.riskLevel || "").toLowerCase();
  if (rLevelStr.includes("alto")) rLevel = RiskLevel.HIGH;
  else if (rLevelStr.includes("médio") || rLevelStr.includes("medio"))
    rLevel = RiskLevel.MEDIUM;
  else if (rLevelStr.includes("baixo")) rLevel = RiskLevel.LOW;

  const groundingChunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks
    .map((chunk: any) => {
      if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
      if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
      return null;
    })
    .filter((s: any): s is GroundingSource => s !== null);

  const childFriendlyRaw = parsedData.childFriendly ?? parsedData.child_friendly;
  const childFriendly =
    childFriendlyRaw === true ||
    String(childFriendlyRaw).toLowerCase() === "true";

  const rawReason =
    parsedData.childFriendlyReason ||
    parsedData.child_friendly_reason ||
    parsedData.childFriendlyDetails;

  const fallbackReason = childFriendly
    ? `A topografia de ${parsedData.name || "este local"} sugere águas calmas, mas a supervisão de um adulto é indispensável.`
    : `Riscos de correnteza ou profundidade em ${parsedData.name || "este local"} tornam o banho perigoso para crianças.`;

  const childFriendlyReason = rawReason || fallbackReason;

  return {
    ...parsedData,
    riskLevel: rLevel,
    childFriendly,
    childFriendlyReason,
    coordinates: parsedData.coordinates || defaultCoords,
    sources,
  };
};

export const identifyBeach = async (
  lat: number,
  lng: number
): Promise<BeachData> => {
  const prompt = `Analise a praia nas coordenadas: Lat ${lat}, Lng ${lng}. Foque na segurança infantil. Timestamp: ${Date.now()}`;

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    // ✅ FORMATO CERTO PARA REST: array role/parts
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: { latLng: { latitude: lat, longitude: lng } },
      },
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
    },
  });

  return parseGeminiResponse(response, { lat, lng });
};

export const searchBeach = async (query: string): Promise<BeachData> => {
  const prompt = `Análise detalhada de segurança: "${query}". Forneça dados técnicos sobre balneabilidade para crianças. Timestamp: ${Date.now()}`;

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    // ✅ FORMATO CERTO PARA REST: array role/parts
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    config: {
      tools: [{ googleMaps: {} }],
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
    },
  });

  return parseGeminiResponse(response);
};

export const getSafetyAdvice = async (
  history: { role: string; parts: { text: string }[] }[],
  currentBeach?: BeachData,
  imageBase64?: string
) => {
  const systemInstruction = `Você é o Assistente de Segurança do app "Praia Segura".
Seu tom deve ser educativo e preventivo.
CONTEXTO: Praia ${currentBeach ? currentBeach.name : "Desconhecida"}.
Responda priorizando a vida.`;

  // Histórico no formato da API (user/model)
  const contents = history.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: msg.parts,
  }));

  // Se tiver imagem, adiciona no último item
  if (imageBase64 && contents.length) {
    const base64Data = imageBase64.split(",")[1] || imageBase64;
    contents[contents.length - 1].parts = [
      ...(contents[contents.length - 1].parts || []),
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      },
    ];
  }

  const response = await callGemini({
    model: imageBase64 ? IDENTIFY_MODEL : ASSISTANT_MODEL,
    contents,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  const groundingChunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks
    .map((chunk: any) => {
      if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
      if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
      return null;
    })
    .filter((s: any): s is GroundingSource => s !== null);

  return {
    text: response.text || "Sem resposta no momento.",
    sources,
  };
};
