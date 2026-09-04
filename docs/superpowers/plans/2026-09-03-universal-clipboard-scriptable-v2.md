# Universal Clipboard Scriptable V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le client Scriptable iPhone du protocole Universal Clipboard v2, avec découpage Firebase par blocs, envoi et réception de texte et fichiers, exposition locale sûre, tests Node et tests Scriptable sans effet externe.

**Architecture:** `scriptable/UniversalClipboard.js` reste l’unique point d’entrée et exporte ses fonctions pures. Les dépendances Scriptable et Firebase passent par un runtime injecté ; les tests Node utilisent un runtime mémoire. Les objets Firebase sont plats et séparés entre `index`, `queues` et `payloads`, avec publication de la file en dernier et suppression de la file en premier.

**Tech Stack:** JavaScript compatible JavaScriptCore/Scriptable, Node.js `node:test`, Firebase Realtime Database REST, `Data`, `FileManager`, `Keychain`, `Pasteboard`, `Image`, `Request`.

**Spec:** `https://github.com/GLAD1981/autohotkey-scripts/blob/3d60a5685d17d2dc885cdbe5da956f29ee84bcad/docs/superpowers/specs/2026-09-01-universal-clipboard-bidirectional-chunked-design.md`

## Global Constraints

- Firebase Realtime Database uniquement sous le forfait Spark ; aucun Cloud Storage et aucun service payant.
- Racine Firebase : `/apps/universalClipboard/v2`.
- Bloc brut maximal : `3 145 728` octets, soit `4 194 304` caractères Base64 pour tout bloc complet.
- Texte UTF-8 maximal : `6 291 456` octets.
- Fichier maximal : `26 214 400` octets ; dix fichiers et `104 857 600` octets par transfert.
- Identifiant de transfert : 32 caractères hexadécimaux minuscules ; fichiers `f0001...f0010`, blocs `c0001...c9999`.
- Les objets index, file, manifeste, métadonnées et blocs restent plats ; les données Base64 ne figurent jamais dans `index` ou `queues`.
- Les images sont acceptées uniquement comme fichiers originaux ; un objet `Image` sans chemin est refusé.
- Aucun secret, contenu, Base64, nom de fichier ou chemin local n’est journalisé.
- Les fichiers reçus sont conservés sous `iCloud Drive/Scriptable/Universal Clipboard/Received`.
- Le secret Firebase est lu dans le Trousseau Scriptable et n’est jamais fourni par un paramètre de raccourci.
- Les tests Node n’effectuent aucun appel réseau ni accès réel au Trousseau, au presse-papiers ou à iCloud.
- `UpdateLibrary` distribue automatiquement tout `.js` placé sous `scriptable/`; il ne doit pas être modifié pour cette fonctionnalité.
- Les trois lignes de vecteurs communs sont `empty`, `hello` et `binary-edge`, avec les colonnes `name`, `hex`, `bytes`, `base64`, `sha256`.

---

### Task 1: Créer le contrat pur, SHA-256 et vecteurs communs

**Files:**
- Create: `scriptable/UniversalClipboard.js`
- Create: `scriptable/test/universal-clipboard.test.js`
- Create: `scriptable/test/fixtures/universal-clipboard-v2-vectors.tsv`

**Interfaces:**
- Produces: `limits() -> Object`.
- Produces: `isTransferId(value) -> boolean`.
- Produces: `fileId(index) -> string|null` et `chunkId(index) -> string|null`.
- Produces: `expectedChunkCount(bytes) -> number|null`.
- Produces: `Sha256`, avec `update(bytes)` et `digestHex()`.
- Produces: `sha256Hex(bytes) -> string`.
- Produces: `validateIndex(index)`, `validateFileMeta(meta)` et `validateChunk(chunk, adapter)`.

- [x] **Step 1: Écrire les tests RED du contrat**

Créer un test Node qui exige les limites exactes, refuse les identifiants majuscules ou mal dimensionnés, vérifie `f0001/f0010`, `c0001/c9999` et les frontières zéro, 3 Mio, 25 Mio, dix fichiers et 100 Mio. Les attentes sont des littéraux indépendants du code de production.

Le test doit charger le TSV et vérifier exactement :

```text
name\thex\tbytes\tbase64\tsha256
empty\t\t0\t\te3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
hello\t68656c6c6f\t5\taGVsbG8=\t2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
binary-edge\t00017f80ff\t5\tAAF/gP8=\t0150a92bb1212cd00516b65fde0704614760000963874fcbb11eaa734ee87809
```

