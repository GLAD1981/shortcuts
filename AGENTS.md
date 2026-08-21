# Règles du projet

À chaque modification de code, ajouter ou adapter les tests pertinents dans
`scriptable/ScriptableTestSuite.js` lorsque le comportement peut être vérifié
sans effet externe. Exécuter ensuite `ScriptableTests` dans Scriptable lors de
toute validation sur iPhone.

Conserver également les tests Node sous `scriptable/test/` pour les fonctions
pures et les régressions reproductibles hors iOS.
