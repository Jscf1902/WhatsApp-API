import normalizeText from "./normalize.js";
import evaluateRules from "./rulesEngine.js";
import runMiniRouter from "./miniRouter.js";

export async function processIntent(
  rawMessage = ""
) {

  const text =
    normalizeText(rawMessage);

  const rules =
    evaluateRules(text);

  // BLOCK técnico
  if (
    rules.action === "BLOCK"
  ) {
    return {
      intent: "BLOCK",
      query: "",
      source: "rules",
      reason: rules.reason
    };
  }

  // EXIT rápido
  if (
    rules.action === "EXIT"
  ) {
    return {
      intent: "EXIT",
      query: "",
      source: "rules",
      reason: rules.reason
    };
  }

  // LLM principal
  const result =
    await runMiniRouter(text);

  // Seguridad extra
  if (
    !result ||
    !result.intent
  ) {
    return {
      intent: "BLOCK",
      query: "",
      source: "orchestrator_fallback"
    };
  }

  return {
    intent: result.intent,
    query:
      result.query || "",
    source:
      result.source ||
      "mini_llm"
  };
}

export default processIntent;