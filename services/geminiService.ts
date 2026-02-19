import { BeachData, RiskLevel, GroundingSource } from "../types";

/**
 * Netlify Function (server-side) que conversa com o Gemini usando a API key segura no Netlify.
 */
const callGemini = async (payload: { model: string; contents: any; config?: any }) => {
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

/**
 * Netlify Function (server-side) que faz geocoding/reverse geocoding via Nominatim (OpenStreetMap)
 * sem precisar de API key.
 */
const callGeo = async (payload: { q?: string; lat?: number; lng?: number }) => {
  const r = await fetch("/.netlify/functions/geo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data);
    throw new Error(msg);
  }
  return data as {
    display_name: string;
    lat: number;
    lng: number;
    city?: string;
    state?: string;
    stateCode?: string;
  };
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
  else if (rLevelStr.includes("médio") || rLevelStr.includes("medio")) rLevel = RiskLevel.MEDIUM;
  else if (rLevelStr.includes("baixo")) rLevel = RiskLevel.LOW;

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
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

// ✅ GPS: usa Nominatim reverse e manda pro Gemini
export const identifyBeach = async (lat: number, lng: number): Promise<BeachData> => {
  const place = await callGeo({ lat, lng });

  const prompt = `
Local aproximado pelo GPS:
- display_name: ${place.display_name}
- coordenadas: ${place.lat}, ${place.lng}
- cidade: ${place.city || "desconhecida"}
- estado: ${place.stateCode || place.state || "desconhecido"}

Com base nisso, identifique a PRAIA MAIS PRÓXIMA e gere o JSON de segurança. 
Se não der para afirmar o nome exato, escolha a melhor correspondência e explique os riscos com foco em segurança infantil.
Timestamp: ${Date.now()}
`.trim();

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
      // ajuda o modelo a devolver JSON mais certinho
      responseMimeType: "application/json",
    },
  });

  return parseGeminiResponse(response, { lat: place.lat, lng: place.lng });
};

// ✅ Busca digitada: usa Nominatim search e manda pro Gemini
export const searchBeach = async (query: string): Promise<BeachData> => {
  const place = await callGeo({ q: query });

  const prompt = `
Busca do usuário: "${query}"
Resultado de localização:
- display_name: ${place.display_name}
- coordenadas: ${place.lat}, ${place.lng}
- cidade: ${place.city || "desconhecida"}
- estado: ${place.stateCode || place.state || "desconhecido"}

Agora gere o JSON de segurança para a PRAIA encontrada. 
Use o nome oficial mais adequado.
Timestamp: ${Date.now()}
`.trim();

  const response = await callGemini({
    model: IDENTIFY_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
    },
  });

  return parseGeminiResponse(response, { lat: place.lat, lng: place.lng });
};

// ✅ Chat (com imagem opcional) — corrige o erro do inlineData usando "any"
export const getSafetyAdvice = async (
  history: { role: string; parts: any[] }[],
  currentBeach?: BeachData,
  imageBase64?: string
) => {
  const systemInstruction = `Você é o Assistente de Segurança do app "Praia Segura".
Seu tom deve ser educativo e preventivo.
CONTEXTO: Praia ${currentBeach ? currentBeach.name : "Desconhecida"}.
Responda priorizando a vida.`;

  const contents = history.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: msg.parts,
  }));

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

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
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