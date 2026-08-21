# Dialogue Raccourcis–Scriptable — comptes communs

## Objectif

Réaménager le raccourci « Comptes communs » pour que Raccourcis assure la
saisie native, tandis que Scriptable prépare l'entrée puis enregistre la
dépense. Le raccourci doit fonctionner depuis une feuille de partage ou le
presse-papiers sans utiliser d'`Alert` Scriptable.

## Principes de projet

- Raccourcis possède toute interface utilisateur : demandes de texte, de
  nombre et affichage éventuel.
- Scriptable possède la logique, les appels réseau et les notifications.
- Les échanges Raccourcis–Scriptable utilisent des dictionnaires nommés.
- Un script Scriptable d'entrée couvre une fonctionnalité. Un module
  utilitaire n'est créé que s'il est réellement réutilisé par au moins deux
  raccourcis.
- Les commentaires d'en-tête Scriptable, dont `icon-color` et `icon-glyph`,
  restent inchangés et la version publiée fait autorité.

## Architecture retenue

Un seul script exécutable, `ComptesCommuns.js`, remplace `ShortcutRunner.js`,
`SharedExpenses.js`, `ExpenseInput.js` et `ExpenseConfig.js`.

Il accepte deux formes d'entrée via `args.shortcutParameter` :

1. Une entrée texte ou vide : il prend en priorité le texte de la feuille de
   partage, puis le presse-papiers, applique les règles d'analyse AHK et
   renvoie `{ objet, montant }`.
2. Un dictionnaire `{ objet, montant }` : il normalise le montant, appelle
   l'Apps Script des comptes, puis planifie la notification qui ouvre la
   feuille des comptes.

La seconde forme renvoie aussi un dictionnaire de résultat
`{ ok, objet, montant, erreur? }` et ne crée aucun `Alert`.

## Raccourci iOS cible

Le raccourci conserve la feuille de partage pour le type Texte et exécute les
actions suivantes :

1. Exécuter `ComptesCommuns` avec le contenu du raccourci.
2. Lire `objet` dans le dictionnaire renvoyé.
3. Demander un texte « Objet », avec cette valeur comme réponse par défaut.
4. Lire `montant` dans le dictionnaire renvoyé.
5. Demander un nombre « Montant », avec cette valeur comme réponse par défaut.
6. Construire le dictionnaire `{ objet, montant }` à partir des deux réponses.
7. Exécuter `ComptesCommuns` avec ce dictionnaire.

Les actions d'encodage URL, de construction d'URL, de requête HTTP et de
notification actuellement dans le raccourci sont retirées. Elles sont gérées
par Scriptable lors du second appel.

## Gestion des erreurs

Si l'objet ou le montant est invalide après la saisie native, le second appel
ne contacte pas le serveur et renvoie `{ ok: false, erreur }`. Si la requête
échoue, il renvoie la même forme avec le message réseau. Le raccourci peut
alors afficher cette valeur par son mécanisme d'interface natif.

## Tests et validation

Les tests Node vérifieront séparément la préparation et l'envoi à l'aide de
dépendances injectées. `ScriptableTests` vérifiera les deux modes sans effet
réseau réel. La validation iPhone confirmera les valeurs par défaut dans les
deux demandes Raccourcis, l'envoi, puis la notification ouvrant la feuille des
comptes.
