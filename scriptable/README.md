# Dépense commune

`ShortcutRunner.js` est le seul script appelé par le raccourci iOS. Il donne
priorité au texte reçu de la feuille de partage, puis utilise le presse-papiers.
Il préremplit Objet et Montant avant l'envoi et affiche une notification qui
ouvre la feuille des comptes.

Dans Raccourcis : activez la feuille de partage pour le type Texte, puis ajoutez
une seule action **Exécuter le script** ciblant `ShortcutRunner`, avec
« Contenu du raccourci » comme entrée.

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
