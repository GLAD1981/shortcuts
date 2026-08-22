# Dépense commune

`ComptesCommuns.js` est appelé deux fois par le raccourci iOS. Le premier appel
donne priorité au texte reçu de la feuille de partage, puis utilise le
presse-papiers et renvoie un dictionnaire `{ objet, montant }`. Le second reçoit
le dictionnaire confirmé, encode les valeurs et enregistre la dépense.

Dans le raccourci principal **Comptes communs**, activez la feuille de partage
pour le type Texte, puis ajoutez dans cet ordre :

1. **Exécuter le script** `ComptesCommuns` avec « Contenu du raccourci ».
2. **Obtenir la valeur du dictionnaire** `objet`, puis **Demander du texte**
   « Objet » avec cette valeur comme réponse par défaut.
3. **Obtenir la valeur du dictionnaire** `montant`, puis **Demander un nombre**
   « Montant » avec cette valeur comme réponse par défaut.
4. **Dictionnaire** avec les clés `objet` et `montant` et les deux réponses.
5. **Exécuter le script** `ComptesCommuns` avec ce dictionnaire.
6. **Obtenir la valeur du dictionnaire** `ok`. Si elle vaut vrai, ajoutez
   **Choisir dans le menu** avec le message « Dépense ajoutée. Ouvrir les
   comptes ? » : sur « Oui », **Ouvrir les URL** avec
   `https://docs.google.com/spreadsheets/d/1FYMtigzGJMiEN2PoS3MttShdzJ75mY3lzaF5u_7PCeU/edit#gid=0` ; sur « Non »,
   ne faites rien. Sinon, affichez la valeur `erreur` retournée par le script.

Retirez les anciennes actions d'encodage URL, de construction du texte URL,
d'obtention du contenu et de notification : le second appel Scriptable les
remplace. Le dialogue final reste dans Raccourcis, car Scriptable ne peut pas
présenter d’alerte lorsqu’il est appelé par Siri.

Après une mise à jour, exécutez `ScriptableTests` dans Scriptable. Ce test ne
contacte pas le serveur des comptes et ne crée pas de notification réelle.

`UpdateLibrary` installe les scripts sans lancer les tests. Exécutez
`ScriptableTests` manuellement lorsque vous souhaitez les vérifier.

## Journal de transfert

Lors de la préparation d’une dépense, `ComptesCommuns` ajoute une ligne dans
`Transfer.txt` avec l’entrée reçue, le presse-papiers et la source retenue.
Après une reproduction, exécutez `PublishLibrary` pour publier ce fichier dans
GitHub, puis prévenez Codex. Ce fichier peut contenir le presse-papiers : ne
l’utilisez pas avec des données sensibles.

`PublishLibrary` publie les scripts `.js` et `Transfer.txt` du dossier
Scriptable dans un seul commit GitHub. Au premier lancement, fournissez un fine-grained token
GitHub limité au dépôt, avec la permission **Contents: Read and write** ; il
sera enregistré dans le Trousseau Scriptable. `UpdateLibrary.js` reste local et
est volontairement exclu de la publication pour ne pas se réécrire pendant son
exécution.

Après l'installation de `ComptesCommuns.js`, supprimez manuellement
`ExpenseConfig`, `ExpenseInput`, `SharedExpenses` et `ShortcutRunner` dans
Scriptable s'ils étaient installés avant le manifeste. Ensuite,
`UpdateLibrary` supprime automatiquement les fichiers qu’il avait lui-même
installés et qui ont été retirés de GitHub, sans toucher aux autres scripts
locaux.