- [x] **Step 2: Vérifier RED**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `FAIL` parce que `../UniversalClipboard` n’existe pas.

- [x] **Step 3: Implémenter le contrat minimal**

Créer le fichier avec les trois lignes d’en-tête Scriptable intactes, puis implémenter les constantes, identifiants et validateurs. `validateIndex` exige les propriétés v2, les extrémités distinctes `pc/iphone`, les dates UTC sur quatorze chiffres, l’état `uploading|ready`, le type `text|files`, les limites agrégées et exactement sept jours entre `created` et `expires`. `validateFileMeta` refuse tout séparateur de chemin et exige taille, SHA-256 et nombre de blocs cohérents.

- [x] **Step 4: Implémenter SHA-256 incrémental**

Implémenter SHA-256 en JavaScript pur avec un état de huit mots de 32 bits, un tampon de 64 octets et une longueur totale. `update` accepte un tableau ou `Uint8Array`; `digestHex` ajoute le padding et retourne 64 hexadécimaux minuscules. Aucun module Node ne doit être importé dans le fichier de production.

- [x] **Step 5: Vérifier GREEN**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `PASS` pour les trois vecteurs, les validateurs et les limites.

---

### Task 2: Découper et reconstruire les données Base64

**Files:**
- Modify: `scriptable/UniversalClipboard.js`
- Modify: `scriptable/test/universal-clipboard.test.js`

**Interfaces:**
- Consumes: adaptateur `{toBase64(data), fromBase64(value), getBytes(data), fromBytes(bytes), utf8Data(text), rawString(data)}`.
- Produces: `splitData(data, adapter) -> {bytes, sha256, chunks}`.
- Produces: `assembleChunks(chunks, expectedBytes, expectedSha256, adapter) -> data`.

- [x] **Step 1: Écrire les tests RED de découpage**

Utiliser un adaptateur Node basé sur `Buffer`. Exiger qu’un buffer de `3 145 729` octets produise deux objets plats : `c0001` de `3 145 728` octets et `c0002` d’un octet. Vérifier les SHA littéraux calculés séparément avec `node:crypto`, puis refuser identifiant, ordre, taille, Base64, hash de bloc ou hash final altéré.

- [x] **Step 2: Vérifier RED**

Run: `node --test --test-name-pattern="découpe|reconstruit|altéré" scriptable/test/universal-clipboard.test.js`

Expected: `FAIL` parce que `splitData` et `assembleChunks` sont absents.

- [x] **Step 3: Implémenter le découpage aligné**

Encoder la donnée complète une seule fois. Découper la chaîne tous les `4 194 304` caractères ; cette frontière correspond à 3 Mio et ne coupe jamais un quartet Base64. Décoder seulement le bloc courant pour calculer taille et SHA, puis produire `{id, bytes, sha256, data}` sans conserver de tableau brut global.

- [x] **Step 4: Implémenter l’assemblage vérifié**

Valider l’ordre et chaque bloc en décodant un bloc à la fois et en alimentant le SHA incrémental. Concaténer les chaînes Base64 seulement après validation ; les blocs complets n’ont pas de padding. Décoder la chaîne finale par l’adaptateur, vérifier taille et SHA global, puis retourner la donnée native.

- [x] **Step 5: Vérifier GREEN**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `PASS`, y compris la frontière 3 Mio et toutes les mutations.

---

### Task 3: Ajouter le client Firebase REST et l’ordre atomique

**Files:**
- Modify: `scriptable/UniversalClipboard.js`
- Modify: `scriptable/test/universal-clipboard.test.js`

**Interfaces:**
- Produces: `firebasePath(...segments) -> string`.
- Produces: `createFirebaseClient(runtime) -> {get, put, patch, delete}`.
- Produces: `publishPreparedTransfer(prepared, runtime) -> transferId`.
- Produces: `deleteReceivedTransfer(transferId, destination, runtime)`.

- [x] **Step 1: Écrire le test RED de publication**

Injecter un runtime capturant les requêtes. Pour un texte `hello`, exiger cet ordre observable :

```text
PUT   index/{id}                         state=uploading
PUT   payloads/{id}/manifest
PUT   payloads/{id}/text/meta
PUT   payloads/{id}/text/chunks/c0001
PATCH index/{id}                         state=ready
PUT   queues/toPc/{id}
```

