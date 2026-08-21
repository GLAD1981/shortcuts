// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: rocket;
const sharedExpenses = importModule("SharedExpenses")
const result = await sharedExpenses.run(args.shortcutParameter)
Script.setShortcutOutput(result)
Script.complete()
