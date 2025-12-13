#!/usr/bin/env ts-node
/* eslint-disable no-console */

import fs from "fs";
import path from "path";
import readline from "readline";

type NodeKind = "lemma_fr" | "etym_external";

interface LemmaNode {
    lemma: string;
    synsets: Array<any>;
    senseCount: number;
    relationCount: number;
    // added
    kind?: NodeKind;
    lang?: string;
    hidden?: boolean;
    label: string
}

interface LemmaEdge {
    source: string;
    target: string;
    weight: number;
    relationTypes: string[];
    relationTypeCounts: Record<string, number>;
    // added
    etymologyLinks?: Array<{
        lang: string;
        direction?: string;
        confidence?: number;
        evidence?: any;
    }>;
}

interface LemmaGraph {
    nodes: LemmaNode[];
    edges: LemmaEdge[];
}

interface EtymEdgeIn {
    source: string;
    target: string;
    lang?: string; // "la", "grc", ...
    direction?: string;
    confidence?: number;
    evidence?: any;
}

interface CLIArgs {
    base: string;
    etym: string;
    out: string;
    capPerSource: number;
    capExternalDegree: number;
    help: boolean;
}

function parseArgs(): CLIArgs {
    const args: CLIArgs = {
        base: "./app/public/lemma-graph-cleaned.json",
        etym: "./data/etym/lemma_etym_edges.jsonl",
        out: "./app/public/lemma-graph+etym.json",
        capPerSource: 5,
        capExternalDegree: 200,
        help: false,
    };

    for (const a of process.argv.slice(2)) {
        if (a === "--help" || a === "-h") args.help = true;
        else if (a.startsWith("--base=")) args.base = a.split("=")[1];
        else if (a.startsWith("--etym=")) args.etym = a.split("=")[1];
        else if (a.startsWith("--out=")) args.out = a.split("=")[1];
        else if (a.startsWith("--capPerSource=")) args.capPerSource = Number(a.split("=")[1]);
        else if (a.startsWith("--capExternalDegree=")) args.capExternalDegree = Number(a.split("=")[1]);
    }

    return args;
}

function showHelp() {
    console.log(`
🔗 merge_etymology.ts

Merge ETYMOLOGY edges + external nodes into your lemma graph (WordNet stays primary).

Usage:
  npx ts-node scripts/merge_etymology.ts \\
    --base=./app/public/lemma-graph-cleaned.json \\
    --etym=./data/etym/lemma_etym_edges.jsonl \\
    --out=./app/public/lemma-graph+etym.json \\
    --capPerSource=5 \\
    --capExternalDegree=200
`);
}