Chaque corps doit être plat. La file contient uniquement `version`, `created` et `kind`; ni Base64 ni secret. Simuler une erreur avant la file et vérifier qu’aucune requête `queues` n’est envoyée.

- [x] **Step 2: Écrire le test RED de suppression**

Exiger `DELETE queues/{destination}/{id}`, puis `DELETE payloads/{id}`, puis `DELETE index/{id}`. Une erreur de suppression ne doit jamais produire un deuxième effet local dans le test d’idempotence de Task 5.

- [x] **Step 3: Vérifier RED**

Run: `node --test --test-name-pattern="Firebase|atomique|suppression" scriptable/test/universal-clipboard.test.js`

Expected: `FAIL` sur les interfaces absentes.

- [x] **Step 4: Implémenter le transport injecté**

Construire chaque URL depuis la base publique et ajouter `auth` uniquement dans le runtime réel. Utiliser `Request.method`, `Request.headers = {"Content-Type":"application/json"}`, `Request.body = JSON.stringify(body)` et `loadString()`. Exiger un statut 2xx et parser `null` ou JSON sans journaliser l’URL complète.

- [x] **Step 5: Implémenter la publication et la suppression**

Écrire métadonnées et blocs séparément, relire `index`, `manifest` et les métadonnées critiques, passer l’index à `ready`, puis publier la file. La suppression reçue suit strictement file, payload, index.

- [x] **Step 6: Vérifier GREEN**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `PASS` pour l’ordre normal, l’échec intermédiaire et la suppression.

---

### Task 4: Implémenter l’envoi Scriptable

**Files:**
- Modify: `scriptable/UniversalClipboard.js`
- Modify: `scriptable/test/universal-clipboard.test.js`

**Interfaces:**
- Produces: `prepareTextTransfer(text, destination, runtime)`.
- Produces: `prepareFileTransfer(paths, destination, runtime)`.
- Produces: `send(input, runtime) -> {ok, transferId, kind}`.

- [x] **Step 1: Écrire les tests RED des entrées**

Vérifier texte UTF-8, fichier vide, fichier de 25 Mio, dix fichiers et mélange de types. Refuser texte au-dessus de 6 Mio, fichier au-dessus de 25 Mio, onze fichiers, total supérieur à 100 Mio, dossier, chemin absent et objet Image sans chemin. Les erreurs retournent seulement un code et une limite, jamais nom ou chemin.

- [x] **Step 2: Vérifier RED**

Run: `node --test --test-name-pattern="envoi|refuse" scriptable/test/universal-clipboard.test.js`

Expected: `FAIL` sur `send` et les préparateurs absents.

- [x] **Step 3: Implémenter la préparation**

Pour le texte, utiliser `Data.fromString` via l’adaptateur. Pour les fichiers, appeler `downloadFileFromiCloud`, vérifier `fileSize`, lire avec `FileManager.read`, déterminer un MIME conservateur par extension et produire `f0001...` avec métadonnées et blocs. Traiter les fichiers séquentiellement pour borner la mémoire.

- [x] **Step 4: Implémenter le point d’entrée d’envoi**

Priorité : `args.fileURLs`, puis `args.plainTexts`, puis `args.shortcutParameter`. Un paramètre dictionnaire utilise `{action:"send", text}` ou `{action:"send", files}`. `args.images` sans fichier déclenche `image-original-required`. Lire le secret depuis la clé `UniversalClipboard.Firebase.PersonalTools.RealtimeDatabase` du Trousseau.

- [x] **Step 5: Vérifier GREEN**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `PASS` pour toutes les limites et aucune fuite de contenu dans les messages capturés.

---

### Task 5: Implémenter la réception, l’idempotence et l’exposition locale

**Files:**
- Modify: `scriptable/UniversalClipboard.js`
- Modify: `scriptable/test/universal-clipboard.test.js`

**Interfaces:**
- Produces: `receive(transferId, runtime) -> {ok, kind, fileCount, degraded}`.
- Produces: `safeFilename(name, exists) -> string`.
- Produces: état local `UniversalClipboardApplied.json` conservé sept jours.

- [x] **Step 1: Écrire les tests RED de réception texte**

Simuler file, index, manifeste, méta et bloc. Exiger que le texte soit vérifié avant `copyString`, que l’identifiant soit enregistré avant la suppression distante et que le deuxième passage n’effectue pas une deuxième copie.

