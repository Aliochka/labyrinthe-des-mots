// src/semantic-api/words.ts
import type {
  ExpandFromWordResult,
  ExpandOptions,
  FindPathBetweenWordsResult,
  FindPathBetweenWordsStatus,
  PathOptions,
} from '../types/api';
import { expandFromSynset } from '../core-graph/expand';
import { findPathBetweenSynsets } from '../core-graph/path';
import {
  getSynsetById,
  getSynsetsForWord,
  normalizeWord,
} from '../core-graph/graphStore';

/**
 * Expansion à partir d'un mot (UX)
 */
export function expandFromWord(
  word: string,
  options: ExpandOptions = {}
): ExpandFromWordResult {
  const norm = normalizeWord(word);
  const synsetIds = getSynsetsForWord(norm);

  if (synsetIds.length === 0) {
    return {
      graph: null,
      senses: [],
      usedSynsetId: undefined,
      status: 'WORD_NOT_FOUND',
    };
  }

  // V1 : on choisit simplement le premier synset
  const usedSynsetId = synsetIds[0];

  // On récupère les "senses" (tous les synsets possibles pour ce mot)
  const senses = synsetIds
    .map((id) => getSynsetById(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  const graph = expandFromSynset(usedSynsetId, options);

  return {
    graph,
    senses,
    usedSynsetId,
    status: 'OK',
  };
}

/**
 * Chemin entre deux mots (UX)
 */
export function findPathBetweenWords(
  wordA: string,
  wordB: string,
  options: PathOptions = {}
): FindPathBetweenWordsResult {
  const normA = normalizeWord(wordA);
  const normB = normalizeWord(wordB);

  const synsetsA = getSynsetsForWord(normA);
  const synsetsB = getSynsetsForWord(normB);

  if (synsetsA.length === 0 || synsetsB.length === 0) {
    return {
      status: 'WORD_NOT_FOUND',
      pathResult: {
        status: 'START_OR_END_NOT_FOUND',
        paths: [],
        meta: { exploredNodes: 0, truncated: false },
      },
      sensesA: [],
      sensesB: [],
      usedSynsetA: undefined,
      usedSynsetB: undefined,
    };
  }

  // V1 : on choisit simplement le premier synset pour chaque mot
  const usedSynsetA = synsetsA[0];
  const usedSynsetB = synsetsB[0];

  const pathResult = findPathBetweenSynsets(usedSynsetA, usedSynsetB, options);

  // Statut côté "words"
  let status: FindPathBetweenWordsStatus;
  if (pathResult.status === 'OK') {
    status = 'OK';
  } else if (pathResult.status === 'NO_PATH') {
    status = 'NO_PATH';
  } else {
    status = 'ERROR';
  }

  return {
    status,
    pathResult,
    sensesA: synsetsA
      .map((id) => getSynsetById(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n)),
    sensesB: synsetsB
      .map((id) => getSynsetById(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n)),
    usedSynsetA,
    usedSynsetB,
  };
}
