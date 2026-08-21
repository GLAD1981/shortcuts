# shortcuts

Bibliothèque JavaScript pour Scriptable et raccourcis iOS.

## Déploiement

- Dépôt source : https://github.com/GLAD1981/shortcuts
- Les scripts destinés à Scriptable doivent être placés sous `scriptable/`.
- Le script de mise à jour télécharge automatiquement tous les fichiers `.js` de ce dossier.
- Ne pas stocker de secrets dans le dépôt ; utiliser le Trousseau Scriptable.

## Pushcut Pro

Pushcut Pro est disponible pour ce projet. Il peut être utilisé pour déclencher des raccourcis à distance, planifier des automatisations et envoyer des notifications lorsque cela simplifie le flux.

## Convention Scriptable

Le point d'entrée stable est `ShortcutRunner.js`. Les raccourcis iOS doivent transmettre une commande et ses données à ce runner ; la logique métier reste dans les modules versionnés sous `scriptable/`.