- [x] **Step 2: Écrire les tests RED de réception fichiers**

Exiger un fichier temporaire, l’écriture sous `Universal Clipboard/Received`, puis le déplacement vers le nom final. Tester caractères interdits, `..`, noms Windows réservés et collision. Pour une image décodable, exiger `copyImage` après conservation du fichier ; si `copyImage` échoue, retourner `degraded: true` sans annuler la réception.

- [x] **Step 3: Vérifier RED**

Run: `node --test --test-name-pattern="réception|idempotence|nom sûr|image" scriptable/test/universal-clipboard.test.js`

Expected: `FAIL` sur les interfaces absentes.

- [x] **Step 4: Implémenter la réception**

Lire exclusivement `queues/toIphone/{id}`, puis `index`. Refuser tout index non `ready`. Télécharger et vérifier les blocs dans l’ordre, assembler, écrire dans un chemin temporaire, puis déplacer vers le nom final après validation. Le dossier final utilise `FileManager.iCloud().documentsDirectory()/Universal Clipboard/Received`.

- [x] **Step 5: Implémenter l’idempotence et la suppression**

Stocker uniquement identifiant et date dans `FileManager.local().libraryDirectory()/UniversalClipboardApplied.json`. Purger les entrées de plus de sept jours. Après effet local réussi, enregistrer l’identifiant puis supprimer file, payload et index. Si la suppression échoue, le prochain passage ne répète pas l’effet local.

- [x] **Step 6: Vérifier GREEN**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Expected: `PASS` pour texte, fichiers, image dégradée, collisions et idempotence.

---

### Task 6: Intégrer ScriptableTests, documenter et fermer le lot local

**Files:**
- Modify: `scriptable/ScriptableTests.js`
- Modify: `scriptable/README.md`
- Create: `docs/UniversalClipboardV2Deployment.md`
- Modify: `docs/superpowers/plans/2026-09-03-universal-clipboard-scriptable-v2.md`
- Modify after validation: `D:\Google Drive\My Drive\Code\Universal clipboard\HANDOVER.md`

**Interfaces:**
- Consumes: exports purs de `UniversalClipboard.js`.
- Produces: tests embarqués sans réseau et runbook de déploiement iPhone/Firebase.

- [x] **Step 1: Ajouter les tests Scriptable sans effet externe**

Importer `UniversalClipboard`, charger les trois vecteurs en littéraux dans `ScriptableTests.js`, vérifier Base64/SHA avec `Data`, identifiants, limites et un cycle publication/réception entièrement injecté. Aucun appel Firebase, Trousseau, presse-papiers ou iCloud réel.

- [x] **Step 2: Documenter le raccourci et le déploiement**

Le runbook doit décrire : installation par `UpdateLibrary`, clé du Trousseau, configuration de la feuille de partage pour Texte et Fichiers, dictionnaires `{action:"send"...}` et `{action:"receive", transferId}`, Pushcut limité au seul identifiant, exécution manuelle de `ScriptableTests`, activation iPhone→PC avant PC→iPhone et scénarios réels de la spécification.

- [x] **Step 3: Lancer les validations ciblées**

Run: `node --test scriptable/test/universal-clipboard.test.js`

Run: `node --check scriptable/UniversalClipboard.js`

Expected: codes `0`, aucune sortie d’erreur.

- [x] **Step 4: Lancer la porte de régression disponible**

Run: `node --test scriptable/test/update-library.test.js scriptable/test/publish-library.test.js`

Expected: tests de distribution `PASS`. Les échecs baseline liés aux modules absents restent consignés séparément et ne doivent pas être attribués à Universal Clipboard.

- [x] **Step 5: Vérifier le livrable**

Exécuter `git diff --check`, `git status --short` et `git diff --name-only`. Rechercher dans les fichiers touchés les motifs `auth=`, longues chaînes Base64 hors fixture, URL Pushcut, contenu de presse-papiers et chemins utilisateur. Conclure `PASS`, `FAIL` ou `NOT VALIDATED` pour protocole, découpage, Firebase simulé, envoi local, réception locale, distribution, iPhone réel et Firebase réel.

- [x] **Step 6: Mettre à jour le handover**

Reporter branche, fichiers, commandes, résultats, blocages et prochaine séquence dans le handover Google Drive. Ne copier le code de production dans Google Drive qu’après validation locale et autorisation explicite de déploiement.
