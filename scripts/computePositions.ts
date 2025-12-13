#!/usr/bin/env ts-node

/**
 * computePositions.ts
 *
 * Calcul des positions 3D des lemmes à partir d'un graphe.
 *
 * Méthodes supportées :
 *  - deepwalk  (DeepWalk + skip-gram + PCA 3D)
 *  - random    (positions aléatoires, pratique pour tester)
 *  - noise     (Perlin noise 3D avec champ de force)
 *
 * Usage :
 *   ts-node scripts/computePositions.ts \
 *     --graph=app/public/lemma-graph.json \
 *     --method=noise \
 *     --output=data/positions-noise.json
 */

import Graph from 'graphology';
import { PCA } from 'ml-pca';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createNoise3D } from 'simplex-noise';

// ============================================================================
// TYPES & CLI
// ============================================================================

interface NodePosition {
  x: number;
  y: number;
  z: number;
}

interface RandomWalkOptions {
  walkLength: number;
  numWalks: number;
}

interface EmbeddingOptions {
  embeddingDim: number;
  windowSize: number;
  learningRate: number;
  epochs: number;
}

interface LayoutScriptOptions {
  maxNodes?: number;
}

interface GraphJSON {
  nodes: Array<{ lemma?: string; id?: string;[key: string]: any }>;
  edges?: Array<{ source: string; target: string;[key: string]: any }>;
  links?: Array<{ source: string; target: string;[key: string]: any }>;
}

type PositionMethod = 'deepwalk' | 'random' | 'noise';

interface CLIArgs {
  graphPath: string;
  method: PositionMethod;
  outputPath: string;
  maxNodes?: number;
}

// ============================================================================
// CLI PARSING
// ============================================================================

const DEFAULT_GRAPH_PATH = 'app/public/lemma-graph.json';
const DEFAULT_METHOD: PositionMethod = 'deepwalk';

function parseArgs(): CLIArgs {
  let graphPath = DEFAULT_GRAPH_PATH;
  let method: PositionMethod = DEFAULT_METHOD;
  let outputPath: string | undefined;
  let maxNodes: number | undefined;

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--graph=')) {
      graphPath = arg.split('=')[1];
    } else if (arg.startsWith('--method=')) {
      method = arg.split('=')[1] as PositionMethod;
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    } else if (arg.startsWith('--maxNodes=')) {
      maxNodes = parseInt(arg.split('=')[1], 10);
    }
  });

  if (!outputPath) {
    const methodSuffix = method.toLowerCase();
    outputPath = `data/positions-${methodSuffix}.json`;
  }

  return {
    graphPath,
    method,
    outputPath,
    maxNodes
  };
}

// ============================================================================
// 1. CHARGEMENT DU GRAPHE
// ============================================================================

async function loadGraph(
  filePath: string,
  options: LayoutScriptOptions = {}
): Promise<Graph> {
  console.log(`📖 Chargement du graphe depuis ${filePath}...`);

  const data = await fs.readFile(filePath, 'utf-8');
  const json: GraphJSON = JSON.parse(data);

  const graph = new Graph({ type: 'undirected' });

  let nodesToAdd = json.nodes || [];
  if (options.maxNodes && nodesToAdd.length > options.maxNodes) {
    console.warn(
      `⚠️  Graphe limité à ${options.maxNodes} nœuds (total: ${nodesToAdd.length})`
    );
    nodesToAdd = nodesToAdd.slice(0, options.maxNodes);
  }

  for (const node of nodesToAdd) {
    const nodeId = node.lemma || node.id;
    if (!nodeId) {
      console.warn(`⚠️  Nœud sans id ni lemma, ignoré:`, node);
      continue;
    }
    if (!graph.hasNode(nodeId)) {
      graph.addNode(nodeId, { ...node });
    }
  }

  const edges = json.edges ?? json.links ?? [];
  let edgesAdded = 0;

  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);

    if (graph.hasNode(source) && graph.hasNode(target)) {
      if (!graph.hasEdge(source, target)) {
        graph.addEdge(source, target, { ...edge });
        edgesAdded++;
      }
    }
  }

  console.log(`✅ Graphe chargé: ${graph.order} nœuds, ${edgesAdded} arêtes`);

  if (graph.order > 50000) {
    console.warn(`⚠️  ATTENTION: graphe très volumineux (${graph.order} nœuds)`);
    console.warn(`   → Le calcul peut prendre beaucoup de temps et de RAM`);
  }

  return graph;
}