// Must match your normalization rules (same spirit as build-lemma-graph.ts)
function normalizeLemma(lemma: string): string {
    return lemma
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[''`]/g, "")
        .replace(/\s+/g, "_")
        .trim();
}

// id for external nodes: "<lang>:<normalized>"
function externalNodeId(lang: string, normalized: string): string {
    return `${lang}:${normalized}`;
}

function edgeKeyUndirected(a: string, b: string): string {
    return [a, b].sort().join("||");
}

async function readJsonl(filePath: string): Promise<EtymEdgeIn[]> {
    const edges: EtymEdgeIn[] = [];
    const rs = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

    for await (const line of rl) {
        const t = line.trim();
        if (!t) continue;
        try {
            edges.push(JSON.parse(t));
        } catch (e) {
            console.warn(`⚠️ JSONL parse error (skipped): ${t.slice(0, 120)}...`);
        }
    }

    return edges;
}

function ensureDir(p: string) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
}

async function main() {
    const args = parseArgs();
    if (args.help) return showHelp();

    console.log("🧬 Merge ETYMOLOGY into lemma graph");
    console.log(`  base: ${args.base}`);
    console.log(`  etym: ${args.etym}`);
    console.log(`  out : ${args.out}`);
    console.log(`  capPerSource=${args.capPerSource} capExternalDegree=${args.capExternalDegree}`);

    const baseRaw = fs.readFileSync(args.base, "utf8");
    const graph: LemmaGraph = JSON.parse(baseRaw);

    // Index FR nodes by lemma (they are your ids in edges)
    const nodeById = new Map<string, LemmaNode>();
    for (const n of graph.nodes) {
        // treat existing as FR lemma nodes
        n.kind = n.kind ?? "lemma_fr";
        nodeById.set(n.lemma, n);
    }

    // Index edges (undirected, because your graph is undirected)
    const edgeByKey = new Map<string, LemmaEdge>();
    for (const e of graph.edges) {
        edgeByKey.set(edgeKeyUndirected(e.source, e.target), e);
    }

    // Read etym edges
    const etymEdges = await readJsonl(args.etym);
    console.log(`📥 Loaded etym edges (raw): ${etymEdges.length}`);

    // Group by FR source and apply capPerSource by confidence
    const bySource = new Map<string, EtymEdgeIn[]>();
    for (const ee of etymEdges) {
        if (!ee?.source || !ee?.target) continue;
        const src = normalizeLemma(ee.source);
        if (!bySource.has(src)) bySource.set(src, []);
        bySource.get(src)!.push(ee);
    }

    // Track external degree caps
    const externalDegree = new Map<string, number>();

    let used = 0;
    let skippedNoSourceNode = 0;
    let skippedExternalDegree = 0;
    let createdExternalNodes = 0;
    let createdNewEdges = 0;
    let mergedIntoExistingEdges = 0;

    for (const [srcNorm, list] of bySource.entries()) {
        // Source must exist in FR graph
        if (!nodeById.has(srcNorm)) {
            skippedNoSourceNode++;
            continue;
        }

        const sorted = list
            .slice()
            .sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1))
            .slice(0, Math.max(0, args.capPerSource));

        for (const ee of sorted) {
            const lang = (ee.lang || "und").toLowerCase();
            const tgtNorm =
                (ee as any).targetNorm ? String((ee as any).targetNorm) : normalizeLemma(ee.target);


            if (!tgtNorm) continue;

            // If target exists as FR lemma, we connect to it; else create external node
            let tgtId: string;
            if (nodeById.has(tgtNorm)) {
                tgtId = tgtNorm;
            } else {
                tgtId = externalNodeId(lang, tgtNorm);

                // cap external degree (avoid a single latin root connecting to thousands)
                const deg = externalDegree.get(tgtId) || 0;
                if (deg >= args.capExternalDegree) {
                    skippedExternalDegree++;
                    continue;
                }
                externalDegree.set(tgtId, deg + 1);

                if (!nodeById.has(tgtId)) {
                    nodeById.set(tgtId, {
                        lemma: tgtId,          // IMPORTANT: node id must match "lemma" for your graph format
                        synsets: [],
                        senseCount: 0,
                        relationCount: 0,
                        kind: "etym_external",
                        lang,
                        hidden: true,
                        label: ee.target
                    });
                    createdExternalNodes++;
                }
            }

            // Merge/create edge
            const key = edgeKeyUndirected(srcNorm, tgtId);
            const payload = {
                lang,
                direction: ee.direction,
                confidence: ee.confidence ?? 1,
                evidence: ee.evidence,
            };

            if (edgeByKey.has(key)) {
                const existing = edgeByKey.get(key)!;

                // add ETYMOLOGY tag
                if (!existing.relationTypes.includes("ETYMOLOGY")) existing.relationTypes.push("ETYMOLOGY");
                existing.relationTypeCounts["ETYMOLOGY"] = (existing.relationTypeCounts["ETYMOLOGY"] || 0) + 1;

                // attach evidence
                if (!existing.etymologyLinks) existing.etymologyLinks = [];
                existing.etymologyLinks.push(payload);

                mergedIntoExistingEdges++;
            } else {
                const newEdge: LemmaEdge = {
                    source: srcNorm,
                    target: tgtId,
                    weight: 1, // keep WordNet weight semantics: this is a standalone edge; you can set 0 if you want "purely auxiliary"
                    relationTypes: ["ETYMOLOGY"],
                    relationTypeCounts: { ETYMOLOGY: 1 },
                    etymologyLinks: [payload],
                };
                edgeByKey.set(key, newEdge);
                createdNewEdges++;
            }

            used++;
        }
    }

    // Rebuild graph.nodes + graph.edges from indexes
    graph.nodes = Array.from(nodeById.values());

    // IMPORTANT: if your front expects nodes with lemma without lang prefix,
    // external nodes will have lemma like "la:cambiare". That's on purpose (unique id).
    graph.edges = Array.from(edgeByKey.values());

    // Update relationCount for ALL nodes based on final edges
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }
    for (const n of graph.nodes) {
        n.relationCount = degree.get(n.lemma) || 0;
    }

    // Optional: keep external nodes at the end (helps debugging)
    graph.nodes.sort((a, b) => {
        const ka = a.kind === "etym_external" ? 1 : 0;
        const kb = b.kind === "etym_external" ? 1 : 0;
        if (ka !== kb) return ka - kb;
        return a.lemma.localeCompare(b.lemma);
    });

    ensureDir(args.out);
    fs.writeFileSync(args.out, JSON.stringify(graph, null, 2), "utf8");

    const sizeKb = Math.round(fs.statSync(args.out).size / 1024);

    console.log("✅ Merge done.");
    console.log(`  used etym edges (after caps): ${used}`);
    console.log(`  skipped (no source node):     ${skippedNoSourceNode}`);
    console.log(`  skipped (external deg cap):   ${skippedExternalDegree}`);
    console.log(`  external nodes created:       ${createdExternalNodes}`);
    console.log(`  new edges created:            ${createdNewEdges}`);
    console.log(`  merged into existing edges:   ${mergedIntoExistingEdges}`);
    console.log(`  out: ${path.resolve(args.out)} (${sizeKb} KB)`);
}

main().catch((e) => {
    console.error("❌ Fatal:", e);
    process.exit(1);
});
