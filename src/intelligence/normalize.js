// src/intelligence/normalize.js

function removeAccents(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseRepeatedChars(text) {
  return text.replace(/([a-z])\1{2,}/gi, "$1$1");
}

function removeSpecialChars(text) {
  return text.replace(/[^\w\s]/g, " ");
}

function collapseSpaces(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeText(input = "") {
  if (!input || typeof input !== "string") {
    return "";
  }

  let text = input.toLowerCase();

  text = removeAccents(text);
  text = collapseRepeatedChars(text);
  text = removeSpecialChars(text);
  text = collapseSpaces(text);

  return text;
}

export default normalizeText;