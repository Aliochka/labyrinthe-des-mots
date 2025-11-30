// src/core-graph/graphStore.ts
import type {
    ConceptNode,
    RelationEdge,
} from '../types/graph';

// --- Mini graphe de test ---
// 3 synsets : "desert", "oasis", "sable"

const NODES: ConceptNode[] = [
    {
        id: 1,
        pos: 'N',
        lemmas: ['désert', 'desert'], // on met aussi sans accent pour simplifier
        gloss: 'Région aride peu ou pas peuplée.',
    },
    {
        id: 2,
        pos: 'N',
        lemmas: ['oasis'],
        gloss: 'Lieu fertile dans un désert.',
    },
    {
        id: 3,
        pos: 'N',
        lemmas: ['sable'],
        gloss: 'Granules provenant de la désagrégation de roches.',
    },
];

const RELATIONS: RelationEdge[] = [
    // desert <-> oasis (antonymie symbolique)
    { from: 1, to: 2, type: 'ANTONYM' },
    { from: 2, to: 1, type: 'ANTONYM' },

    // desert -> sable (hypernym/hyponym un peu impro, mais c'est juste un exemple)
    { from: 1, to: 3, type: 'HYPONYM' },
    { from: 3, to: 1, type: 'HYPERNYM' },
];

// --- Indexes en mémoire ---

let initialized = false;

const nodesById = new Map<number, ConceptNode>();
const adjacency = new Map<number, RelationEdge[]>();
const wordToSynsetIds = new Map<string, number[]>();

function ensureInitialized() {
    if (initialized) return;

    // Index par id
    for (const node of NODES) {
        nodesById.set(node.id, node);
    }

    // Listes d'adjacence
    for (const edge of RELATIONS) {
        if (!adjacency.has(edge.from)) {
            adjacency.set(edge.from, []);
        }
        adjacency.get(edge.from)!.push(edge);
    }

    // Index lexical mot normalisé -> synsetIds
    for (const node of NODES) {
        for (const lemma of node.lemmas) {
            const norm = normalizeWord(lemma);
            const list = wordToSynsetIds.get(norm) ?? [];
            if (!list.includes(node.id)) {
                list.push(node.id);
            }
            wordToSynsetIds.set(norm, list);
        }
    }

    initialized = true;
}

// Normalisation simple (on améliorera plus tard)
export function normalizeWord(raw: string): string {
    return raw.trim().toLowerCase();
}

export function getSynsetById(id: number): ConceptNode | undefined {
    ensureInitialized();
    return nodesById.get(id);
}

export function getNeighbors(id: number): RelationEdge[] {
    ensureInitialized();
    return adjacency.get(id) ?? [];
}

export function getSynsetsForWord(word: string): number[] {
    ensureInitialized();
    const norm = normalizeWord(word);
    return wordToSynsetIds.get(norm) ?? [];
}

// Exposer les nodes pour construire des GraphSlice
export function getAllNodesByIds(ids: Set<number>): ConceptNode[] {
    ensureInitialized();
    const result: ConceptNode[] = [];
    for (const id of ids) {
        const node = nodesById.get(id);
        if (node) result.push(node);
    }
    return result;
}
