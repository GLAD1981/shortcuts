# Déploiement Universal Clipboard v2 — Scriptable et Firebase

## Périmètre

Ce déploiement réutilise le projet Firebase Realtime Database `Personal Tools`
et le secret historique. Il ne crée ni projet Firebase, ni Cloud Storage, ni
fonction Cloud, ni facturation Blaze. Il n'existe donc pas de commande
`firebase deploy` dans ce flux : les clients utilisent l'API REST de la base
déjà en place sous `/apps/universalClipboard/v2`.

Le protocole v1 reste actif jusqu'à validation des deux sens. Pushcut ne reçoit
que l'identifiant hexadécimal du transfert ; aucun texte, fichier, Base64 ou
secret ne traverse Pushcut.

## 1. Publier et installer le script

1. Fusionner le commit validé contenant `scriptable/UniversalClipboard.js`
   dans `main` du dépôt `GLAD1981/shortcuts`.
2. Sur l'iPhone, exécuter `UpdateLibrary` avant toute exécution de
   `PublishLibrary`. Cette étape installe le nouveau script depuis GitHub et
   évite qu'un miroir iPhone ancien le retire.
3. Ouvrir les réglages du script `UniversalClipboard` et activer les types de
   feuille de partage Texte et URL de fichier.
4. Activer « Run in App » pour les transferts de fichiers volumineux ; la
   documentation Scriptable avertit que l'extension de partage peut être
   interrompue pour de gros fichiers.

## 2. Enregistrer le secret Firebase

Exécuter `UniversalClipboard` depuis un raccourci avec le dictionnaire :

```json
{ "action": "configure" }
```

Le script affiche un champ sécurisé et stocke la valeur sous la clé Trousseau
`UniversalClipboard.Firebase.PersonalTools.RealtimeDatabase`. Ne jamais placer
la valeur dans le raccourci, un fichier, Pushcut, Git, une capture ou un
journal. Le code source ne contient que l'URL publique de la base.

## 3. Construire le raccourci d'envoi iPhone → PC

Le raccourci conserve l'interface native et appelle un seul script.

- Pour du texte, transmettre un dictionnaire
  `{ "action": "send", "text": <texte> }`.
- Pour des fichiers, transmettre
  `{ "action": "send", "files": <liste de chemins> }`.
- Une exécution directe depuis la feuille de partage est également acceptée :
  les URL de fichiers ont priorité sur le texte.

Le script refuse les dossiers, les objets Image sans fichier original, plus de
10 fichiers, plus de 25 Mio par fichier ou plus de 100 Mio au total. La file
Firebase n'est publiée qu'après l'index, le manifeste, les métadonnées, tous
les blocs et leur relecture.

## 4. Construire la réception PC → iPhone

La notification Pushcut transporte uniquement les 32 caractères hexadécimaux
du `transferId`. Son action lance un raccourci qui appelle
`UniversalClipboard` avec :

```json
{ "action": "receive", "transferId": "<identifiant reçu>" }
```

Le script vérifie la file `toIphone`, l'index `ready`, les métadonnées, chaque
bloc et le SHA-256 global. Le texte est copié dans le presse-papiers. Les
fichiers sont écrits d'abord dans un dossier de staging iCloud, puis déplacés
vers `iCloud Drive/Scriptable/Universal Clipboard/Received`. Une image
décodable est aussi copiée dans le presse-papiers ; l'échec de cette copie
secondaire est signalé comme dégradation sans supprimer le fichier reçu.

L'identifiant appliqué est enregistré localement avant le nettoyage Firebase.
Le nettoyage supprime dans l'ordre la file, le payload et l'index. Une panne de
nettoyage ne répète donc pas le collage ou l'écriture locale.

## 5. Validation progressive

1. Exécuter `ScriptableTests` dans Scriptable. Attendu : tous les tests
   Universal Clipboard sont `PASS` sans réseau ni effet réel.
2. Conserver le lecteur Windows v1 et installer le lecteur v2 en parallèle.
3. Valider iPhone → PC avec un texte distinctif, un PNG original, un JPEG
   original et plusieurs fichiers mélangés.
4. Vérifier taille et SHA-256 du fichier reçu, collage d'image et suppression
   Firebase.
5. Tester la reprise après coupure réseau et confirmer l'absence de doublon.
6. Tester les frontières : 25/26 Mio, 10/11 fichiers et 100 Mio/dépassement.
7. Activer seulement ensuite l'envoi Windows → iPhone et le réveil Pushcut.
8. Rejouer texte, PNG, JPEG, fichiers multiples, coupure et expiration dans le
   sens retour.

Pour chaque essai, consigner uniquement déclenchement, longueur ou taille,
SHA-256, résultat observé et `PASS`, `FAIL` ou `NOT VALIDATED`. Ne jamais
consigner contenu, Base64, nom de fichier, chemin local, URL authentifiée ou
secret.

## 6. État des validations hors appareil

- Protocole, limites, SHA-256, découpage et assemblage Node : à valider par la
  suite ciblée du dépôt.
- Ordre Firebase et reprises : validés uniquement avec runtime mémoire tant
  qu'aucun essai réel n'a été lancé.
- APIs Scriptable, Trousseau, iCloud, presse-papiers et Pushcut :
  `NOT VALIDATED` avant exécution sur l'iPhone.
- Trajet Firebase réel dans les deux sens : `NOT VALIDATED` avant la porte
  progressive ci-dessus.
