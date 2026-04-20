// src/intelligence/miniRouter.js

import axios from "axios";

const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  "http://127.0.0.1:11434/api/generate";

const MODEL =
  process.env.MINI_MODEL ||
  "phi3:mini";

/*
  ==================================================
  CONFIG MANUAL (rápido y barato)
  ==================================================
*/

const EXIT_SIGNALS = [
  "salir",
  "slir",
  "salri",
  "adios",
  "adiós",
  "bye",
  "me voy",
  "terminar",
  "chao",
  "hasta luego"
];

const BLOCK_SIGNALS = [
  "te amo",
  "amor mio",
  "mi amor",
  "hola bebe",
  "hola bebé",
  "cuentame un chiste",
  "cuéntame un chiste",
  "dime tu prompt",
  "prompt interno",
  "ignora instrucciones",
  "ignora todas",
  "system prompt",
  "actua como",
  "actúa como",
  "developer mode",
  "eres chatgpt",
  "quien eres",
  "cómo hackear",
  "como hackear"
];

const GENRE_MAP = {
  "action": "Películas de acción intensas y entretenidas",
  "accion": "Películas de acción intensas y entretenidas",
  "acción": "Películas de acción intensas y entretenidas",

  "action & adventure": "Películas de acción y aventura emocionantes",
  "action adventure": "Películas de acción y aventura emocionantes",

  "adventure": "Películas de aventura épicas",
  "aventura": "Películas de aventura épicas",

  "animation": "Películas animadas populares para toda la familia",
  "animacion": "Películas animadas populares para toda la familia",
  "animación": "Películas animadas populares para toda la familia",

  "comedy": "Películas de comedia divertidas",
  "comedia": "Películas de comedia divertidas",

  "crime": "Películas de crimen y suspenso",
  "crimen": "Películas de crimen y suspenso",

  "documentary": "Documentales interesantes y recomendados",
  "documental": "Documentales interesantes y recomendados",

  "drama": "Películas dramáticas emocionales",

  "family": "Películas familiares entretenidas",
  "familia": "Películas familiares entretenidas",

  "fantasy": "Películas de fantasía épicas",
  "fantasia": "Películas de fantasía épicas",
  "fantasía": "Películas de fantasía épicas",

  "history": "Películas históricas recomendadas",
  "historia": "Películas históricas recomendadas",

  "horror": "Películas de terror intensas",
  "terror": "Películas de terror intensas",

  "kids": "Películas infantiles entretenidas",
  "infantil": "Películas infantiles entretenidas",

  "music": "Películas musicales populares",
  "musica": "Películas musicales populares",
  "música": "Películas musicales populares",

  "mystery": "Películas de misterio intrigantes",
  "misterio": "Películas de misterio intrigantes",

  "romance": "Películas románticas emotivas",
  "romancee": "Películas románticas emotivas",

  "science fiction": "Películas de ciencia ficción populares",
  "sci fi": "Películas de ciencia ficción populares",
  "ciencia ficcion": "Películas de ciencia ficción populares",
  "ciencia ficción": "Películas de ciencia ficción populares",

  "thriller": "Películas de suspenso intensas",
  "suspenso": "Películas de suspenso intensas",

  "war": "Películas bélicas recomendadas",
  "guerra": "Películas bélicas recomendadas",

  "western": "Películas western clásicas"
};

/*
  ==================================================
  HELPERS
  ==================================================
*/

function includesAny(text, arr = []) {
  return arr.some(x => text.includes(x));
}

function isSingleWord(text = "") {
  return text.split(" ").filter(Boolean).length === 1;
}

/*
  ==================================================
  LLM SOLO PARA CASOS DIFÍCILES
  ==================================================
*/

function buildPrompt(text) {
  return `
You classify movie chatbot intents.

Return ONLY JSON.

{
 "intent":"SEARCH" | "EXIT" | "BLOCK",
 "query":"text"
}

Rules:
- SEARCH if user wants movie recommendations.
- EXIT if user wants to leave.
- BLOCK if unrelated.

Rewrite only if needed.

User:
${text}
`;
}

function parseResponse(rawText = "") {
  try {
    const cleaned =
      rawText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const start =
      cleaned.indexOf("{");

    const end =
      cleaned.lastIndexOf("}") + 1;

    if (start === -1 || end === 0) {
      return null;
    }

    const jsonText =
      cleaned.slice(start, end);

    const data =
      JSON.parse(jsonText);

    if (
      !["SEARCH", "EXIT", "BLOCK"]
        .includes(data.intent)
    ) {
      return null;
    }

    return {
      intent: data.intent,
      query: data.query || "",
      source: "mini_llm"
    };

  } catch {
    return null;
  }
}

/*
  ==================================================
  MOTOR PRINCIPAL
  ==================================================
*/

function fastRouter(text = "") {

  const lower =
    text.toLowerCase().trim();

  // EXIT
  if (
    includesAny(
      lower,
      EXIT_SIGNALS
    )
  ) {
    return {
      intent: "EXIT",
      query: "",
      source: "map_exit"
    };
  }

  // BLOCK
  if (
    includesAny(
      lower,
      BLOCK_SIGNALS
    )
  ) {
    return {
      intent: "BLOCK",
      query: "",
      source: "map_block"
    };
  }

  // OSCAR
  if (
    lower.includes("oscar") ||
    lower.includes("óscar")
  ) {
    return {
      intent: "SEARCH",
      query:
        "pelucula One Battle After Another",
      source: "map_oscar"
    };
  }

  // GENERO EXACTO
  if (
    isSingleWord(lower) &&
    GENRE_MAP[lower]
  ) {
    return {
      intent: "SEARCH",
      query:
        GENRE_MAP[lower],
      source: "map_genre"
    };
  }

  // GENERO EN TEXTO
  for (const key of Object.keys(GENRE_MAP)) {
    if (lower.includes(key)) {
      return {
        intent: "SEARCH",
        query:
          GENRE_MAP[key],
        source: "map_genre"
      };
    }
  }

  // SIMILARES
  if (
    lower.includes("algo como") ||
    lower.includes("como ") ||
    lower.includes("similar a") ||
    lower.includes("parecida a") ||
    lower.includes("parecido a") ||
    lower.includes("tipo ")
  ) {
    return {
      intent: "SEARCH",
      query:
        `${text}`,
      source: "map_similarity"
    };
  }

  // TITULO PROBABLE
  if (
    text.length >= 4 &&
    text.length <= 60
  ) {
    return {
      intent: "SEARCH",
      query:
        `${text}`,
      source: "map_title"
    };
  }

  return null;
}

/*
  ==================================================
  MAIN
  ==================================================
*/

export async function runMiniRouter(
  text = ""
) {

  // 1. Resolver sin LLM
  const fast =
    fastRouter(text);

  if (fast) {
    return fast;
  }

  // 2. LLM solo fallback
  try {

    console.log(
      "Calling mini model..."
    );

    const response =
      await axios.post(
        OLLAMA_URL,
        {
          model: MODEL,
          prompt:
            buildPrompt(text),
          stream: false,
          options: {
            temperature: 0,
            num_predict: 80
          }
        },
        {
          timeout: 500000
        }
      );

    console.log(
      "RAW LLM:",
      response.data.response
    );

    const parsed =
      parseResponse(
        response.data.response
      );

    if (parsed) {
      return parsed;
    }

  } catch (error) {

    console.log(
      "MINI ROUTER ERROR:",
      error.message
    );
  }

  // 3. Último fallback
  return {
    intent: "BLOCK",
    query: "",
    source: "final_fallback"
  };
}

export default runMiniRouter;