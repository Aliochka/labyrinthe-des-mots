#!/usr/bin/env ts-node

/**
 * Atlas Sémantique WordNet FR - Générateur de Layout Global (ForceAtlas2)
 *
 * Version clean sans node2vec / ml-pca (npm ne fournit pas ces libs pour Node2Vec).
 *
 * Usage:
 *   ts-node build-atlas.ts --iterations=1200 --input=./data/omw-fr/
 *   ts-node build-atlas.ts --help
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { UndirectedGraph } from 'graphology';
import { connectedComponents } from 'graphology-components';
import forceAtlas2 from 'graphology-layout-forceatlas2';

// ===== TYPES =====

interface SynsetNode {
  id: string;
  pos: string;
  gloss_en?: string;
  gloss_fr?: string;
  lemmas?: string[]; // Lemmas français
}

interface RelationEdge {
  source: string;
  target: string;
  relation_type?: string;
}

interface Node3D extends SynsetNode {
  x: number;
  y: number;
  z: number;
}

interface AtlasOutput {
  nodes: Node3D[];
  edges: RelationEdge[];
}

interface CLIArgs {
  iterations: number;
  input: string;
  output: string;
  help: boolean;
}

// ===== CONFIGURATION =====

const DEFAULT_ITERATIONS = 200;
const DEFAULT_INPUT_DIR = './data/omw-fr/';
const DEFAULT_OUTPUT_FILE = './global-positions.json';
const MAX_NODES = 999999; // Pas de limite pour la prod

const FORCEATLAS2_SETTINGS = {
  barnesHutOptimize: true,
  barnesHutTheta: 1.0,     // Moins précis = plus rapide
  scalingRatio: 20,        // Plus agressif
  gravity: 0.1,            // Convergence plus rapide
  strongGravityMode: true, // Force plus forte vers centre
  slowDown: 2,             // Amortissement plus fort
};

// ===== CLI PARSING =====

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    iterations: DEFAULT_ITERATIONS,
    input: DEFAULT_INPUT_DIR,
    output: DEFAULT_OUTPUT_FILE,
    help: false
  };

  process.argv.slice(2).forEach(arg => {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--iterations=')) {
      args.iterations = parseInt(arg.split('=')[1]) || DEFAULT_ITERATIONS;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    }
  });

  return args;
}

function showHelp() {
  console.log(`
📚 Atlas Sémantique WordNet FR - Générateur de Layout Global (ForceAtlas2)

Usage:
  ts-node build-atlas.ts [options]

Options:
  --iterations=N     Nombre d'itérations ForceAtlas2 (défaut: ${DEFAULT_ITERATIONS})
  --input=PATH       Répertoire des fichiers OMW (défaut: ${DEFAULT_INPUT_DIR})
  --output=PATH      Fichier de sortie JSON (défaut: ${DEFAULT_OUTPUT_FILE})
  --help, -h         Afficher cette aide

Fichiers attendus dans le répertoire d'entrée:
  - synsets.tab      Synsets avec définitions
  - relations.tab    Relations entre synsets
  - senses.tab       Lemmas (on filtre sur fra)

Exemple:
  ts-node build-atlas.ts --iterations=1500 --input=../raw/omw-fr-1.4/
`);
}

// ===== UTILITAIRES =====

function validateInputFiles(inputDir: string): void {
  const synsetsPath = path.join(inputDir, 'synsets.tab');
  const relationsPath = path.join(inputDir, 'relations.tab');

  if (!fs.existsSync(synsetsPath)) {
    throw new Error(`❌ Fichier synsets.tab introuvable: ${synsetsPath}`);
  }

  if (!fs.existsSync(relationsPath)) {
    throw new Error(`❌ Fichier relations.tab introuvable: ${relationsPath}`);
  }

  console.log(`✅ Fichiers d'entrée validés dans: ${inputDir}`);
}

async function readFileLineByLine(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim() && !line.startsWith('#')) { // Ignorer commentaires et lignes vides
      lines.push(line.trim());
    }
  }

  return lines;
}

function addJitterZ(baseZ: number = 0, range: number = 10): number {
  return baseZ + (Math.random() - 0.5) * range;
}

// ===== CHARGEMENT DES DONNÉES =====

async function loadLemmas(inputDir: string): Promise<Map<string, string[]>> {
  console.log('📚 Chargement des lemmas français...');
  const sensesPath = path.join(inputDir, 'senses.tab');
  const lines = await readFileLineByLine(sensesPath);

  const lemmasBySynset = new Map<string, string[]>();
  let processed = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // Ignorer header

    const parts = line.split('\t');
    if (parts.length < 4) continue;

    const [synsetId, lemma, lang] = parts;

    // Garder seulement les lemmas français
    if (lang !== 'fra') continue;

    if (!lemmasBySynset.has(synsetId)) {
      lemmasBySynset.set(synsetId, []);
    }

    const currentLemmas = lemmasBySynset.get(synsetId)!;
    if (!currentLemmas.includes(lemma)) {
      currentLemmas.push(lemma);
    }

    processed++;
  }

  console.log(`✅ ${processed} lemmas français chargés pour ${lemmasBySynset.size} synsets`);
  return lemmasBySynset;
}

async function loadSynsets(inputDir: string): Promise<Map<string, SynsetNode>> {
  console.log('📖 Chargement des synsets...');
  const synsetsPath = path.join(inputDir, 'synsets.tab');
  const lines = await readFileLineByLine(synsetsPath);

  const synsets = new Map<string, SynsetNode>();
  let skipped = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // Ignorer header si présent

    const parts = line.split('\t');
    if (parts.length < 2) {
      skipped++;
      continue;
    }

    const [synsetId, pos, glossEn, glossFr] = parts;

    if (!synsetId || !pos) {
      skipped++;
      continue;
    }

    synsets.set(synsetId, {
      id: synsetId,
      pos: pos,
      gloss_en: glossEn || '',
      gloss_fr: glossFr || glossEn || '' // Fallback sur gloss_en si pas de FR
    });

    if (synsets.size >= MAX_NODES) {
      console.log(`⚠️ Limitation à ${MAX_NODES} synsets`);
      break;
    }
  }

  console.log(`✅ ${synsets.size} synsets chargés (${skipped} lignes ignorées)`);
  return synsets;
}

async function loadRelations(inputDir: string): Promise<RelationEdge[]> {
  console.log('🔗 Chargement des relations...');
  const relationsPath = path.join(inputDir, 'relations.tab');
  const lines = await readFileLineByLine(relationsPath);

  const relations: RelationEdge[] = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    if (index === 0) return; // Ignorer header si présent

    const parts = line.split('\t');
    if (parts.length < 3) {
      skipped++;
      return;
    }

    const [source, relationType, target] = parts;

    if (!source || !target) {
      skipped++;
      return;
    }

    relations.push({
      source: source,
      target: target,
      relation_type: relationType
    });
  });

  console.log(`✅ ${relations.length} relations chargées (${skipped} lignes ignorées)`);
  return relations;
}

// ===== CONSTRUCTION DU GRAPHE =====

function buildGraph(synsets: Map<string, SynsetNode>, relations: RelationEdge[]): UndirectedGraph {
  console.log('🏗️  Construction du graphe...');
  const graph = new UndirectedGraph();

  // Ajouter tous les nœuds
  let addedNodes = 0;
  synsets.forEach((synset) => {
    graph.addNode(synset.id, {
      pos: synset.pos,
      gloss_en: synset.gloss_en,
      gloss_fr: synset.gloss_fr,
      lemmas: synset.lemmas || [] // Inclure les lemmas
    });
    addedNodes++;
  });

  // Ajouter toutes les arêtes
  let addedEdges = 0;
  let skippedEdges = 0;

  relations.forEach((relation) => {
    if (graph.hasNode(relation.source) && graph.hasNode(relation.target)) {
      if (relation.source !== relation.target) {
        if (!graph.hasEdge(relation.source, relation.target)) {
          graph.addEdge(relation.source, relation.target, {
            relation_type: relation.relation_type
          });
          addedEdges++;
        }
      }
    } else {
      skippedEdges++;
    }
  });

  console.log(`✅ Graphe construit: ${addedNodes} nœuds, ${addedEdges} arêtes (${skippedEdges} arêtes ignorées)`);

  const components = connectedComponents(graph);
  console.log(`📊 Composantes connexes: ${components.length}`);

  return graph;
}

// ===== CALCUL DU LAYOUT =====

function calculateLayout(graph: UndirectedGraph, iterations: number): UndirectedGraph {
  console.log(`🌀 Calcul du layout ForceAtlas2 (${iterations} itérations)...`);

  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'x', (Math.random() - 0.5) * 100);
    graph.setNodeAttribute(node, 'y', (Math.random() - 0.5) * 100);
  });

  console.log('⚙️  Configuration ForceAtlas2:', FORCEATLAS2_SETTINGS);
  const startTime = Date.now();

  forceAtlas2.assign(graph, {
    ...FORCEATLAS2_SETTINGS,
    iterations: iterations
  });

  const duration = Date.now() - startTime;
  console.log(`✅ Layout calculé en ${duration}ms`);

  graph.forEachNode((node) => {
    const pos = graph.getNodeAttribute(node, 'pos');
    const baseZ = pos === 'n' ? 0 : pos === 'v' ? 2 : pos === 'a' ? -2 : 1;
    graph.setNodeAttribute(node, 'z', addJitterZ(baseZ, 5));
  });

  return graph;
}

// ===== EXPORT =====

function exportAtlas(graph: UndirectedGraph, outputPath: string): void {
  console.log(`💾 Export vers ${outputPath}...`);

  const nodes: Node3D[] = [];
  const edges: RelationEdge[] = [];

  graph.forEachNode((nodeId) => {
    const attributes = graph.getNodeAttributes(nodeId);
    nodes.push({
      id: nodeId,
      pos: attributes.pos || '',
      gloss_en: attributes.gloss_en || '',
      gloss_fr: attributes.gloss_fr || '',
      lemmas: attributes.lemmas || [],
      x: Math.round(attributes.x * 100) / 100,
      y: Math.round(attributes.y * 100) / 100,
      z: Math.round(attributes.z * 100) / 100
    });
  });

  graph.forEachEdge((edgeId, attributes, source, target) => {
    edges.push({
      source,
      target,
      relation_type: attributes?.relation_type
    });
  });

  const atlas: AtlasOutput = {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
  };

  fs.writeFileSync(outputPath, JSON.stringify(atlas, null, 2), 'utf8');

  console.log(`✅ Atlas exporté: ${nodes.length} nœuds, ${edges.length} arêtes`);
  console.log(`📁 Fichier: ${path.resolve(outputPath)}`);

  const stats = fs.statSync(outputPath);
  console.log(`📊 Taille: ${Math.round(stats.size / 1024)} KB`);
}

// ===== MAIN =====

async function main() {
  console.log('🌍 === Atlas Sémantique WordNet FR (ForceAtlas2) ===\n');

  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  try {
    validateInputFiles(args.input);

    const synsets = await loadSynsets(args.input);
    const relations = await loadRelations(args.input);
    const lemmasBySynset = await loadLemmas(args.input);

    console.log('🔗 Association des lemmas aux synsets...');
    let synsetsWithLemmas = 0;
    for (const [synsetId, lemmas] of lemmasBySynset.entries()) {
      const synset = synsets.get(synsetId);
      if (synset) {
        synset.lemmas = lemmas;
        synsetsWithLemmas++;
      }
    }
    console.log(`✅ ${synsetsWithLemmas} synsets associés à des lemmas français`);

    const graph = buildGraph(synsets, relations);
    const layoutGraph = calculateLayout(graph, args.iterations);
    exportAtlas(layoutGraph, args.output);

    console.log('\n🎉 Atlas généré avec succès!');
  } catch (error) {
    console.error('\n❌ Erreur:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
