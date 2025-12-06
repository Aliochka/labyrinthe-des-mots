#!/usr/bin/env ts-node

/**
 * Version TEST - Atlas réduit pour vérification d'intégration
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { UndirectedGraph } from 'graphology';
import { connectedComponents } from 'graphology-components';
import forceAtlas2 from 'graphology-layout-forceatlas2';

const MAX_NODES = 3000; // Version test réduite
const ITERATIONS = 30;

interface SynsetNode {
  id: string;
  pos: string;
  gloss_en?: string;
  gloss_fr?: string;
}

interface Node3D extends SynsetNode {
  x: number;
  y: number;
  z: number;
}

const FAST_SETTINGS = {
  barnesHutOptimize: true,
  barnesHutTheta: 1.2,
  scalingRatio: 25,
  gravity: 0.15,
  strongGravityMode: true,
  slowDown: 3,
};

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

async function loadTestSynsets(inputDir: string): Promise<Map<string, SynsetNode>> {
  console.log('📖 Chargement des synsets (VERSION TEST)...');
  const synsetsPath = path.join(inputDir, 'synsets.tab');
  const lines = await readFileLineByLine(synsetsPath);

  const synsets = new Map<string, SynsetNode>();
  let skipped = 0;

  for (let index = 0; index < lines.length && synsets.size < MAX_NODES; index++) {
    const line = lines[index];
    if (index === 0) continue;

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

  console.log(`✅ ${synsets.size} synsets chargés pour test (${skipped} ignorés)`);
  return synsets;
}

async function loadTestRelations(inputDir: string, validSynsets: Set<string>) {
  console.log('🔗 Chargement des relations (filtrées)...');
  const relationsPath = path.join(inputDir, 'relations.tab');
  const lines = await readFileLineByLine(relationsPath);

  const relations = [];
  let skipped = 0;

  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [source, relationType, target] = parts;
    if (validSynsets.has(source) && validSynsets.has(target)) {
      relations.push({ source, target, relation_type: relationType });
    } else {
      skipped++;
    }
  }

  console.log(`✅ ${relations.length} relations conservées (${skipped} filtrées)`);
  return relations;
}

async function main() {
  console.log('🧪 === Atlas TEST - Intégration Rapide ===\n');

  const inputDir = '../data/raw/omw-fr-1.4/';
  const outputFile = '../app/public/atlas-test.json';

  try {
    // Chargement test
    const synsets = await loadTestSynsets(inputDir);
    const validSynsetIds = new Set(synsets.keys());
    const relations = await loadTestRelations(inputDir, validSynsetIds);

    // Construction graphe
    console.log('🏗️  Construction du graphe test...');
    const graph = new UndirectedGraph();

    synsets.forEach((synset) => {
      graph.addNode(synset.id, {
        pos: synset.pos,
        gloss_fr: synset.gloss_fr
      });
    });

    let addedEdges = 0;
    relations.forEach((relation) => {
      if (graph.hasNode(relation.source) && graph.hasNode(relation.target)) {
        if (relation.source !== relation.target) {
          if (!graph.hasEdge(relation.source, relation.target)) {
            graph.addEdge(relation.source, relation.target);
            addedEdges++;
          }
        }
      }
    });

    console.log(`✅ Graphe test: ${graph.order} nœuds, ${addedEdges} arêtes`);

    // Layout rapide
    console.log(`⚡ ForceAtlas2 ultra-rapide (${ITERATIONS} itérations)...`);
    graph.forEachNode((node) => {
      graph.setNodeAttribute(node, 'x', (Math.random() - 0.5) * 100);
      graph.setNodeAttribute(node, 'y', (Math.random() - 0.5) * 100);
    });

    const startTime = Date.now();
    forceAtlas2.assign(graph, {
      ...FAST_SETTINGS,
      iterations: ITERATIONS
    });

    graph.forEachNode((node) => {
      const pos = graph.getNodeAttribute(node, 'pos');
      const baseZ = pos === 'n' ? 0 : pos === 'v' ? 2 : -1;
      graph.setNodeAttribute(node, 'z', baseZ + (Math.random() - 0.5) * 3);
    });

    console.log(`✅ Layout calculé en ${Date.now() - startTime}ms`);

    // Export
    const nodes: Node3D[] = [];
    const edges: any[] = [];

    graph.forEachNode((nodeId) => {
      const attr = graph.getNodeAttributes(nodeId);
      nodes.push({
        id: nodeId,
        pos: attr.pos,
        gloss_fr: attr.gloss_fr || '',
        x: Math.round(attr.x * 100) / 100,
        y: Math.round(attr.y * 100) / 100,
        z: Math.round(attr.z * 100) / 100
      });
    });

    graph.forEachEdge((edgeId, attributes, source, target) => {
      edges.push({ source, target });
    });

    const atlas = { nodes, edges };
    fs.writeFileSync(outputFile, JSON.stringify(atlas, null, 2));

    console.log(`🎉 Atlas TEST généré: ${outputFile}`);
    console.log(`📊 ${nodes.length} nœuds, ${edges.length} arêtes`);

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

main();