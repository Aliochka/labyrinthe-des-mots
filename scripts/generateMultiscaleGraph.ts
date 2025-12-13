// scripts/generateMultiscaleGraph.ts
//
// Usage :
//   npx ts-node scripts/generateMultiscaleGraph.ts \
//       app/public/lemma-graph.json \
//       data/clusters.json \
//       data/positions/positions-random.json \
//       app/public/multiscale.json

import fs from "node:fs";
import path from "node:path";

// -------------------------------------------
// Types
// -------------------------------------------

interface RawNode {
    id?: string | number;
    lemma?: string;
    label?: string;
    name?: string;
    x?: number;
    y?: number;
    z?: number;
}

interface RawLink {
    source: string | number;
    target: string | number;
    relType?: string;
}

interface RawGraph {
    nodes: RawNode[];
    links: RawLink[];
}

interface GraphNode {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    degree: number;
    size?: number;
    members?: string[]; // IDs des nœuds originaux (pour les clusters)
}

interface GraphLink {
    source: string;
    target: string;
    relType?: string;
}

interface Positions {
    [id: string]: { x: number; y: number; z: number };
}

type LevelId = "supercluster" | "cluster" | "galaxy" | "planet";

interface MultiScaleLevel {
    id: LevelId;
    data: { nodes: GraphNode[]; links: GraphLink[] };
}

interface MultiScaleGraph {
    levels: MultiScaleLevel[];
}

// -------------------------------------------
// Utils
// -------------------------------------------

function canonicalId(n: RawNode): string {
    return (
        n.lemma ??
        n.label ??
        n.name ??
        (n.id !== undefined ? String(n.id) : undefined) ??
        (() => {
            throw new Error("Node without ID");
        })()
    );
}

function computeDegrees(nodes: RawNode[], links: RawLink[]): Map<string, number> {
    const deg = new Map<string, number>();

    nodes.forEach((n) => deg.set(canonicalId(n), 0));

    links.forEach((l) => {
        const s = String(l.source);
        const t = String(l.target);
        if (deg.has(s)) deg.set(s, deg.get(s)! + 1);
        if (deg.has(t)) deg.set(t, deg.get(t)! + 1);
    });

    return deg;
}

function computeBarycenter(nodes: GraphNode[]) {
    let sx = 0,
        sy = 0,
        sz = 0;

    for (const n of nodes) {
        sx += n.x;
        sy += n.y;
        sz += n.z;
    }

    const k = nodes.length || 1;

    return { x: sx / k, y: sy / k, z: sz / k };
}

// -------------------------------------------
// SCRIPT PRINCIPAL
// -------------------------------------------

// ⚠️ Nouvel ordre des arguments : graph, clusters, positions, output
const [, , graphPath, clustersPath, positionsPath, outputPath] = process.argv;

if (!graphPath || !clustersPath || !positionsPath || !outputPath) {
    console.error(`
Usage:
  npx ts-node scripts/generateMultiscaleGraph.ts \\
      <lemma-graph.json> <clusters.json> <positions.json> <output.json>
`);
    process.exit(1);
}

console.log("📥 Lecture du graphe:", graphPath);
const rawInput = JSON.parse(fs.readFileSync(graphPath, "utf8")) as any;

const rawGraph: RawGraph = {
    nodes: (rawInput.nodes ?? []) as RawNode[],
    // Supporte soit "links" soit "edges"
    links: (rawInput.links ?? rawInput.edges ?? []) as RawLink[],
};

console.log("📥 Lecture des clusters:", clustersPath);
const clusters = JSON.parse(fs.readFileSync(clustersPath, "utf8"));

console.log("📥 Lecture des positions:", positionsPath);
const positions: Positions = JSON.parse(fs.readFileSync(positionsPath, "utf8"));

// -------------------------------------------
// Étape 1 — Mise en forme des nœuds natifs (planet)
// -------------------------------------------

const degrees = computeDegrees(rawGraph.nodes, rawGraph.links);

const baseNodes: GraphNode[] = rawGraph.nodes.map((n) => {
    const id = canonicalId(n);
    const pos = positions[id] ?? { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 };
    const degree = degrees.get(id) ?? 0;

    return {
        id,
        name: id,
        degree,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        size: 4 + Math.log(degree + 1),
    };
});

const baseLinks: GraphLink[] = rawGraph.links.map((l) => ({
    source: String(l.source),
    target: String(l.target),
    relType: l.relType,
}));

// -------------------------------------------
// Étape 2 — Construire les niveaux clusterisés
// -------------------------------------------

// Nombre maximum de nœuds par niveau (downsampling intelligent)
const MAX_NODES_PER_LEVEL: Record<string, number> = {
    supercluster: 500,     // ~500 clusters max
    cluster: 5000,         // ~5000 clusters max
    galaxy: 20000,         // ~20000 clusters max
    planet: Infinity,      // tous les nœuds
};

