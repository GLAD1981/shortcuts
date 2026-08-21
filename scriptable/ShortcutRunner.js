const sharedExpenses = importModule("SharedExpenses")
const result = await sharedExpenses.run(args.shortcutParameter)
Script.setShortcutOutput(result)
Script.complete()
