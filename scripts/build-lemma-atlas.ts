#!/usr/bin/env ts-node

/**
 * Lemma-Centric Atlas Builder for WordNet FR
 *
 * Transforms synset-centric atlas into lemma-centric atlas by:
 * 1. Aggregating multiple synsets per French lemma
 * 2. Deduplicating edges between lemmas (with weights)
 * 3. Calculating ForceAtlas2 layout with edge weights
 *
 * Usage:
 *   ts-node build-lemma-atlas.ts --iterations=1200 --input=../data/raw/omw-fr-1.4/
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
  lemmas?: string[];
}

interface RelationEdge {
  source: string;
  target: string;
  relation_type?: string;
}

interface LemmaNode {
  lemma: string;
  synsets: Array<{
    id: string;
    pos: string;
    gloss_en: string;
    gloss_fr: string;
  }>;
  x: number;
  y: number;
  z: number;
  senseCount: number;
  relationCount: number;
}

interface LemmaEdge {
  source: string;
  target: string;
  weight: number;
  relationTypes: string[];
}

interface LemmaAtlas {
  nodes: LemmaNode[];
  edges: LemmaEdge[];
}

interface CLIArgs {
  iterations: number;
  input: string;
  output: string;
  help: boolean;
}

// ===== CONFIGURATION =====

const DEFAULT_ITERATIONS = 200;
const DEFAULT_INPUT_DIR = './data/raw/omw-fr-1.4/';
const DEFAULT_OUTPUT_FILE = './lemma-atlas.json';

const FORCEATLAS2_SETTINGS = {
  barnesHutOptimize: true,
  barnesHutTheta: 1.0,
  scalingRatio: 20,
  gravity: 0.1,
  strongGravityMode: true,
  slowDown: 2,
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
📚 Lemma-Centric Atlas Builder for WordNet FR

Usage:
  ts-node build-lemma-atlas.ts [options]

Options:
  --iterations=N     ForceAtlas2 iterations (default: ${DEFAULT_ITERATIONS})
  --input=PATH       Input directory with synsets.tab, relations.tab, senses.tab
  --output=PATH      Output JSON file (default: ${DEFAULT_OUTPUT_FILE})
  --help, -h         Show this help

Example:
  ts-node build-lemma-atlas.ts --iterations=1200 --input=../data/raw/omw-fr-1.4/ --output=./lemma-atlas.json
`);
}

// ===== UTILITIES =====

async function readFileLineByLine(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim() && !line.startsWith('#')) {
      lines.push(line.trim());
    }
  }

  return lines;
}

function normalizeLemma(lemma: string): string {
  return lemma
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(/[''`]/g, '')            // Remove apostrophes
    .replace(/\s+/g, '_')             // Spaces to underscores (multi-word lemmas)
    .trim();
}

function addJitterZ(baseZ: number = 0, range: number = 10): number {
  return baseZ + (Math.random() - 0.5) * range;
}

// ===== DATA LOADING (reuse from build-atlas.ts) =====

async function loadSynsets(inputDir: string): Promise<Map<string, SynsetNode>> {
  console.log('📖 Chargement des synsets...');
  const synsetsPath = path.join(inputDir, 'synsets.tab');
  const lines = await readFileLineByLine(synsetsPath);

  const synsets = new Map<string, SynsetNode>();
  let skipped = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // Skip header

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
      gloss_fr: glossFr || glossEn || ''
    });
  }

  console.log(`✅ ${synsets.size} synsets chargés (${skipped} ignorés)`);
  return synsets;
}

async function loadRelations(inputDir: string): Promise<RelationEdge[]> {
  console.log('🔗 Chargement des relations...');
  const relationsPath = path.join(inputDir, 'relations.tab');
  const lines = await readFileLineByLine(relationsPath);

  const relations: RelationEdge[] = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    if (index === 0) return; // Skip header

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

  console.log(`✅ ${relations.length} relations chargées (${skipped} ignorées)`);
  return relations;
}

async function loadLemmas(inputDir: string): Promise<Map<string, string[]>> {
  console.log('📚 Chargement des lemmas français...');
  const sensesPath = path.join(inputDir, 'senses.tab');
  const lines = await readFileLineByLine(sensesPath);

  const lemmasBySynset = new Map<string, string[]>();
  let processed = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // Skip header

    const parts = line.split('\t');
    if (parts.length < 4) continue;

    const [synsetId, lemma, lang] = parts;

    // French lemmas only
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

// ===== CORE TRANSFORMATION LOGIC =====

/**
 * Aggregate synsets into lemma nodes
 *
 * For a synset with multiple lemmas ["chat", "félin", "minet"],
 * creates 3 separate LemmaNode entries, each containing the same synset.
 * This ensures navigability - users can search any variant.
 */