// ============================================================================
// 2. GÉNÉRATION DES MARCHES (DeepWalk)
// ============================================================================

function randomWalk(
  graph: Graph,
  startNode: string,
  walkLength: number
): string[] {
  const walk = [startNode];
  let current = startNode;

  for (let i = 1; i < walkLength; i++) {
    const neighbors = graph.neighbors(current);

    if (!neighbors || neighbors.length === 0) break;

    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    walk.push(next);
    current = next;
  }

  return walk;
}

function generateRandomWalks(
  graph: Graph,
  options: RandomWalkOptions
): string[][] {
  const { walkLength, numWalks } = options;

  console.log(`🚶 Génération des marches aléatoires...`);
  console.log(`   Params: ${numWalks} marches × ${walkLength} pas par nœud`);

  const walks: string[][] = [];
  const nodes = graph.nodes();

  let progressInterval = Math.max(1, Math.floor(nodes.length / 10));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (i % progressInterval === 0 && i > 0) {
      const pct = Math.round((i / nodes.length) * 100);
      console.log(`   Progress: ${pct}% (${walks.length} marches générées)`);
    }

    for (let j = 0; j < numWalks; j++) {
      const walk = randomWalk(graph, node, walkLength);
      walks.push(walk);
    }
  }

  console.log(`✅ ${walks.length} marches générées`);

  const avgWalkLength =
    walks.reduce((sum, w) => sum + w.length, 0) / Math.max(walks.length, 1);
  const memEstimateMB = (
    (walks.length * avgWalkLength * 50) /
    (1024 * 1024)
  ).toFixed(1);
  console.log(`   Longueur moyenne: ${avgWalkLength.toFixed(1)} nœuds`);
  console.log(`   Mémoire estimée: ~${memEstimateMB} MB`);

  return walks;
}

// ============================================================================
// 3. SKIP-GRAM EMBEDDINGS
// ============================================================================

async function trainNodeEmbeddings(
  walks: string[][],
  options: EmbeddingOptions
): Promise<Map<string, number[]>> {
  const { embeddingDim, windowSize, learningRate, epochs } = options;

  console.log(`🧠 Entraînement des embeddings...`);
  console.log(`   Dimension: ${embeddingDim}, Fenêtre: ${windowSize}`);
  console.log(`   Learning rate: ${learningRate}, Époques: ${epochs}`);

  const vocab = new Set<string>();
  for (const walk of walks) {
    for (const node of walk) {
      vocab.add(node);
    }
  }
  const nodeIds = Array.from(vocab);
  console.log(`   Vocabulaire: ${nodeIds.length} nœuds uniques`);

  const embeddings = new Map<string, number[]>();
  const contextEmbeddings = new Map<string, number[]>();

  for (const nodeId of nodeIds) {
    const scale = 1 / Math.sqrt(embeddingDim);
    embeddings.set(
      nodeId,
      Array.from({ length: embeddingDim }, () => (Math.random() * 2 - 1) * scale)
    );
    contextEmbeddings.set(
      nodeId,
      Array.from({ length: embeddingDim }, () => (Math.random() * 2 - 1) * scale)
    );
  }

  const dotProduct = (vec1: number[], vec2: number[]): number =>
    vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);

  const sigmoid = (x: number): number => {
    if (x < -20) return 0;
    if (x > 20) return 1;
    return 1 / (1 + Math.exp(-x));
  };

  console.log(`   Début de l'entraînement...`);

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    let samples = 0;

    for (const walk of walks) {
      for (let i = 0; i < walk.length; i++) {
        const centerNode = walk[i];
        const centerVec = embeddings.get(centerNode);
        if (!centerVec) continue;

        const contextStart = Math.max(0, i - windowSize);
        const contextEnd = Math.min(walk.length - 1, i + windowSize);

        for (let j = contextStart; j <= contextEnd; j++) {
          if (i === j) continue;

          const contextNode = walk[j];
          const contextVec = contextEmbeddings.get(contextNode);
          if (!contextVec) continue;

          const score = dotProduct(centerVec, contextVec);
          const prediction = sigmoid(score);

          const loss = -Math.log(prediction + 1e-10);
          totalLoss += loss;
          samples++;

          const gradient = prediction - 1;

          for (let k = 0; k < embeddingDim; k++) {
            const centerGrad = gradient * contextVec[k];
            const contextGrad = gradient * centerVec[k];

            centerVec[k] -= learningRate * centerGrad;
            contextVec[k] -= learningRate * contextGrad;
          }
        }
      }
    }

    const avgLoss = samples > 0 ? totalLoss / samples : 0;
    console.log(
      `   Époque ${epoch + 1}/${epochs}: loss = ${avgLoss.toFixed(
        4
      )}, samples = ${samples}`
    );
  }

  console.log(`✅ Entraînement terminé`);

  return embeddings;
}

