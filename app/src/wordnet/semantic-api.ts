// src/wordnet/semantic-api.ts
/**
 * API sémantique pour l'exploration et la recherche dans WordNet français.
 *
 * Fournit les fonctions d'expansion autour d'un mot et de recherche de chemins
 * entre deux mots dans le graphe sémantique.
 */

import type {
  PosTag,
  RelationType,
  SynsetsMap,
  RelationsMap,
  LexicalIndex,
  WordnetData,
} from "./loadData";

export interface GraphNode {
  id: number;       // id numérique (cohérent avec les JSON)
  pos: PosTag;
  lemmas: string[];
  gloss?: string;
}

export interface GraphEdge {
  source: number;
  target: number;
  relation: RelationType;
}

export interface GraphSlice {
  centerId?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Path {
  nodeIds: number[]; // séquence de synsetIds numériques
}

export type SemanticStatus =
  | "OK"
  | "WORD_NOT_FOUND"
  | "AMBIGUOUS"
  | "NO_PATH"
  | "ERROR";

export interface SenseInfo {
  synsetId: number;
  pos: PosTag;
  lemmas: string[];
  gloss?: string;
}

export interface ExpandFromWordResult {
  status: SemanticStatus;
  graph?: GraphSlice;
  senses?: SenseInfo[];
  usedSynsetId?: number;
  message?: string;
}

export interface FindPathBetweenWordsResult {
  status: SemanticStatus;
  graph?: GraphSlice;      // graphe fusionné (halo A, halo B, chemin)
  path?: Path;
  sensesA?: SenseInfo[];
  sensesB?: SenseInfo[];
  usedSynsetA?: number;
  usedSynsetB?: number;
  message?: string;
}

/**
 * Normalise un mot selon les règles du prétraitement:
 * - minuscules
 * - suppression des accents (NFD)
 * - suppression des apostrophes, tirets, espaces
 */
function normalizeWord(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')                    // Décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, '')     // Supprime les diacritiques
    .replace(/[''`]/g, '')               // Supprime les apostrophes
    .replace(/[-]/g, '')                 // Supprime les tirets
    .replace(/\s/g, '');                 // Supprime les espaces
}

/**
 * Choisit automatiquement un sens parmi les candidats selon l'heuristique:
 * - Priorité POS: N > ADJ > V
 * - À POS égale: plus petit ID numérique
 */
function autoPickSenseId(
  candidateIds: number[],
  synsets: SynsetsMap
): number | null {
  if (candidateIds.length === 0) {
    return null;
  }

  // Grouper par POS avec priorité
  const posRank: Record<PosTag, number> = { "N": 1, "ADJ": 2, "V": 3 };

  let bestId = candidateIds[0];
  let bestRank = Infinity;

  for (const id of candidateIds) {
    const synsetData = synsets[id.toString()];
    if (!synsetData) continue;

    const currentRank = posRank[synsetData.pos] || 999;

    // Meilleur rang POS, ou même rang mais ID plus petit
    if (currentRank < bestRank || (currentRank === bestRank && id < bestId)) {
      bestRank = currentRank;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * Convertit les IDs de synsets en SenseInfo pour l'interface utilisateur.
 */
function buildSenseInfos(synsetIds: number[], synsets: SynsetsMap): SenseInfo[] {
  return synsetIds
    .map(id => {
      const data = synsets[id.toString()];
      if (!data) return null;

      return {
        synsetId: id,
        pos: data.pos,
        lemmas: [...data.lemmas],
        gloss: data.gloss
      };
    })
    .filter((sense): sense is SenseInfo => sense !== null);
}

/**
 * Construit un GraphSlice par expansion BFS à partir d'un synset central.
 */
function buildGraphSlice(
  centerId: number,
  data: WordnetData,
  options: {
    depth: number;
    maxNodes: number;
    allowedRelations: RelationType[];
  }
): GraphSlice {
  const { synsets, relations } = data;
  const { depth, maxNodes, allowedRelations } = options;

  const visitedIds = new Set<number>([centerId]);
  const nodeIds = new Set<number>([centerId]);
  const edges: GraphEdge[] = [];

  // BFS par couches
  let currentLayer = [centerId];

  for (let currentDepth = 0; currentDepth < depth && nodeIds.size < maxNodes; currentDepth++) {
    const nextLayer: number[] = [];

    for (const sourceId of currentLayer) {
      const sourceRelations = relations[sourceId.toString()] || [];

      for (const [relationType, targetId] of sourceRelations) {
        // Filtrer les relations autorisées
        if (!allowedRelations.includes(relationType)) {
          continue;
        }

        // Vérifier que le target existe
        if (!synsets[targetId.toString()]) {
          continue;
        }

        // Ajouter l'arête
        edges.push({
          source: sourceId,
          target: targetId,
          relation: relationType
        });

        // Ajouter le nœud target si pas encore visité
        if (!visitedIds.has(targetId)) {
          visitedIds.add(targetId);
          nodeIds.add(targetId);
          nextLayer.push(targetId);

          // Arrêter si on atteint la limite de nœuds
          if (nodeIds.size >= maxNodes) {
            break;
          }
        }
      }

      if (nodeIds.size >= maxNodes) {
        break;
      }
    }

    currentLayer = nextLayer;
    if (currentLayer.length === 0) {
      break;
    }
  }

  // Construire les GraphNode
  const nodes: GraphNode[] = Array.from(nodeIds)
    .map(id => {
      const data = synsets[id.toString()];
      if (!data) return null;

      return {
        id,
        pos: data.pos,
        lemmas: [...data.lemmas],
        gloss: data.gloss
      };
    })
    .filter((node): node is GraphNode => node !== null);

  return {
    centerId,
    nodes,
    edges
  };
}

/**
 * Recherche du plus court chemin entre deux synsets avec BFS.
 */
function findShortestPath(
  startId: number,
  endId: number,
  data: WordnetData,
  options: {
    maxDepth: number;
    allowedRelations: RelationType[];
  }
): number[] | null {
  const { relations } = data;
  const { maxDepth, allowedRelations } = options;

  if (startId === endId) {
    return [startId];
  }

  const visited = new Set<number>([startId]);
  const parent = new Map<number, number>();
  const queue: Array<{ id: number; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const { id: currentId, depth } = queue.shift()!;

    if (depth >= maxDepth) {
      continue;
    }

    const currentRelations = relations[currentId.toString()] || [];

    for (const [relationType, targetId] of currentRelations) {
      if (!allowedRelations.includes(relationType)) {
        continue;
      }

      if (visited.has(targetId)) {
        continue;
      }

      visited.add(targetId);
      parent.set(targetId, currentId);

      if (targetId === endId) {
        // Reconstruire le chemin
        const path: number[] = [];
        let current = endId;

        while (current !== undefined) {
          path.unshift(current);
          current = parent.get(current)!;
        }

        return path;
      }

      queue.push({ id: targetId, depth: depth + 1 });
    }
  }

  return null; // Aucun chemin trouvé
}

/**
 * Construit un graphe fusionné incluant un chemin et optionnellement des halos.
 */
function buildMergedGraphWithPath(
  path: number[],
  synsetA: number,
  synsetB: number,
  data: WordnetData,
  allowedRelations: RelationType[]
): GraphSlice {
  const { synsets, relations } = data;

  const nodeIds = new Set<number>(path);
  const edges: GraphEdge[] = [];

  // Ajouter les arêtes du chemin
  for (let i = 0; i < path.length - 1; i++) {
    const sourceId = path[i];
    const targetId = path[i + 1];

    // Trouver la relation entre ces deux synsets
    const sourceRelations = relations[sourceId.toString()] || [];
    const relation = sourceRelations.find(([_, target]) => target === targetId)?.[0];

    if (relation && allowedRelations.includes(relation)) {
      edges.push({
        source: sourceId,
        target: targetId,
        relation
      });
    }
  }

  // Ajouter des halos autour de A et B (voisins directs)
  const addHalo = (centerId: number) => {
    const centerRelations = relations[centerId.toString()] || [];

    for (const [relationType, targetId] of centerRelations) {
      if (!allowedRelations.includes(relationType)) {
        continue;
      }

      if (!synsets[targetId.toString()]) {
        continue;
      }

      nodeIds.add(targetId);

      // Ajouter l'arête si pas déjà présente
      const edgeExists = edges.some(e =>
        e.source === centerId && e.target === targetId && e.relation === relationType
      );

      if (!edgeExists) {
        edges.push({
          source: centerId,
          target: targetId,
          relation: relationType
        });
      }
    }
  };

  addHalo(synsetA);
  addHalo(synsetB);

  // Construire les GraphNode
  const nodes: GraphNode[] = Array.from(nodeIds)
    .map(id => {
      const data = synsets[id.toString()];
      if (!data) return null;

      return {
        id,
        pos: data.pos,
        lemmas: [...data.lemmas],
        gloss: data.gloss
      };
    })
    .filter((node): node is GraphNode => node !== null);

  return {
    centerId: synsetA,
    nodes,
    edges
  };
}

/**
 * Expande le graphe sémantique autour d'un mot.
 */
export function expandFromWord(
  word: string,
  data: WordnetData,
  options?: {
    depth?: number;
    maxNodes?: number;
    allowedRelations?: RelationType[];
  }
): ExpandFromWordResult {
  try {
    const opts = {
      depth: options?.depth ?? 2,
      maxNodes: options?.maxNodes ?? 300,
      allowedRelations: options?.allowedRelations ?? ["HYPERNYM", "HYPONYM", "ANTONYM"] as RelationType[]
    };

    // Normaliser le mot et chercher dans l'index lexical
    const normalizedWord = normalizeWord(word);
    const lexicalEntry = data.lexicalIndex[normalizedWord];

    if (!lexicalEntry) {
      return {
        status: "WORD_NOT_FOUND",
        message: `Le mot "${word}" n'a pas été trouvé dans le lexique.`
      };
    }

    // Récupérer tous les synsetIds candidats
    const candidateIds: number[] = [];
    for (const pos of ["N", "V", "ADJ"] as PosTag[]) {
      const ids = lexicalEntry[pos] || [];
      candidateIds.push(...ids);
    }

    if (candidateIds.length === 0) {
      return {
        status: "WORD_NOT_FOUND",
        message: `Aucun sens trouvé pour le mot "${word}".`
      };
    }

    // Construire les informations sur les sens
    const senses = buildSenseInfos(candidateIds, data.synsets);

    // Choisir automatiquement un sens
    const usedSynsetId = autoPickSenseId(candidateIds, data.synsets);

    if (usedSynsetId === null) {
      return {
        status: "AMBIGUOUS",
        senses,
        message: `Le mot "${word}" a plusieurs sens possibles. Choix automatique impossible.`
      };
    }

    // Construire le graphe par expansion
    const graph = buildGraphSlice(usedSynsetId, data, opts);

    return {
      status: "OK",
      graph,
      senses,
      usedSynsetId
    };

  } catch (error) {
    return {
      status: "ERROR",
      message: `Erreur lors de l'expansion: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    };
  }
}

/**
 * Recherche un chemin sémantique entre deux mots.
 */
export function findPathBetweenWords(
  wordA: string,
  wordB: string,
  data: WordnetData,
  options?: {
    maxDepth?: number;
    allowedRelations?: RelationType[];
  }
): FindPathBetweenWordsResult {
  try {
    const opts = {
      maxDepth: options?.maxDepth ?? 6,
      allowedRelations: options?.allowedRelations ?? ["HYPERNYM", "HYPONYM", "ANTONYM"] as RelationType[]
    };

    // Résoudre le premier mot
    const normalizedA = normalizeWord(wordA);
    const lexicalEntryA = data.lexicalIndex[normalizedA];

    if (!lexicalEntryA) {
      return {
        status: "WORD_NOT_FOUND",
        message: `Le mot "${wordA}" n'a pas été trouvé dans le lexique.`
      };
    }

