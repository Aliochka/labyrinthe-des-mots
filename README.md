# labyrinthe-des-mots
Voyager à travers les mots

Réaliser avec l'aide de l'ia (chatgpt)

Planification du projet – Résumé complet
🎯 Objectif général

Créer une application front-only qui permet :

Exploration d’un mot : saisir un mot → afficher un sous-graphe sémantique autour de lui.

Chemin entre deux mots : saisir un deuxième mot → calculer et afficher le chemin sémantique depuis le premier.

Le tout basé sur OMW-FR, avec NOM + VERBE + ADJECTIF en V1, et un rendu 3D futur (Three.js).

🗂️ 1. Données & Prétraitement (offline)
Source principale

OMW-FR (Open Multilingual WordNet – français).

Cibles du prétraitement

Produire 3 tables compactes :

1. synsets

id (numérique compact)

pos (N | V | ADJ)

lemmas (mots français)

gloss (définition courte – optionnel)

2. relations

Pour chaque synsetId, liste de relations :
[relationType, targetSynsetId]

Relations gardées en V1 :

HYPERNYM

HYPONYM

ANTONYM

3. lexicalIndex

Map normalisée { mot → [synsetIds] } :

minuscule,

sans accents,

nettoyage apostrophes.

🧠 2. Moteur sémantique (core logic)
Types internes
ConceptNode { id, pos, lemmas, gloss? }
RelationEdge { from, to, type }
GraphSlice { nodes, edges, centerId?, depthExplored? }
Path { nodes[], edges[] }
PathResult { status, paths?, meta? }

2.1. Expansion d’un synset
expandFromSynset(centerId, options)

Options par défaut :

depth = 2

allowedRelationTypes = [HYPERNYM, HYPONYM, ANTONYM]

maxNodes = 300

posFilter = ["N","V","ADJ"]

Retour :

GraphSlice

ou erreurs (CENTER_NOT_FOUND, MAX_NODES_REACHED, etc.)

2.2. Expansion depuis un mot
expandFromWord(word, options)

Étapes :

Normalisation du mot.

Lookup dans lexicalIndex.

Gestion de la polysémie via AUTO :

si 1 synset → on prend,

si plusieurs :

priorité : NOM > ADJ > VERBE,

sinon AMBIGUOUS.

Retour :

graph: GraphSlice | null

senses: ConceptNode[]

usedSynsetId?

status = OK | WORD_NOT_FOUND | AMBIGUOUS | ERROR

2.3. Chemin entre deux synsets
findPathBetweenSynsets(startId, endId, options)

Options par défaut :

allowedRelationTypes = [...]

maxDepth = 6

maxPaths = 1 (plus court)

strategy = "SHORTEST" (BFS)

Retour : PathResult.

2.4. Chemin entre deux mots
findPathBetweenWords(wordA, wordB, options)

Résout les sens de A & B, applique AUTO ou demande choix (V2), puis appelle la fonction interne.

Retour :

status = OK | WORD_NOT_FOUND | AMBIGUOUS | NO_PATH | ERROR

pathResult?

sensesA?, sensesB?

usedSynsetA?, usedSynsetB?

🧩 3. Architecture des modules (côté code)
1. data-preprocess (script offline)

charge OMW-FR brut,

filtre FR + N/V/ADJ,

génère les 3 tables compactes,

écrit un JSON ou binaire optimisé.

2. core-graph (moteur pur)

manipule les synsets / relations en mémoire,

contient :

expandFromSynset,

findPathBetweenSynsets,

normalizeWord, etc.

Peut être en Rust/WASM.

3. semantic-api (couche UX)

logique mots → synsets,

heuristique AUTO,

expose :

expandFromWord,

findPathBetweenWords.

4. visualization (front / 3D)

ne connaît que des GraphSlice, Path,

future implémentation Three.js,

gère :

positions,

couleurs,

animation du chemin.

🖥️ 4. UX / Flow utilisateur (1 seule vue)
État 1 — Premier mot

Saisie du mot 1 → expandFromWord.

Affiche exploration autour du mot 1.

UI : “Ajoute un deuxième mot pour tracer un chemin.”

État 2 — Deuxième mot

Saisie du mot 2 → expandFromWord(mot2) + findPathBetweenWords.

Fusionne :

halo du mot1,

halo du mot2,

nœuds/liens du chemin.

Affiche séquence animée du chemin :

éclaire mot1,

dessine le chemin nœud par nœud,

termine sur mot2.

Interactions possibles :

clic sur un nœud du chemin → relance expandFromWord et recentre l’exploration.

🔧 5. Defaults importants
Exploration

depth = 2

maxNodes = 300

relations = hyper/hypo/antonyme

POS = N + ADJ + V

Chemin

maxDepth = 6

strategy = SHORTEST

maxPaths = 1

🎨 6. Rendu (à définir après MVP)

Three.js pour le paysage 3D,

halos et couleurs selon relations,

animation du chemin,

transitions camera,

style artistique configurable plus tard.