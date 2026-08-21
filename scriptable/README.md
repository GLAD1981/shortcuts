# Dépense commune

`ComptesCommuns.js` est appelé deux fois par le raccourci iOS. Le premier appel
donne priorité au texte reçu de la feuille de partage, puis utilise le
presse-papiers et renvoie un dictionnaire `{ objet, montant }`. Le second reçoit
le dictionnaire confirmé, enregistre la dépense et affiche une notification qui
ouvre la feuille des comptes.

Dans Raccourcis : activez la feuille de partage pour le type Texte, puis ajoutez
dans cet ordre :

1. **Exécuter le script** `ComptesCommuns` avec « Contenu du raccourci ».
2. **Obtenir la valeur du dictionnaire** `objet`, puis **Demander du texte**
   « Objet » avec cette valeur comme réponse par défaut.
3. **Obtenir la valeur du dictionnaire** `montant`, puis **Demander un nombre**
   « Montant » avec cette valeur comme réponse par défaut.
4. **Dictionnaire** avec les clés `objet` et `montant` et les deux réponses.
5. **Exécuter le script** `ComptesCommuns` avec ce dictionnaire.

Retirez les actions d'encodage URL, de construction du texte URL, d'obtention du
contenu et de notification : le second appel Scriptable les remplace.

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
