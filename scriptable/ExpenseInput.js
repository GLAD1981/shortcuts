// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: money-bill-alt;
function trimText(value) {
  return String(value == null ? "" : value)
    .replace(/\u00A0|\u202F/g, " ")
    .trim()
}

function toText(value) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("\n")
  return ""
}

function selectSource(shareSheetInput, clipboardText) {
  const shared = trimText(toText(shareSheetInput))
  return shared || trimText(clipboardText)
}

function parseAmount(value) {
  const text = trimText(value).replace(/^€\s*|\s*€$/g, "")
  if (/^[+-]?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) {
    return { found: true, value: text.replace(/[ .]/g, "") }
  }
  if (/^[+-]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) {
    return { found: true, value: text.replace(/[ ,]/g, "").replace(".", ",") }
  }
  return { found: false, value: "" }
}

function extractTextAndAmount(value) {
  const text = trimText(value)
  const wholeAmount = parseAmount(text)
  if (wholeAmount.found) return { text: "", amount: wholeAmount.value }

  const trailingPatterns = [
    /(?:^|\s)([+-]?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d{1,2})?\s*€?)$/,
    /(?:^|\s)([+-]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{1,2})?\s*€?)$/
  ]
  for (const pattern of trailingPatterns) {
    const match = pattern.exec(text)
    if (!match) continue
    const trailingAmount = parseAmount(match[1])
    if (trailingAmount.found) {
      return { text: trimText(text.slice(0, match.index)), amount: trailingAmount.value }
    }
  }
  return { text, amount: "" }
}

module.exports = { trimText, selectSource, parseAmount, extractTextAndAmount }
