// src/intelligence/rulesEngine.js

function isEmpty(text = "") {
  return !text || !text.trim();
}

function isOnlyEmojiOrSymbols(text = "") {
  return /^[^a-z0-9]+$/i.test(text);
}

function isRepeatedNoise(text = "") {
  return /^([a-z0-9])\1{5,}$/i.test(text);
}

function isPromptInjection(text = "") {
  const patterns = [
    "ignora instrucciones",
    "ignora todas",
    "olvida instrucciones",
    "dime tu prompt",
    "prompt interno",
    "system prompt",
    "revela instrucciones",
    "actua como",
    "actúa como",
    "developer mode"
  ];

  return patterns.some(p =>
    text.includes(p)
  );
}

export function evaluateRules(
  text = ""
) {

  if (isEmpty(text)) {
    return {
      action: "BLOCK",
      reason: "empty_message"
    };
  }

  if (isOnlyEmojiOrSymbols(text)) {
    return {
      action: "BLOCK",
      reason: "emoji_only"
    };
  }

  if (isRepeatedNoise(text)) {
    return {
      action: "BLOCK",
      reason: "noise_message"
    };
  }

  if (isPromptInjection(text)) {
    return {
      action: "BLOCK",
      reason: "prompt_injection"
    };
  }

  return {
    action: "CONTINUE",
    reason: "pass_to_llm"
  };
}

export default evaluateRules;