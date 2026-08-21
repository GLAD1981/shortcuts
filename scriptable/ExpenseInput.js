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

  const parts = /^(.*\S)\s+(.+)$/.exec(text)
  if (parts) {
    const trailingAmount = parseAmount(parts[2])
    if (trailingAmount.found) {
      return { text: trimText(parts[1]), amount: trailingAmount.value }
    }
  }
  return { text, amount: "" }
}

module.exports = { trimText, selectSource, parseAmount, extractTextAndAmount }
