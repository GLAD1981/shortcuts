# Règles du projet

À chaque modification de code, ajouter ou adapter les tests pertinents dans
`scriptable/ScriptableTests.js` lorsque le comportement peut être vérifié
sans effet externe. Exécuter ensuite `ScriptableTests` dans Scriptable lors de
toute validation sur iPhone.

Conserver également les tests Node sous `scriptable/test/` pour les fonctions
pures et les régressions reproductibles hors iOS.

Les commentaires d'en-tête ajoutés par Scriptable (notamment `icon-color` et
`icon-glyph`) sont autoritaires : ne jamais les modifier ni les supprimer, et
prendre la version publiée lorsqu'elle est disponible. Lors d'un diagnostic,
une ligne signalée par Scriptable est décalée vers le bas dans la source du
dépôt d'autant de lignes d'en-tête ou de mise en forme présentes avant le code.

Pour les raccourcis iOS, l'interface et la saisie restent dans Raccourcis ;
Scriptable prépare les données, les transmet par dictionnaire, puis réalise les
requêtes. Préférer un script d'entrée unique par fonctionnalité. Extraire un
module utilitaire uniquement lorsqu'il est utile à au moins deux raccourcis,
puis réutiliser ce même module plutôt que dupliquer sa logique.
