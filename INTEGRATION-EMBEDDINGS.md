# Intégration des Embeddings dans la Vue avec Expansion

## ✅ Ce qui a été fait

### 1. **Calcul des embeddings 3D** (DeepWalk + Skip-gram + PCA)

Script : `scripts/computeMixedLayout.ts`

- ❌ Suppression du calcul Laplacien (plantait sur gros graphes)
- ✅ Génération de 248k marches aléatoires
- ✅ Entraînement skip-gram (5 époques, 27M samples)
- ✅ Réduction PCA 3D (43% variance expliquée)
- ✅ Positions normalisées dans `[-100, 100]`

**Résultat** : `data/precomputed-positions-embeddings.json` (5.3 MB)

### 2. **Fusion avec l'atlas existant**

Script : `scripts/mergeEmbeddingsToAtlas.ts`

- ✅ Remplacement des positions x, y, z de tous les nœuds
- ✅ Conservation des métadonnées (synsets, senseCount, etc.)
- ✅ Fichier mis à jour : `app/public/lemma-atlas-complete.json` (51.4 MB)

### 3. **Configuration actuelle**

**Service de données** : `app/src/services/LemmaDataService.ts`
- Charge `/lemma-atlas-complete.json` au démarrage
- Utilise les positions x, y, z pour initialiser les nœuds

**Composant graphe** : `app/src/components/lemma/SimpleLemmaGraph.tsx`
- Échelle : `POSITION_SCALE = 5` (ligne 8)
- Positions initiales : `lemma.x * 5`, `lemma.y * 5`, `lemma.z * 5`
- Force-directed layout : activé (ajuste légèrement les positions)

## 🚀 Lancer l'application

```bash
cd app
npm run dev
```

L'app sera disponible sur `http://localhost:5173`

## 🎯 Tester la vue avec expansion

1. **Page principale** (`/`) : Atlas des lemmes avec expansion
   - Tapez un mot dans la barre de recherche
   - Cliquez sur un nœud pour le sélectionner
   - Appuyez sur **ESPACE** pour explorer les voisins

2. **Navigation 3D** :
   - 🖱️ Clic gauche + glisser : rotation
   - 🖱️ Molette : zoom
   - 🖱️ Clic droit + glisser : pan

3. **Expansion progressive** :
   - Chaque appui sur ESPACE ajoute les voisins du nœud sélectionné
   - Le graphe s'enrichit progressivement
   - Les positions sont basées sur les embeddings

## 📊 Comparaison avant/après

### Avant (positions aléatoires)
- Distribution chaotique
- Pas de structure sémantique
- Force-directed layout seul

### Après (embeddings)
- Mots sémantiquement proches positionnés près les uns des autres
- Structure globale cohérente (43% variance expliquée)
- Force-directed layout affine la position

## 🔧 Ajustements possibles

### Échelle de visualisation

Dans `app/src/components/lemma/SimpleLemmaGraph.tsx` ligne 8 :

```typescript
const POSITION_SCALE = 5;  // Ajuster pour plus/moins d'espace
```

- Plus petit (2-3) : graphe plus compact
- Plus grand (8-10) : graphe plus étalé

### Force du layout physique

Si vous voulez désactiver complètement le force-directed et utiliser uniquement les embeddings :

```typescript
// Dans ForceGraph3D props
d3AlphaDecay={1}      // Arrêter la simulation rapidement
d3VelocityDecay={1}   // Pas de mouvement
```

Ou pour un équilibre :

```typescript
d3AlphaDecay={0.01}    // Simulation lente
d3VelocityDecay={0.4}  // Léger ajustement
warmupTicks={50}       // Pré-calcul initial
cooldownTicks={50}     // Convergence rapide
```

### Profondeur d'expansion

Dans `SimpleLemmaGraph.tsx` :

```typescript
// Ligne 73 : expansion initiale
const expansion = lemmaDataService.expandLemma(centerLemma.lemma, 150, 2);
//                                                                    ↑ profondeur
//                                                                 ↑ max nœuds

// Ligne 187 : expansion au clic
const expansion = lemmaDataService.expandLemma(lemmaName, 50, 2);
```

## 📁 Scripts disponibles

| Script | Description |
|--------|-------------|
| `createSubgraph.ts` | Crée un sous-graphe de test |
| `computeMixedLayout.ts` | Calcule les embeddings 3D |
| `analyzeEmbeddings.ts` | Analyse la qualité des embeddings |
| `mergeEmbeddingsToAtlas.ts` | Fusionne les embeddings avec l'atlas |

## 🎨 Vue fractale (mise de côté)

La vue fractale multiscale (`/fractal`) utilise un système de niveaux de détail différent.
Elle n'est pas affectée par ces changements et continue d'utiliser `multiscale-graph.json`.

## 🐛 Debug

Si les positions semblent bizarres :

1. **Vérifier le fichier atlas** :
   ```bash
   head -50 app/public/lemma-atlas-complete.json
   ```
   Les positions x, y, z doivent être dans [-100, 100]

2. **Console du navigateur** :
   - F12 → Console
   - Vérifier les logs `[LOAD]`, `[ATLAS]`, `[EXPAND]`

3. **Statistiques du service** :
   ```typescript
   console.log(lemmaDataService);
   ```

## 📝 Prochaines étapes possibles

- [ ] Ajuster `POSITION_SCALE` pour une meilleure densité visuelle
- [ ] Tester avec différents mots de départ
- [ ] Désactiver/ajuster le force-directed layout
- [ ] Ajouter des couleurs basées sur les clusters sémantiques
- [ ] Améliorer la visualisation des relations (types de relations)

## 🎉 Résultat attendu

Vous devriez maintenant voir :
- Un graphe 3D avec une structure sémantique cohérente
- Les mots liés positionnés naturellement proches
- Une exploration fluide et progressive
- Des positions initiales intelligentes (pas aléatoires)

Bon test ! 🚀