function aggregateSynsetsIntoLemmas(
  synsets: Map<string, SynsetNode>,
  synsetToLemmas: Map<string, string[]>
): Map<string, LemmaNode> {
  console.log('🔄 Agrégation des synsets en lemma nodes...');

  const lemmaNodes = new Map<string, LemmaNode>();
  let skippedNoLemmas = 0;

  for (const [synsetId, synset] of synsets.entries()) {
    const lemmas = synsetToLemmas.get(synsetId) || [];

    // Skip synsets without French lemmas
    if (lemmas.length === 0) {
      skippedNoLemmas++;
      continue;
    }

    for (const lemma of lemmas) {
      const normalizedLemma = normalizeLemma(lemma);

      // Initialize lemma node if first time seeing this lemma
      if (!lemmaNodes.has(normalizedLemma)) {
        lemmaNodes.set(normalizedLemma, {
          lemma: normalizedLemma,
          synsets: [],
          x: 0,
          y: 0,
          z: 0,
          senseCount: 0,
          relationCount: 0
        });
      }

      const lemmaNode = lemmaNodes.get(normalizedLemma)!;

      // Add synset to this lemma's collection
      lemmaNode.synsets.push({
        id: synsetId,
        pos: synset.pos,
        gloss_fr: synset.gloss_fr || '',
        gloss_en: synset.gloss_en || ''
      });
    }
  }

  // Calculate sense counts
  for (const lemmaNode of lemmaNodes.values()) {
    lemmaNode.senseCount = lemmaNode.synsets.length;
  }

  console.log(`✅ ${synsets.size} synsets → ${lemmaNodes.size} lemma nodes (${skippedNoLemmas} synsets sans lemmas FR ignorés)`);

  return lemmaNodes;
}

/**
 * Build lemma-level graph with edge deduplication and weighting
 *
 * For synset relations:
 *   vie₁ -hypernym-> existence₁
 *   vie₂ -hypernym-> existence₂
 *   vie₃ -meronym->  corps₁
 *
 * Creates lemma edges:
 *   vie --[weight=2, types=[hypernym]]-> existence
 *   vie --[weight=1, types=[meronym]]-> corps
 */
function buildLemmaGraph(
  lemmaNodes: Map<string, LemmaNode>,
  synsetRelations: RelationEdge[],
  synsetToLemmas: Map<string, string[]>
): { graph: UndirectedGraph; lemmaEdges: Map<string, LemmaEdge[]> } {
  console.log('🏗️  Construction du graphe de lemmas...');

  const graph = new UndirectedGraph();
  const lemmaEdges = new Map<string, LemmaEdge[]>();

  // Add nodes to graph
  for (const [lemma, node] of lemmaNodes.entries()) {
    graph.addNode(lemma, {
      lemma: lemma,
      senseCount: node.senseCount,
      synsets: node.synsets
    });
  }

  // Aggregate synset relations into lemma edges
  const edgeAggregator = new Map<string, {
    count: number;
    types: Set<string>;
  }>();

  for (const relation of synsetRelations) {
    const sourceLemmas = synsetToLemmas.get(relation.source) || [];
    const targetLemmas = synsetToLemmas.get(relation.target) || [];

    // Create edges for all lemma pairs (Cartesian product)
    for (const srcLemma of sourceLemmas) {
      for (const tgtLemma of targetLemmas) {
        const normalizedSrc = normalizeLemma(srcLemma);
        const normalizedTgt = normalizeLemma(tgtLemma);

        // Skip self-loops
        if (normalizedSrc === normalizedTgt) continue;

        // Skip if lemma nodes don't exist
        if (!lemmaNodes.has(normalizedSrc) || !lemmaNodes.has(normalizedTgt)) {
          continue;
        }

        // Create bidirectional key (undirected graph)
        const edgeKey = [normalizedSrc, normalizedTgt].sort().join('||');

        if (!edgeAggregator.has(edgeKey)) {
          edgeAggregator.set(edgeKey, {
            count: 0,
            types: new Set()
          });
        }

        const agg = edgeAggregator.get(edgeKey)!;
        agg.count++;
        agg.types.add(relation.relation_type || 'also');
      }
    }
  }

  // Add edges to graph with weights
  for (const [edgeKey, agg] of edgeAggregator.entries()) {
    const [lemma1, lemma2] = edgeKey.split('||');

    if (graph.hasNode(lemma1) && graph.hasNode(lemma2)) {
      graph.addEdge(lemma1, lemma2, {
        weight: agg.count,
        relationTypes: Array.from(agg.types)
      });

      // Store in lemmaEdges map for later export
      if (!lemmaEdges.has(lemma1)) {
        lemmaEdges.set(lemma1, []);
      }
      lemmaEdges.get(lemma1)!.push({
        source: lemma1,
        target: lemma2,
        weight: agg.count,
        relationTypes: Array.from(agg.types)
      });

      // Bidirectional (for undirected graph)
      if (!lemmaEdges.has(lemma2)) {
        lemmaEdges.set(lemma2, []);
      }
      lemmaEdges.get(lemma2)!.push({
        source: lemma2,
        target: lemma1,
        weight: agg.count,
        relationTypes: Array.from(agg.types)
      });
    }
  }

  console.log(`✅ Graphe construit: ${graph.order} nœuds, ${graph.size} arêtes`);

  const components = connectedComponents(graph);
  console.log(`📊 Composantes connexes: ${components.length}`);

  return { graph, lemmaEdges };
}

