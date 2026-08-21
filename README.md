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

Chaque fonctionnalité utilise un script Scriptable d'entrée unique. Les raccourcis iOS transmettent des dictionnaires entre leurs étapes de saisie native et Scriptable ; les utilitaires ne sont extraits que s'ils sont partagés par plusieurs raccourcis.
