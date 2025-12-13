# Layout 3D via Embeddings (DeepWalk + Skip-gram)

Ce répertoire contient des scripts pour calculer des positions 3D pour les nœuds du graphe lexical, basés uniquement sur des embeddings (sans calcul Laplacien).

## 🎯 Principe

Le layout 3D est calculé en 3 étapes :

1. **Marches aléatoires (DeepWalk)** : génération de séquences de nœuds par navigation aléatoire dans le graphe
2. **Embeddings (Skip-gram)** : entraînement d'un modèle word2vec-like pour obtenir des vecteurs de dimension 32
3. **Réduction PCA** : projection des vecteurs 32D vers un espace 3D

Cette approche est **beaucoup plus légère** que les méthodes spectrales (Laplacian Eigenmaps) qui nécessitent une décomposition en valeurs propres d'une matrice NxN.

## 📦 Installation

```bash
cd scripts
npm install graphology ml-pca
```

## 🚀 Usage

### 1. Créer un sous-graphe de test

Pour tester rapidement sur un échantillon :

```bash
npx ts-node scripts/createSubgraph.ts \
  app/public/lemma-atlas.json \
  data/lemma-atlas-sample.json \
  1000
```

Cela extrait les 1000 nœuds les plus connectés du graphe complet.

### 2. Calculer le layout 3D

Sur le sous-graphe (rapide, ~30s) :

```bash
# Modifier computeMixedLayout.ts ligne 494 :
# const graph = await loadGraph('data/lemma-atlas-sample.json', {});

npx ts-node scripts/computeMixedLayout.ts
```

Sur le graphe complet (~49k nœuds, ~3-4 min) :

```bash
# Modifier computeMixedLayout.ts ligne 494 :
# const graph = await loadGraph('app/public/lemma-atlas.json', {});

npx ts-node scripts/computeMixedLayout.ts
```

### 3. Analyser les résultats

```bash
npx ts-node scripts/analyzeEmbeddings.ts
```

Affiche les voisins les plus proches pour quelques mots tests et des statistiques globales.

## 📊 Résultats

### Graphe complet (49 746 nœuds)

- **Temps de calcul** : ~3-4 minutes
- **Mémoire RAM** : ~160 MB
- **Fichier de sortie** : `data/precomputed-positions-embeddings.json` (5.3 MB)
- **Variance expliquée (PCA)** : 43.0%
  - PC1 : 32.4%
  - PC2 : 5.8%
  - PC3 : 4.8%

### Format de sortie

```json
{
  "faire": { "x": -93.6, "y": 43.9, "z": 32.9 },
  "voyager": { "x": -60.3, "y": 45.6, "z": 14.8 },
  "chat": { "x": -39.6, "y": 57.2, "z": -53.8 },
  ...
}
```

Positions normalisées dans `[-100, 100]` pour chaque dimension.

## ⚙️ Paramètres

Dans `computeMixedLayout.ts`, ligne 501-512 :

```typescript
// Marches aléatoires
walkLength: 20,  // Longueur de chaque marche
numWalks: 5      // Nombre de marches par nœud

// Embeddings
embeddingDim: 32,      // Dimension des vecteurs
windowSize: 5,         // Fenêtre de contexte
learningRate: 0.025,   // Taux d'apprentissage
epochs: 5              // Nombre d'époques
```

### Ajuster pour des graphes très volumineux

Si vous avez > 100k nœuds, vous pouvez :

- Réduire `numWalks` de 5 → 3
- Réduire `epochs` de 5 → 3
- Réduire `embeddingDim` de 32 → 16

Ou limiter le nombre de nœuds :

```typescript
const graph = await loadGraph('app/public/lemma-atlas.json', {
  maxNodes: 10000  // Limiter à 10k nœuds
});
```

## 🔍 Qualité des embeddings

Les mots sémantiquement proches sont positionnés près dans l'espace 3D :

- **"travail"** → marcher (2.84), operation (6.79), emploi (10.26)
- **"faire"** → changer (12.84), modifier (15.70), deplacer (15.84)
- **"voyager"** → toucher (3.52), comprendre (3.77), exprimer (3.55)

Les distances euclidiennes reflètent la similarité sémantique capturée par les marches aléatoires.

## 📝 Scripts disponibles

| Script | Description |
|--------|-------------|
| `createSubgraph.ts` | Extrait un sous-graphe de test |
| `computeMixedLayout.ts` | Calcule le layout 3D complet |
| `analyzeEmbeddings.ts` | Analyse la qualité des embeddings |

## 🛡️ Sécurité

**Différence avec l'ancienne version (Laplacien) :**

- ✅ **Pas de matrice NxN** → pas de risque d'explosion mémoire
- ✅ **Complexité O(N×D)** au lieu de O(N³)
- ✅ **Scalable** jusqu'à 100k+ nœuds
- ✅ **Temps de calcul linéaire** avec le nombre de nœuds

L'ancienne version avec Laplacian Eigenmaps plantait la machine dès 30k nœuds.

## 📚 Références

- **DeepWalk**: KDD 2014, Perozzi et al.
- **Node2Vec**: KDD 2016, Grover & Leskovec
- **Word2Vec (Skip-gram)**: NIPS 2013, Mikolov et al.
- **PCA**: Analyse en Composantes Principales classique

## 🎨 Intégration dans le front

Le fichier `data/precomputed-positions-embeddings.json` peut être chargé directement dans votre visualisation 3D (Three.js, ForceGraph3D, etc.) :

```typescript
const positions = await fetch('/data/precomputed-positions-embeddings.json').then(r => r.json());

// Utiliser les positions pour initialiser le graphe 3D
nodes.forEach(node => {
  const pos = positions[node.id];
  if (pos) {
    node.x = pos.x;
    node.y = pos.y;
    node.z = pos.z;
  }
});
```

Les positions sont déjà normalisées et prêtes à l'emploi !