/**
 * Calculate ForceAtlas2 layout for lemmas with edge weights
 */
function calculateLemmaLayout(
  graph: UndirectedGraph,
  iterations: number
): UndirectedGraph {
  console.log(`🌀 Calcul du layout ForceAtlas2 (${iterations} itérations)...`);

  // Initialize random positions
  graph.forEachNode((lemma) => {
    graph.setNodeAttribute(lemma, 'x', (Math.random() - 0.5) * 100);
    graph.setNodeAttribute(lemma, 'y', (Math.random() - 0.5) * 100);
  });

  console.log('⚙️  Configuration ForceAtlas2:', FORCEATLAS2_SETTINGS);
  const startTime = Date.now();

  // Run ForceAtlas2 with edge weights
  forceAtlas2.assign(graph, {
    ...FORCEATLAS2_SETTINGS,
    iterations: iterations,
    // IMPORTANT: Use edge weights for force strength
    getEdgeWeight: 'weight'
  });

  const duration = Date.now() - startTime;
  console.log(`✅ Layout calculé en ${duration}ms`);

  // Add Z-coordinate based on sense count (more senses = higher Z for visual emphasis)
  graph.forEachNode((lemma) => {
    const senseCount = graph.getNodeAttribute(lemma, 'senseCount');
    const baseZ = Math.min(senseCount / 2, 10);
    graph.setNodeAttribute(lemma, 'z', addJitterZ(baseZ, 5));
  });

  return graph;
}

/**
 * Export lemma atlas to JSON
 */
function exportLemmaAtlas(
  graph: UndirectedGraph,
  lemmaNodes: Map<string, LemmaNode>,
  lemmaEdges: Map<string, LemmaEdge[]>,
  outputPath: string
): void {
  console.log(`💾 Export vers ${outputPath}...`);

  const nodes: LemmaNode[] = [];

  // Extract final positions from graph
  graph.forEachNode((lemma) => {
    const lemmaNode = lemmaNodes.get(lemma)!;

    // Calculate relation count
    const relCount = (lemmaEdges.get(lemma) || []).length;

    nodes.push({
      ...lemmaNode,
      x: Math.round(graph.getNodeAttribute(lemma, 'x') * 100) / 100,
      y: Math.round(graph.getNodeAttribute(lemma, 'y') * 100) / 100,
      z: Math.round(graph.getNodeAttribute(lemma, 'z') * 100) / 100,
      relationCount: relCount
    });
  });

  // Flatten edges (deduplicate)
  const edges: LemmaEdge[] = [];
  const seenEdges = new Set<string>();

  for (const edgeList of lemmaEdges.values()) {
    for (const edge of edgeList) {
      const key = [edge.source, edge.target].sort().join('||');
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push(edge);
      }
    }
  }

  const atlas: LemmaAtlas = {
    nodes: nodes.sort((a, b) => a.lemma.localeCompare(b.lemma)),
    edges: edges.sort((a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    )
  };

  fs.writeFileSync(outputPath, JSON.stringify(atlas, null, 2), 'utf8');

  const stats = fs.statSync(outputPath);
  console.log(`✅ Atlas exporté:`);
  console.log(`  - ${nodes.length} lemma nodes`);
  console.log(`  - ${edges.length} lemma edges`);
  console.log(`  - Fichier: ${path.resolve(outputPath)}`);
  console.log(`  - Taille: ${Math.round(stats.size / 1024)} KB`);
}

// ===== MAIN =====

async function main() {
  console.log('🌍 === Lemma-Centric Atlas Builder ===\n');

  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  try {
    // Load raw data
    const synsets = await loadSynsets(args.input);
    const relations = await loadRelations(args.input);
    const lemmasBySynset = await loadLemmas(args.input);

    // Transform to lemma-centric
    const lemmaNodes = aggregateSynsetsIntoLemmas(synsets, lemmasBySynset);
    const { graph, lemmaEdges } = buildLemmaGraph(lemmaNodes, relations, lemmasBySynset);

    // Calculate layout
    const layoutGraph = calculateLemmaLayout(graph, args.iterations);

    // Export
    exportLemmaAtlas(layoutGraph, lemmaNodes, lemmaEdges, args.output);

    console.log('\n🎉 Lemma atlas généré avec succès!');
  } catch (error) {
    console.error('\n❌ Erreur:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