function buildClusterLevel(levelId: LevelId): MultiScaleLevel {
    if (levelId === "planet") {
        return {
            id: "planet",
            data: { nodes: baseNodes, links: baseLinks },
        };
    }

    console.log(`\n🧩 Construction du niveau : ${levelId}`);

    const cmap = clusters.levels[levelId]; // exemple: { "vie": "cluster_12", ... }
    if (!cmap) {
        console.warn(`⚠️ Aucun mapping de clusters pour le niveau "${levelId}".`);
    }

    const buckets = new Map<string, GraphNode[]>();

    // Regrouper les nœuds par cluster ID
    for (const n of baseNodes) {
        const cid = cmap?.[n.id];
        if (!cid) continue;
        if (!buckets.has(cid)) buckets.set(cid, []);
        buckets.get(cid)!.push(n);
    }

    // Créer les nœuds synthétiques avec importance (somme des degrés)
    const candidateNodes: (GraphNode & { importance: number; clusterId: string; memberIds: string[] })[] = [];

    for (const [clusterId, bucket] of buckets) {
        // Barycentre
        const bary = computeBarycenter(bucket);

        // Mot le plus fréquent = degré maximum
        const rep = bucket.reduce((a, b) => (b.degree > a.degree ? b : a));

        // Importance = somme totale des degrés dans le cluster
        const importance = bucket.reduce((sum, n) => sum + n.degree, 0);

        // IDs des membres (pour filtrage en mode play)
        const memberIds = bucket.map(n => n.id);

        candidateNodes.push({
            id: clusterId,
            name: rep.name,
            degree: bucket.length,
            x: bary.x,
            y: bary.y,
            z: bary.z,
            size: 6 + Math.log(bucket.length + 1) * 2,
            importance,
            clusterId,
            memberIds,
        });
    }

    // Downsampling : garder seulement les top N clusters par importance
    const maxNodes = MAX_NODES_PER_LEVEL[levelId] ?? Infinity;
    const sortedNodes = candidateNodes.sort((a, b) => b.importance - a.importance);
    const selectedNodes = sortedNodes.slice(0, Math.min(maxNodes, sortedNodes.length));

    console.log(
        ` → ${candidateNodes.length} clusters trouvés, ${selectedNodes.length} gardés (downsampling: top ${maxNodes})`
    );

    const newNodes: GraphNode[] = selectedNodes.map((n, index) => ({
        id: `${levelId}_${index}`,
        name: n.name,
        degree: n.degree,
        x: n.x,
        y: n.y,
        z: n.z,
        size: n.size,
        members: n.memberIds, // Liste des IDs des nœuds originaux
    }));

    // Créer un mapping clusterId → nouveau ID synthétique
    const clusterIdToSyntheticId = new Map<string, string>();
    selectedNodes.forEach((n, index) => {
        clusterIdToSyntheticId.set(n.clusterId, `${levelId}_${index}`);
    });

    // Génération des liens inter-clusters
    const newLinks: GraphLink[] = [];
    const clusterLinks = new Map<string, Map<string, number>>();

    for (const link of baseLinks) {
        const srcCluster = cmap?.[link.source];
        const tgtCluster = cmap?.[link.target];

        if (!srcCluster || !tgtCluster || srcCluster === tgtCluster) continue;

        // Vérifier que les deux clusters sont dans les nœuds sélectionnés
        if (!clusterIdToSyntheticId.has(srcCluster) || !clusterIdToSyntheticId.has(tgtCluster))
            continue;

        if (!clusterLinks.has(srcCluster)) clusterLinks.set(srcCluster, new Map());
        const neighbors = clusterLinks.get(srcCluster)!;
        neighbors.set(tgtCluster, (neighbors.get(tgtCluster) || 0) + 1);
    }

    // Convertir en liens avec seuil (garder seulement liens significatifs)
    const minWeight =
        levelId === "supercluster" ? 5 : levelId === "cluster" ? 3 : levelId === "galaxy" ? 2 : 1;

    for (const [c1, neighbors] of clusterLinks) {
        for (const [c2, weight] of neighbors) {
            if (weight >= minWeight) {
                const syntheticId1 = clusterIdToSyntheticId.get(c1);
                const syntheticId2 = clusterIdToSyntheticId.get(c2);

                if (syntheticId1 && syntheticId2) {
                    newLinks.push({
                        source: syntheticId1,
                        target: syntheticId2,
                        relType: `aggregated_${weight}`,
                    });
                }
            }
        }
    }

    console.log(` → ${newLinks.length} liens inter-clusters (seuil: ${minWeight})`);

    return {
        id: levelId,
        data: {
            nodes: newNodes,
            links: newLinks,
        },
    };
}

// -------------------------------------------
// Étape 3 — Assembler le multiscale final
// -------------------------------------------

const levels: LevelId[] = ["supercluster", "cluster", "galaxy", "planet"];

const multi: MultiScaleGraph = {
    levels: levels.map((lev) => buildClusterLevel(lev)),
};

// -------------------------------------------
// Sauvegarde
// -------------------------------------------

console.log("💾 Écriture dans :", outputPath);
fs.writeFileSync(outputPath, JSON.stringify(multi, null, 2), "utf8");

console.log("✅ Terminé !");
