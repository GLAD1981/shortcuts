# Dépense commune

`ShortcutRunner.js` est le seul script appelé par le raccourci iOS. Il donne
priorité au texte reçu de la feuille de partage, puis utilise le presse-papiers.
Il préremplit Objet et Montant avant l'envoi et affiche une notification qui
ouvre la feuille des comptes.

Dans Raccourcis : activez la feuille de partage pour le type Texte, puis ajoutez
une seule action **Exécuter le script** ciblant `ShortcutRunner`, avec
« Contenu du raccourci » comme entrée.
