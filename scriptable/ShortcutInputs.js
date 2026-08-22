// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: keyboard;
function getDependencies(overrides = {}) {
  return Object.assign({
    createCallbackURL: url => new CallbackURL(url)
  }, overrides)
}

async function open(shortcutName, configuration, overrides) {
  const callback = getDependencies(overrides).createCallbackURL("shortcuts://x-callback-url/run-shortcut")
  callback.addParameter("name", shortcutName)
  callback.addParameter("input", "text")
  callback.addParameter("text", JSON.stringify(configuration))
  const response = await callback.open()
  return String(response && response.result != null ? response.result : "")
}

function text(configuration, overrides) {
  return open("textInputbox", {
    object: configuration.object,
    default: configuration.default,
    multiLine: Boolean(configuration.multiLine)
  }, overrides)
}

function number(configuration, overrides) {
  return open("numberInputBox", {
    object: configuration.object,
    default: configuration.default,
    negative: Boolean(configuration.negative),
    decimals: Boolean(configuration.decimals)
  }, overrides)
}

module.exports = { text, number }
