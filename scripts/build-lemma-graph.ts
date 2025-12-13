#!/usr/bin/env ts-node

/**
 * Lemma-Centric Graph Builder for WordNet FR
 *
 * Transforms synset-centric TSV into a lemma-centric GRAPH (sans layout).
 *
 * 1. Agrège les synsets par lemma FR
 * 2. Déduplique les arêtes et calcule des poids + typeCounts
 * 3. Nettoyage strict des lemmes (numériques/garbage)
 * 4. CLEAN: supprime uniquement les lemmes "noms propres" isolés (0 relations)
 *
 * Usage:
 *   ts-node scripts/build-lemma-graph.ts \
 *     --input=./data/raw/omw-fr-1.4 \
 *     --output=./app/public/lemma-graph.json
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { UndirectedGraph } from "graphology";
import { connectedComponents } from "graphology-components";

// ===== TYPES =====

interface SynsetNode {
  id: string;
  pos: string;
  lexname?: string;
  gloss_en?: string;
  gloss_fr?: string;
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
    lexname?: string;
    gloss_en: string;
    gloss_fr: string;
  }>;
  senseCount: number;
  relationCount: number;
}

interface LemmaEdge {
  source: string;
  target: string;
  weight: number;
  relationTypes: string[];
  relationTypeCounts: Record<string, number>;
}

interface LemmaGraph {
  nodes: LemmaNode[];
  edges: LemmaEdge[];
}

interface CLIArgs {
  input: string;
  output: string;
  help: boolean;
}

// ===== CONFIGURATION =====

const DEFAULT_INPUT_DIR = "./data/raw/omw-fr-1.4/";
const DEFAULT_OUTPUT_FILE = "./app/public/lemma-graph.json";

// Noms propres / entités nommées (WordNet lexname)
const BLOCKED_LEXNAMES = new Set<string>([
  "noun.person",
  "noun.location",
  // optionnel si tu veux: "noun.time"
]);

// ===== CLI PARSING =====

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    input: DEFAULT_INPUT_DIR,
    output: DEFAULT_OUTPUT_FILE,
    help: false,
  };

  process.argv.slice(2).forEach((arg) => {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--input=")) {
      args.input = arg.split("=")[1];
    } else if (arg.startsWith("--output=")) {
      args.output = arg.split("=")[1];
    }
  });

  return args;
}

function showHelp() {
  console.log(`
📚 Lemma-Centric Graph Builder for WordNet FR (CLEAN)

Usage:
  ts-node scripts/build-lemma-graph.ts [options]

Options:
  --input=PATH       Input directory with synsets.tab, relations.tab, senses.tab
  --output=PATH      Output JSON file (default: ${DEFAULT_OUTPUT_FILE})
  --help, -h         Show this help

Notes:
  - synsets.tab must now be: synset  pos  lexname  gloss_en  gloss_fr
  - removes ONLY named-entity lemmas that have 0 relations (isolated)
`);
}

// ===== UTILITIES =====

async function readFileLineByLine(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim() && !line.startsWith("#")) {
      lines.push(line.trim());
    }
  }

  return lines;
}

function normalizeLemma(lemma: string): string {
  return lemma
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[''`]/g, "") // remove apostrophes
    .replace(/\s+/g, "_") // spaces to underscores
    .trim();
}

function isNumericLikeLemma(s: string): boolean {
  // ex: "520", "-520", "+12", "003", "12.5", "12,5"
  return /^[+-]?\d+([.,]\d+)?$/.test(s);
}

function hasLetter(s: string): boolean {
  return /[a-z]/.test(s);
}

function isGarbageLemmaStrict(normalized: string): boolean {
  if (!normalized) return true;

  // pure numeric
  if (isNumericLikeLemma(normalized)) return true;

  // too short and no letter
  if (normalized.length <= 2 && !hasLetter(normalized)) return true;

  // no letter anywhere
  if (!hasLetter(normalized)) return true;

  // core empty after removing separators
  const core = normalized.replace(/[_-]/g, "");
  if (!core) return true;

  return false;
}

function isBlockedLexname(lexname?: string): boolean {
  return !!lexname && BLOCKED_LEXNAMES.has(lexname);
}

function lemmaHasBlockedLexname(node: LemmaNode): boolean {
  return node.synsets.some((s) => isBlockedLexname(s.lexname));
}

// ===== DATA LOADING =====

async function loadSynsets(inputDir: string): Promise<Map<string, SynsetNode>> {
  console.log("📖 Chargement des synsets...");
  const synsetsPath = path.join(inputDir, "synsets.tab");
  const lines = await readFileLineByLine(synsetsPath);

  const synsets = new Map<string, SynsetNode>();
  let skipped = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // header

    const parts = line.split("\t");

    // Expected: synset pos lexname gloss_en gloss_fr
    if (parts.length < 3) {
      skipped++;
      continue;
    }

    const synsetId = parts[0];
    const pos = parts[1];
    const lexname = parts[2] || "";
    const glossEn = parts[3] || "";
    const glossFr = parts[4] || "";

    if (!synsetId || !pos) {
      skipped++;
      continue;
    }

    synsets.set(synsetId, {
      id: synsetId,
      pos,
      lexname,
      gloss_en: glossEn || "",
      gloss_fr: (glossFr || glossEn || "").toString(),
    });
  }

  console.log(`✅ ${synsets.size} synsets chargés (${skipped} ignorés)`);
  return synsets;
}

async function loadRelations(inputDir: string): Promise<RelationEdge[]> {
  console.log("🔗 Chargement des relations...");
  const relationsPath = path.join(inputDir, "relations.tab");
  const lines = await readFileLineByLine(relationsPath);

  const relations: RelationEdge[] = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    if (index === 0) return; // header

    const parts = line.split("\t");
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
      source,
      target,
      relation_type: relationType,
    });
  });

  console.log(`✅ ${relations.length} relations chargées (${skipped} ignorés)`);
  return relations;
}

async function loadLemmas(inputDir: string): Promise<Map<string, string[]>> {
  console.log("📚 Chargement des lemmas français...");
  const sensesPath = path.join(inputDir, "senses.tab");
  const lines = await readFileLineByLine(sensesPath);

  const lemmasBySynset = new Map<string, string[]>();
  let processed = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === 0) continue; // header

    const parts = line.split("\t");
    if (parts.length < 4) continue;

    const [synsetId, lemma, lang] = parts;

    if (lang !== "fra") continue;

    if (!lemmasBySynset.has(synsetId)) {
      lemmasBySynset.set(synsetId, []);
    }

    const current = lemmasBySynset.get(synsetId)!;
    if (!current.includes(lemma)) current.push(lemma);

    processed++;
  }

  console.log(`✅ ${processed} lemmas français chargés pour ${lemmasBySynset.size} synsets`);
  return lemmasBySynset;
}

// ===== CORE LOGIC =====

function aggregateSynsetsIntoLemmas(
  synsets: Map<string, SynsetNode>,
  synsetToLemmas: Map<string, string[]>
): Map<string, LemmaNode> {
  console.log("🔄 Agrégation des synsets en lemma nodes...");

  const lemmaNodes = new Map<string, LemmaNode>();
  let skippedNoLemmas = 0;
  let filteredLemmas = 0;

  for (const [synsetId, synset] of synsets.entries()) {
    const lemmas = synsetToLemmas.get(synsetId) || [];

    if (lemmas.length === 0) {
      skippedNoLemmas++;
      continue;
    }

    for (const lemma of lemmas) {
      const normalizedLemma = normalizeLemma(lemma);

      // strict garbage/numeric filter
      if (isGarbageLemmaStrict(normalizedLemma)) {
        filteredLemmas++;
        continue;
      }

      if (!lemmaNodes.has(normalizedLemma)) {
        lemmaNodes.set(normalizedLemma, {
          lemma: normalizedLemma,
          synsets: [],
          senseCount: 0,
          relationCount: 0,
        });
      }

      const lemmaNode = lemmaNodes.get(normalizedLemma)!;
      lemmaNode.synsets.push({
        id: synsetId,
        pos: synset.pos,
        lexname: synset.lexname || "",
        gloss_fr: synset.gloss_fr || "",
        gloss_en: synset.gloss_en || "",
      });
    }
  }

  for (const lemmaNode of lemmaNodes.values()) {
    lemmaNode.senseCount = lemmaNode.synsets.length;
  }

  console.log(
    `✅ ${synsets.size} synsets → ${lemmaNodes.size} lemma nodes (${skippedNoLemmas} synsets sans lemmas FR ignorés)`
  );
  console.log(`🧹 Lemmas filtrés (strict): ${filteredLemmas}`);

  return lemmaNodes;
}

function buildLemmaGraph(
  lemmaNodes: Map<string, LemmaNode>,
  synsetRelations: RelationEdge[],
  synsetToLemmas: Map<string, string[]>
): { graph: UndirectedGraph; lemmaEdges: Map<string, LemmaEdge[]> } {
  console.log("🏗️  Construction du graphe de lemmas...");

  const graph = new UndirectedGraph();
  const lemmaEdges = new Map<string, LemmaEdge[]>();

  for (const [lemma, node] of lemmaNodes.entries()) {
    graph.addNode(lemma, {
      lemma,
      senseCount: node.senseCount,
      synsets: node.synsets,
    });
  }

  const edgeAggregator = new Map<string, { total: number; typeCounts: Map<string, number> }>();

  let filteredEdgeEndpoints = 0;

  for (const relation of synsetRelations) {
    const sourceLemmas = synsetToLemmas.get(relation.source) || [];
    const targetLemmas = synsetToLemmas.get(relation.target) || [];

    const relType = relation.relation_type || "also";

    for (const srcLemma of sourceLemmas) {
      for (const tgtLemma of targetLemmas) {
        const normalizedSrc = normalizeLemma(srcLemma);
        const normalizedTgt = normalizeLemma(tgtLemma);

        if (isGarbageLemmaStrict(normalizedSrc) || isGarbageLemmaStrict(normalizedTgt)) {
          filteredEdgeEndpoints++;
          continue;
        }

        if (normalizedSrc === normalizedTgt) continue;
        if (!lemmaNodes.has(normalizedSrc) || !lemmaNodes.has(normalizedTgt)) continue;

        const edgeKey = [normalizedSrc, normalizedTgt].sort().join("||");

        if (!edgeAggregator.has(edgeKey)) {
          edgeAggregator.set(edgeKey, { total: 0, typeCounts: new Map() });
        }

        const agg = edgeAggregator.get(edgeKey)!;
        agg.total++;
        agg.typeCounts.set(relType, (agg.typeCounts.get(relType) || 0) + 1);
      }
    }
  }

  console.log(`🧹 Endpoints d’arêtes filtrés (strict): ${filteredEdgeEndpoints}`);

  // materialize edges
  for (const [edgeKey, agg] of edgeAggregator.entries()) {
    const [lemma1, lemma2] = edgeKey.split("||");
    if (!graph.hasNode(lemma1) || !graph.hasNode(lemma2)) continue;

    const relationTypeCounts = Object.fromEntries(agg.typeCounts.entries());
    const relationTypes = Object.keys(relationTypeCounts);

    graph.addEdge(lemma1, lemma2, {
      weight: agg.total,
      relationTypes,
      relationTypeCounts,
    });

    if (!lemmaEdges.has(lemma1)) lemmaEdges.set(lemma1, []);
    lemmaEdges.get(lemma1)!.push({
      source: lemma1,
      target: lemma2,
      weight: agg.total,
      relationTypes,
      relationTypeCounts,
    });

    if (!lemmaEdges.has(lemma2)) lemmaEdges.set(lemma2, []);
    lemmaEdges.get(lemma2)!.push({
      source: lemma2,
      target: lemma1,
      weight: agg.total,
      relationTypes,
      relationTypeCounts,
    });
  }

  // ===== CLEAN STEP: remove only named-entity lemmas with 0 relations =====
  let prunedNamedEntityIsolates = 0;

  for (const [lemma, node] of lemmaNodes.entries()) {
    const relCount = (lemmaEdges.get(lemma) || []).length;
    const isIsolated = relCount === 0;

    if (isIsolated && lemmaHasBlockedLexname(node)) {
      // remove from structures
      if (graph.hasNode(lemma)) graph.dropNode(lemma);
      lemmaNodes.delete(lemma);
      lemmaEdges.delete(lemma); // empty anyway
      prunedNamedEntityIsolates++;
    }
  }

  console.log(`🧽 Prune NE isolés (noun.person/noun.location avec 0 relations): ${prunedNamedEntityIsolates}`);

  console.log(`✅ Graphe construit (après prune): ${graph.order} nœuds, ${graph.size} arêtes`);
  const components = connectedComponents(graph);
  console.log(`📊 Composantes connexes (après prune): ${components.length}`);

  return { graph, lemmaEdges };
}

function exportLemmaGraph(
  lemmaNodes: Map<string, LemmaNode>,
  lemmaEdges: Map<string, LemmaEdge[]>,
  outputPath: string
): void {
  console.log(`💾 Export vers ${outputPath}...`);

  const nodes: LemmaNode[] = [];

  for (const lemmaNode of lemmaNodes.values()) {
    const relCount = (lemmaEdges.get(lemmaNode.lemma) || []).length;
    nodes.push({
      ...lemmaNode,
      relationCount: relCount,
    });
  }

  const edges: LemmaEdge[] = [];
  const seenEdges = new Set<string>();

  for (const edgeList of lemmaEdges.values()) {
    for (const edge of edgeList) {
      const key = [edge.source, edge.target].sort().join("||");
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push(edge);
      }
    }
  }

  const graph: LemmaGraph = {
    nodes: nodes.sort((a, b) => a.lemma.localeCompare(b.lemma)),
    edges: edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target)),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), "utf8");

  const stats = fs.statSync(outputPath);
  console.log(`✅ Graphe exporté:`);
  console.log(`  - ${nodes.length} lemma nodes`);
  console.log(`  - ${edges.length} lemma edges`);
  console.log(`  - Fichier: ${path.resolve(outputPath)}`);
  console.log(`  - Taille: ${Math.round(stats.size / 1024)} KB`);
}

// ===== MAIN =====

async function main() {
  console.log("🌍 === Lemma-Centric Graph Builder (CLEAN) ===\n");

  const args = parseArgs();
  if (args.help) {
    showHelp();
    return;
  }

  try {
    const synsets = await loadSynsets(args.input);
    const relations = await loadRelations(args.input);
    const lemmasBySynset = await loadLemmas(args.input);

    const lemmaNodes = aggregateSynsetsIntoLemmas(synsets, lemmasBySynset);
    const { graph, lemmaEdges } = buildLemmaGraph(lemmaNodes, relations, lemmasBySynset);

    exportLemmaGraph(lemmaNodes, lemmaEdges, args.output);

    console.log("\n🎉 Lemma graph généré avec succès!");
  } catch (error) {
    console.error("\n❌ Erreur:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
