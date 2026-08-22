# Dépense commune

`ComptesCommuns.js` est appelé une seule fois par le raccourci iOS. Il donne
priorité au texte reçu de la feuille de partage, puis utilise le presse-papiers,
préremplit les deux saisies, enregistre la dépense et affiche une notification
qui ouvre la feuille des comptes.

Le raccourci principal **Comptes communs** ne contient plus qu’une action :

1. Activez sa feuille de partage pour le type Texte.
2. Ajoutez **Exécuter le script** `ComptesCommuns` avec « Contenu du
   raccourci ».

Les deux mini-raccourcis suivants sont créés une fois et réutilisés par les
autres fonctionnalités. Ils reçoivent un dictionnaire JSON, affichent la saisie
native, puis renvoient la réponse texte à Scriptable :

- `textInputbox` : « Obtenir le dictionnaire de l’entrée de raccourci », puis
  obtient les clés `object`, `default`, `multiLine` et les branche sur
  « Demander Texte ».
- `numberInputBox` : même principe avec les clés `object`, `default`,
  `negative`, `decimals` et « Demander Nombre ».

`ShortcutInputs.js` encapsule l’appel de ces deux raccourcis via leur URL de
retour. Les autres scripts Scriptable doivent réutiliser ce module pour les
saisies texte et numériques, au lieu de recréer des dialogues semblables.

Retirez les anciennes actions d'encodage URL, de construction du texte URL,
d'obtention du contenu et de notification : Scriptable les remplace.

Après une mise à jour, exécutez `ScriptableTests` dans Scriptable. Ce test ne
contacte pas le serveur des comptes et ne crée pas de notification réelle.

`UpdateLibrary` exécute aussi `ScriptableTests` et affiche son résultat après
l'installation.

`PublishLibrary` publie tous les scripts `.js` du dossier Scriptable dans un
seul commit GitHub. Au premier lancement, fournissez un fine-grained token
GitHub limité au dépôt, avec la permission **Contents: Read and write** ; il
sera enregistré dans le Trousseau Scriptable. `UpdateLibrary.js` reste local et
est volontairement exclu de la publication pour ne pas se réécrire pendant son
exécution.

Après l'installation de `ComptesCommuns.js`, supprimez manuellement
`ExpenseConfig`, `ExpenseInput`, `SharedExpenses` et `ShortcutRunner` dans
Scriptable. `UpdateLibrary` n'efface pas les scripts locaux absents de GitHub.