// ============================================================================
// 4. PCA 3D + NORMALISATION
// ============================================================================

function computePCA3D(
  embeddings: Map<string, number[]>
): { nodeIds: string[]; coords: number[][] } {
  console.log(`📊 Réduction PCA vers 3D...`);

  const nodeIds: string[] = [];
  const matrix: number[][] = [];

  for (const [nodeId, embedding] of embeddings.entries()) {
    nodeIds.push(nodeId);
    matrix.push(embedding);
  }

  if (matrix.length === 0) {
    throw new Error('Aucun embedding disponible pour la PCA');
  }

  console.log(
    `   Matrice: ${matrix.length} × ${matrix[0]?.length ?? 0}`
  );

  const pca = new PCA(matrix, { scale: true });
  const reduced = pca.predict(matrix, { nComponents: 3 });
  const coords = reduced.to2DArray();

  const explainedVariance = pca.getExplainedVariance();
  const totalVariance = explainedVariance
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);
  console.log(`✅ PCA calculée`);
  console.log(
    `   Variance expliquée (3 composantes): ${(totalVariance * 100).toFixed(
      1
    )}%`
  );
  console.log(
    `   Détail: [${explainedVariance
      .slice(0, 3)
      .map(v => (v * 100).toFixed(1) + '%')
      .join(', ')}]`
  );

  return { nodeIds, coords };
}

function normalizePositions(
  nodeIds: string[],
  coords: number[][],
  range: [number, number] = [-100, 100]
): Record<string, NodePosition> {
  console.log(`🔢 Normalisation des positions...`);
  console.log(`   Plage cible: [${range[0]}, ${range[1]}]`);

  const positions: Record<string, NodePosition> = {};

  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];

  for (const coord of coords) {
    for (let dim = 0; dim < 3; dim++) {
      mins[dim] = Math.min(mins[dim], coord[dim]);
      maxs[dim] = Math.max(maxs[dim], coord[dim]);
    }
  }

  console.log(
    `   X: [${mins[0].toFixed(2)}, ${maxs[0].toFixed(2)}],` +
    ` Y: [${mins[1].toFixed(2)}, ${maxs[1].toFixed(2)}],` +
    ` Z: [${mins[2].toFixed(2)}, ${maxs[2].toFixed(2)}]`
  );

  const [targetMin, targetMax] = range;
  const targetRange = targetMax - targetMin;

  for (let i = 0; i < nodeIds.length; i++) {
    const coord = coords[i];
    const normalized: [number, number, number] = [0, 0, 0];

    for (let dim = 0; dim < 3; dim++) {
      const dimRange = maxs[dim] - mins[dim];

      if (dimRange === 0) {
        normalized[dim] = (targetMin + targetMax) / 2;
      } else {
        normalized[dim] =
          targetMin +
          ((coord[dim] - mins[dim]) / dimRange) * targetRange;
      }
    }

    positions[nodeIds[i]] = {
      x: normalized[0],
      y: normalized[1],
      z: normalized[2]
    };
  }

  console.log(`✅ ${nodeIds.length} positions normalisées`);

  return positions;
}

// ============================================================================
// 5. MÉTHODES DE POSITION
// ============================================================================

async function computeDeepWalkPositions(
  graph: Graph
): Promise<Record<string, NodePosition>> {
  console.log('🧭 Méthode: deepwalk');

  const walks = generateRandomWalks(graph, {
    walkLength: 20,
    numWalks: 5
  });

  const embeddings = await trainNodeEmbeddings(walks, {
    embeddingDim: 32,
    windowSize: 5,
    learningRate: 0.025,
    epochs: 5
  });

  const { nodeIds, coords } = computePCA3D(embeddings);
  const positions = normalizePositions(nodeIds, coords, [-100, 100]);

  return positions;
}

