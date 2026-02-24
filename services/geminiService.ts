import { BeachData, RiskLevel, GroundingSource } from "../types";

/* ===========================
   TIPOS AUXILIARES
=========================== */
type TextPart = { text: string };
type InlineDataPart = { inlineData: { mimeType: string; data: string } };
type GeminiPart = TextPart | InlineDataPart;

type GeminiMessage = {
  role: "user" | "model";
  parts: GeminiPart[];
};

/* ===========================
   HELPERS DE CHAMADA
=========================== */
const callGemini = async (payload: {
  model: string;
  contents: GeminiMessage[];
  config?: any;
}) => {
  const r = await fetch("/.netlify/functions/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.details ||
      JSON.stringify(data) ||
      "Erro ao chamar Gemini";
    throw new Error(msg);
  }

  return data;
};

const callGeo = async (params: { q?: string; lat?: number; lng?: number }) => {
  const url = new URL("/.netlify/functions/geo", window.location.origin);

  if (params.q) url.searchParams.set("q", params.q);
  if (typeof params.lat === "number") url.searchParams.set("lat", String(params.lat));
  if (typeof params.lng === "number") url.searchParams.set("lng", String(params.lng));

  const r = await fetch(url.toString());
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data?.error || "Erro ao consultar geolocalização");
  }

  return data;
};

/* ===========================
   CONFIG GEMINI
=========================== */
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
  const text = response?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON não encontrado na resposta.");

  const parsedData = JSON.parse(cleanJsonString(jsonMatch[0]));

  let rLevel = RiskLevel.UNKNOWN;
  const rLevelStr = (parsedData.riskLevel || "").toLowerCase();
  if (rLevelStr.includes("alto")) rLevel = RiskLevel.HIGH;
  else if (rLevelStr.includes("médio") || rLevelStr.includes("medio")) rLevel = RiskLevel.MEDIUM;
  else if (rLevelStr.includes("baixo")) rLevel = RiskLevel.LOW;

  const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks
    .map((chunk: any) => {
      if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
      if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
      return null;
    })
    .filter((s: any): s is GroundingSource => s !== null);

  const childFriendlyRaw = parsedData.childFriendly ?? parsedData.child_friendly;
  const childFriendly =
    childFriendlyRaw === true || String(childFriendlyRaw).toLowerCase() === "true";

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

/* ===========================
   HELPERS GEO
=========================== */
const normalizeState = (stateRaw?: string): string => {
  if (!stateRaw) return "";
  const s = stateRaw.toLowerCase();

  if (s.includes("espírito santo")) return "ES";
  if (s.includes("rio de janeiro")) return "RJ";
  if (s.includes("são paulo")) return "SP";
  if (s.includes("bahia")) return "BA";
  if (s.includes("santa catarina")) return "SC";
  if (s.includes("paraná")) return "PR";
  if (s.includes("ceará")) return "CE";
  if (s.includes("pernambuco")) return "PE";
  if (s.includes("alagoas")) return "AL";

  return stateRaw.toUpperCase();
};

/* ===========================
   FUNÇÕES PRINCIPAIS
=========================== */
export const identifyBeach = async (lat: number, lng: number): Promise<BeachData> => {
  const geo = await callGeo({ lat, lng });

  const address = geo?.address || {};
  const placeLabel = [
    geo?.name || address?.beach || address?.suburb || "Praia",
    address?.city || address?.town || address?.municipality || address?.county || "",
    normalizeState(address?.state || ""),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Analise a segurança da praia/local no Brasil:
${placeLabel}

Coordenadas aproximadas:
Lat ${lat}, Lng ${lng}

Forneça dados técnicos de balneabilidade com foco em segurança infantil.
Retorne JSON válido. Timestamp: ${Date.now()}`;

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }], // ✅ funciona melhor fora do AI Studio
    },
  });

  return parseGeminiResponse(response, { lat, lng });
};

export const searchBeach = async (query: string): Promise<BeachData> => {
  const q = query.trim();
  if (!q) throw new Error("Busca vazia.");

  const geoResults = await callGeo({ q });
  const first = Array.isArray(geoResults) ? geoResults[0] : null;

  if (!first) {
    throw new Error("Praia não encontrada.");
  }

  const address = first.address || {};
  const lat = Number(first.lat);
  const lng = Number(first.lon);

  const placeLabel = [
    first.name || address.beach || String(first.display_name || "").split(",")[0],
    address.city || address.town || address.municipality || address.county || "",
    normalizeState(address.state || ""),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Busca do usuário: "${q}"
Local encontrado:
${placeLabel}

Coordenadas aproximadas:
Lat ${lat}, Lng ${lng}

Forneça uma análise técnica de segurança da praia para crianças e banhistas.
Retorne JSON válido. Timestamp: ${Date.now()}`;

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });

  return parseGeminiResponse(response, { lat, lng });
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

  const contents: GeminiMessage[] = history.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: (msg.parts || []).map((p) => ({ text: p.text })),
  }));

  if (imageBase64 && contents.length) {
    const base64Data = imageBase64.split(",")[1] || imageBase64;
    contents[contents.length - 1].parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data,
      },
    });
  }

  const response = await callGemini({
    model: imageBase64 ? IDENTIFY_MODEL : ASSISTANT_MODEL,
    contents,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks
    .map((chunk: any) => {
      if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
      if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
      return null;
    })
    .filter((s: any): s is GroundingSource => s !== null);

  return {
    text: response?.text || "Sem resposta no momento.",
    sources,
  };
};