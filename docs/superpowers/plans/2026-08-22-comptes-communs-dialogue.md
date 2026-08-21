# Comptes communs — dialogue Raccourcis–Scriptable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Remplacer les quatre scripts de dépense par le script unique
\`ComptesCommuns.js\`, appelé avant et après la saisie native de Raccourcis.

**Architecture:** Une entrée texte déclenche la préparation de
\`{ objet, montant }\`. Un dictionnaire confirmé déclenche l'envoi et la
notification. Raccourcis conserve les deux demandes de saisie et ne construit
plus l'URL ni la requête HTTP.

**Tech Stack:** JavaScriptCore de Scriptable, Raccourcis iOS, Node.js \`node:test\`.

**Spec:** \`docs/superpowers/specs/2026-08-22-comptes-communs-dialogue-design.md\`

## Global Constraints

- Ne jamais modifier ou retirer les lignes d'en-tête \`icon-color\` / \`icon-glyph\`.
- Raccourcis héberge toute interaction utilisateur ; aucun \`Alert\` dans le script.
- Le premier appel renvoie \`{ objet, montant }\`; le second reçoit le même dictionnaire.
- Ne créer aucun module utilitaire propre à cette seule fonctionnalité.

---

### Task 1: Écrire les tests de contrat

**Files:**
- Create: \`scriptable/test/comptes-communs.test.js\`
- Modify: \`scriptable/ScriptableTests.js\`
- Delete: \`scriptable/test/expense-input.test.js\`

**Interfaces:**
- Produces: les contrats \`prepare\`, \`submit\` et \`run\` de \`ComptesCommuns.js\`.

- [ ] **Step 1: Écrire les tests Node en échec**

\`\`\`javascript
const comptes = require("../ComptesCommuns")

test("prepare prioritizes share input and extracts fields", () => {
  assert.deepStrictEqual(
    comptes.prepare("Courses 1 234,50 €", "Ignoré 99"),
    { objet: "Courses", montant: "1234,50" }
  )
})

test("run submits a confirmed shortcut dictionary without Alert", async () => {
  const state = { url: "", notifications: 0 }
  const result = await comptes.run({ objet: "Courses", montant: "12,50" }, {
    createRequest: url => ({ response: { statusCode: 200 }, async loadString() {
      state.url = url
      return "Dépense ajoutée."
    } }),
    createNotification: () => ({ addAction() {}, async schedule() {
      state.notifications++
    } }),
    today: () => "2026-08-22"
  })
  assert.strictEqual(result.ok, true)
  assert.match(state.url, /object=Courses&amount=12%2C50/)
  assert.strictEqual(state.notifications, 1)
})
\`\`\`

Ajouter les mêmes scénarios dans \`ScriptableTests.js\`, avec dépendances
injectées. Conserver ses deux tests de publication GitHub.

- [ ] **Step 2: Vérifier l'échec**

Run: \`node --test scriptable/test/comptes-communs.test.js\`

Expected: FAIL car \`../ComptesCommuns\` n'existe pas.

### Task 2: Implémenter le script unique

**Files:**
- Create: \`scriptable/ComptesCommuns.js\`

**Interfaces:**
- Consumes: une chaîne ou un dictionnaire de \`args.shortcutParameter\`.
- Produces: \`prepare(shareInput, clipboard)\`, \`submit(payload, dependencies)\`,
  \`run(parameter, dependencies)\` et un dictionnaire de sortie.

- [ ] **Step 1: Créer l'en-tête et la préparation pure**

\`\`\`javascript
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: money-bill-alt;

function prepare(shareInput, clipboard) {
  const source = selectSource(shareInput, clipboard)
  const extracted = extractTextAndAmount(source)
  return { objet: extracted.text, montant: extracted.amount }
}
\`\`\`

Inclure les règles AHK existantes : priorité au texte partagé, montant terminal,
séparateurs de milliers et normalisation en virgule française.

- [ ] **Step 2: Implémenter l'envoi sans interface Scriptable**

Définir dans ce même fichier l'URL Apps Script et l'URL de la feuille.
Construire la requête avec \`object\`, \`amount\` et \`date\`. Après la réponse
exacte \`Dépense ajoutée.\`, programmer la notification ouvrant la feuille.
Pour un montant invalide, HTTP non 200 ou une réponse inattendue, retourner
\`{ ok: false, objet, montant, erreur }\` sans \`Alert\`.

- [ ] **Step 3: Implémenter le routeur des deux appels**

\`\`\`javascript
async function run(parameter, dependencies) {
  if (parameter && typeof parameter === "object" &&
      Object.hasOwn(parameter, "objet") && Object.hasOwn(parameter, "montant")) {
    return submit(parameter, dependencies)
  }
  return { ok: true, ...prepare(parameter, dependencies.getClipboard()) }
}

const result = await run(args.shortcutParameter)
Script.setShortcutOutput(result)
Script.complete()
\`\`\`

Le runtime par défaut injecte \`Pasteboard\`, \`Request\`, \`Notification\` et
\`DateFormatter\`; les tests injectent leurs remplacements.

- [ ] **Step 4: Vérifier le vert**

Run: \`node --test scriptable/test/comptes-communs.test.js\`

Expected: PASS.

### Task 3: Supprimer le découpage obsolète

**Files:**
- Delete: \`scriptable/ExpenseConfig.js\`
- Delete: \`scriptable/ExpenseInput.js\`
- Delete: \`scriptable/SharedExpenses.js\`
- Delete: \`scriptable/ShortcutRunner.js\`

**Interfaces:**
- Consumes: \`ComptesCommuns.js\` terminé.
- Produces: une seule entrée Scriptable pour les comptes communs.

- [ ] **Step 1: Retirer les imports et les quatre fichiers**

Adapter \`ScriptableTests.js\` pour importer \`ComptesCommuns\` et
\`PublishLibraryCore\` seulement. Ne supprimer aucun script de publication.

- [ ] **Step 2: Vérifier l'interdiction d'Alert**

Run: \`rg -n 'new Alert|createAlert|presentAlert' scriptable/ComptesCommuns.js\`

Expected: aucune correspondance.

### Task 4: Mettre à jour le guide et valider

**Files:**
- Modify: \`scriptable/README.md\`

**Interfaces:**
- Consumes: la sortie dictionnaire du script unique.
- Produces: le guide de configuration du raccourci et de migration Scriptable.

- [ ] **Step 1: Réécrire le guide du raccourci**

Documenter ces sept actions : préparation Scriptable, lecture de \`objet\`,
demande texte préremplie, lecture de \`montant\`, demande nombre préremplie,
dictionnaire confirmé et envoi Scriptable. Indiquer de retirer les actions URL,
Texte, Obtenir le contenu et notification actuelles.

- [ ] **Step 2: Documenter la migration**

Installer \`ComptesCommuns.js\`, puis supprimer manuellement les quatre anciens
scripts dans Scriptable : \`UpdateLibrary\` n'efface pas les scripts locaux qui
n'existent plus sur GitHub.

- [ ] **Step 3: Valider**

Run: \`node --test 'scriptable/test/**/*.test.js'\`

Expected: PASS sans échec.

Run: \`node --check scriptable/ComptesCommuns.js\`

Expected: exit code 0.

- [ ] **Step 4: Valider sur iPhone**

Exécuter \`ScriptableTests\`, puis lancer le raccourci depuis la feuille de
partage et depuis le presse-papiers. Confirmer les deux valeurs préremplies,
l'envoi unique et la notification ouvrant la feuille des comptes.
