
import { GoogleGenAI } from "@google/genai";
import { BeachData, RiskLevel, GroundingSource } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  let cleaned = str.replace(/```json\n?/g, '').replace(/```/g, '');
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  return cleaned.trim();
};

const parseGeminiResponse = (response: any, defaultCoords?: {lat: number, lng: number}): BeachData => {
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON não encontrado na resposta.");
    
    const parsedData = JSON.parse(cleanJsonString(jsonMatch[0]));

    let rLevel = RiskLevel.UNKNOWN;
    const rLevelStr = (parsedData.riskLevel || '').toLowerCase();
    if (rLevelStr.includes('alto')) rLevel = RiskLevel.HIGH;
    else if (rLevelStr.includes('médio') || rLevelStr.includes('medio')) rLevel = RiskLevel.MEDIUM;
    else if (rLevelStr.includes('baixo')) rLevel = RiskLevel.LOW;

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks.map((chunk: any) => {
        if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
        if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
        return null;
    }).filter((s: any): s is GroundingSource => s !== null);

    const childFriendlyRaw = parsedData.childFriendly ?? parsedData.child_friendly;
    const childFriendly = childFriendlyRaw === true || String(childFriendlyRaw).toLowerCase() === 'true';
    
    const rawReason = parsedData.childFriendlyReason || parsedData.child_friendly_reason || parsedData.childFriendlyDetails;
    
    // Fallback ainda mais específico caso a IA falhe
    const fallbackReason = childFriendly 
        ? `A topografia de ${parsedData.name || 'este local'} sugere águas calmas, mas a supervisão de um adulto é indispensável.` 
        : `Riscos de correnteza ou profundidade em ${parsedData.name || 'este local'} tornam o banho perigoso para crianças.`;

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

export const identifyBeach = async (lat: number, lng: number): Promise<BeachData> => {
  const response = await ai.models.generateContent({
    model: IDENTIFY_MODEL,
    contents: `Analise a praia nas coordenadas: Lat ${lat}, Lng ${lng}. Foque na segurança infantil. Timestamp: ${Date.now()}`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } },
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
    },
  });
  return parseGeminiResponse(response, { lat, lng });
};

export const searchBeach = async (query: string): Promise<BeachData> => {
  const response = await ai.models.generateContent({
    model: IDENTIFY_MODEL,
    contents: `Análise detalhada de segurança: "${query}". Forneça dados técnicos sobre balneabilidade para crianças. Timestamp: ${Date.now()}`,
    config: {
      tools: [{ googleMaps: {} }],
      systemInstruction: IDENTIFY_SYSTEM_INSTRUCTION,
    },
  });
  return parseGeminiResponse(response);
};

export const getSafetyAdvice = async (
    history: {role: string, parts: {text: string}[]}[], 
    currentBeach?: BeachData,
    imageBase64?: string
) => {
    const systemInstruction = `Você é o Assistente de Segurança do app "Praia Segura".
    Seu tom deve ser educativo e preventivo. 
    CONTEXTO: Praia ${currentBeach ? currentBeach.name : 'Desconhecida'}.
    Responda priorizando a vida.`;

    const geminiHistory = history.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: msg.parts
    }));

    const chat = ai.chats.create({
        model: imageBase64 ? IDENTIFY_MODEL : ASSISTANT_MODEL,
        history: geminiHistory,
        config: {
            systemInstruction: systemInstruction,
            tools: [{ googleSearch: {} }], 
        }
    });

    const lastMsgText = history[history.length - 1].parts[0].text;
    let messageParts: any[] = [{ text: lastMsgText }];

    if (imageBase64) {
        const base64Data = imageBase64.split(',')[1] || imageBase64;
        messageParts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
            }
        });
    }

    const response = await chat.sendMessage({
        message: messageParts
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks.map((chunk: any) => {
        if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
        if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
        return null;
    }).filter((s: any): s is GroundingSource => s !== null);

    return {
        text: response.text || "Sem resposta no momento.",
        sources
    };
}