    const candidateIdsA: number[] = [];
    for (const pos of ["N", "V", "ADJ"] as PosTag[]) {
      const ids = lexicalEntryA[pos] || [];
      candidateIdsA.push(...ids);
    }

    const sensesA = buildSenseInfos(candidateIdsA, data.synsets);
    const usedSynsetA = autoPickSenseId(candidateIdsA, data.synsets);

    // Résoudre le deuxième mot
    const normalizedB = normalizeWord(wordB);
    const lexicalEntryB = data.lexicalIndex[normalizedB];

    if (!lexicalEntryB) {
      return {
        status: "WORD_NOT_FOUND",
        sensesA,
        usedSynsetA: usedSynsetA || undefined,
        message: `Le mot "${wordB}" n'a pas été trouvé dans le lexique.`
      };
    }

    const candidateIdsB: number[] = [];
    for (const pos of ["N", "V", "ADJ"] as PosTag[]) {
      const ids = lexicalEntryB[pos] || [];
      candidateIdsB.push(...ids);
    }

    const sensesB = buildSenseInfos(candidateIdsB, data.synsets);
    const usedSynsetB = autoPickSenseId(candidateIdsB, data.synsets);

    // Vérifier que les deux sens ont été résolus
    if (usedSynsetA === null || usedSynsetB === null) {
      const ambiguousWords = [];
      if (usedSynsetA === null) ambiguousWords.push(wordA);
      if (usedSynsetB === null) ambiguousWords.push(wordB);

      return {
        status: "AMBIGUOUS",
        sensesA,
        sensesB,
        usedSynsetA: usedSynsetA || undefined,
        usedSynsetB: usedSynsetB || undefined,
        message: `Sens ambigus pour: ${ambiguousWords.join(', ')}.`
      };
    }

    // Rechercher un chemin
    const pathNodeIds = findShortestPath(usedSynsetA, usedSynsetB, data, opts);

    if (!pathNodeIds) {
      return {
        status: "NO_PATH",
        sensesA,
        sensesB,
        usedSynsetA,
        usedSynsetB,
        message: `Aucun chemin trouvé entre "${wordA}" et "${wordB}".`
      };
    }

    // Construire le graphe fusionné avec halos
    const graph = buildMergedGraphWithPath(pathNodeIds, usedSynsetA, usedSynsetB, data, opts.allowedRelations);

    const path: Path = { nodeIds: pathNodeIds };

    return {
      status: "OK",
      graph,
      path,
      sensesA,
      sensesB,
      usedSynsetA,
      usedSynsetB
    };

  } catch (error) {
    return {
      status: "ERROR",
      message: `Erreur lors de la recherche de chemin: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    };
  }
}