function computeRandomPositions(
  graph: Graph
): Record<string, NodePosition> {
  console.log('🎲 Méthode: random');

  const positions: Record<string, NodePosition> = {};
  graph.forEachNode(id => {
    positions[id] = {
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200
    };
  });

  console.log(`✅ ${graph.order} positions aléatoires générées`);
  return positions;
}

function computeNoisePositions(
  graph: Graph
): Record<string, NodePosition> {
  console.log('🌊 Méthode: noise (Perlin 3D avec champ de force)');

  const noise3D = createNoise3D();
  const positions: Record<string, NodePosition> = {};

  // Paramètres du champ de force
  const noiseScale = 0.05; // Fréquence du bruit (plus petit = plus lisse)
  const forceStrength = 80; // Force du déplacement
  const baseRadius = 100; // Rayon de la sphère de départ

  console.log(`   noiseScale: ${noiseScale}, forceStrength: ${forceStrength}`);

  let nodeIndex = 0;
  const totalNodes = graph.order;
  const progressInterval = Math.max(1, Math.floor(totalNodes / 10));

  graph.forEachNode(id => {
    // Position initiale aléatoire sur/dans une sphère
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = baseRadius * Math.cbrt(Math.random()); // Distribution uniforme dans la sphère

    let x = r * Math.sin(phi) * Math.cos(theta);
    let y = r * Math.sin(phi) * Math.sin(theta);
    let z = r * Math.cos(phi);

    // Échantillonner le champ de force via Perlin noise
    const noiseX = noise3D(x * noiseScale, y * noiseScale, z * noiseScale);
    const noiseY = noise3D((x + 100) * noiseScale, (y + 100) * noiseScale, (z + 100) * noiseScale);
    const noiseZ = noise3D((x + 200) * noiseScale, (y + 200) * noiseScale, (z + 200) * noiseScale);

    // Appliquer le champ de force
    x += noiseX * forceStrength;
    y += noiseY * forceStrength;
    z += noiseZ * forceStrength;

    positions[id] = { x, y, z };

    nodeIndex++;
    if (nodeIndex % progressInterval === 0 && nodeIndex > 0) {
      const pct = Math.round((nodeIndex / totalNodes) * 100);
      console.log(`   Progress: ${pct}%`);
    }
  });

  console.log(`✅ ${graph.order} positions générées avec Perlin noise`);
  return positions;
}

// ============================================================================
// 6. SAUVEGARDE
// ============================================================================

async function savePositions(
  filePath: string,
  positions: Record<string, NodePosition>
): Promise<void> {
  console.log(`💾 Sauvegarde des positions dans ${filePath}...`);

  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(filePath, JSON.stringify(positions, null, 2), 'utf-8');

  const stats = await fs.stat(filePath);
  console.log(`✅ Positions sauvegardées (${(stats.size / 1024).toFixed(1)} KB)`);
}

// ============================================================================
// 7. MAIN
// ============================================================================

async function main() {
  console.log('🌍 === computePositions (multi-méthodes) ===\n');
  const args = parseArgs();

  console.log(`📦 Graphe:  ${args.graphPath}`);
  console.log(`🧪 Méthode: ${args.method}`);
  console.log(`📁 Output:  ${args.outputPath}`);
  if (args.maxNodes) {
    console.log(`🔒 maxNodes: ${args.maxNodes}`);
  }
  console.log('');

  try {
    const graph = await loadGraph(args.graphPath, {
      maxNodes: args.maxNodes
    });

    let positions: Record<string, NodePosition>;

    switch (args.method) {
      case 'deepwalk':
        positions = await computeDeepWalkPositions(graph);
        break;
      case 'random':
        positions = computeRandomPositions(graph);
        break;
      case 'noise':
        positions = computeNoisePositions(graph);
        break;
      default:
        throw new Error(`Méthode inconnue: ${args.method}`);
    }

    await savePositions(args.outputPath, positions);

    console.log('\n🎉 Terminé avec succès!');
    console.log(`   ${Object.keys(positions).length} nœuds positionnés`);
  } catch (err: any) {
    console.error('❌ Erreur:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
