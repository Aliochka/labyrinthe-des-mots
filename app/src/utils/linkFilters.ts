// src/utils/linkFilters.ts
/**
 * Utilitaires de filtrage des liens par type de relation
 * Utilisé par Map3D et GraphExploration
 */

import type { GraphLink } from '../types/graph';
import type { LemmaEdge } from '../types/lemma';
import { normalizeRelationType } from '../constants/relationTypes';

/**
 * Vérifie si un lien doit être visible selon les types de relations activés
 *
 * @param link - Lien du graphe avec champ relType
 * @param enabledTypes - Set des types de relations activés (IDs en majuscules)
 * @returns true si le lien doit être affiché
 */
export const isLinkVisible = (
  link: GraphLink,
  enabledTypes: Set<string>
): boolean => {
  const relType = link.relType;

  // Pas de relType défini : c'est probablement un lien agrégé de niveau cluster
  // On les affiche toujours (ils ne représentent pas un type de relation unique)
  if (!relType) return true;

  // Liens agrégés de niveau cluster (ex: "aggregated_5", "w42")
  // Ces liens combinent plusieurs types de relations, donc on les affiche toujours
  if (relType.startsWith('aggregated_') || relType.startsWith('w')) {
    return true;
  }

  // Si le lien possède un tableau relationTypes (liens de niveau planet)
  if ('relationTypes' in link && Array.isArray((link as any).relationTypes)) {
    const relationTypes = (link as any).relationTypes as string[];

    // Afficher le lien si AU MOINS UN de ses types est activé
    return relationTypes.some((rt) => {
      const normalized = normalizeRelationType(rt);
      return enabledTypes.has(normalized);
    });
  }

  // Fallback : traiter relType comme un type de relation unique
  const normalized = normalizeRelationType(relType);
  return enabledTypes.has(normalized);
};

/**
 * Filtrer un tableau de GraphLinks par types de relations activés
 *
 * @param links - Tableau de liens à filtrer
 * @param enabledTypes - Set des types de relations activés
 * @returns Tableau filtré de liens
 */
export const filterGraphLinks = (
  links: GraphLink[],
  enabledTypes: Set<string>
): GraphLink[] => {
  return links.filter((link) => isLinkVisible(link, enabledTypes));
};

/**
 * Filtrer un tableau de LemmaEdges par types de relations activés
 * Utilisé dans GraphExploration
 *
 * @param edges - Tableau d'arêtes lemma à filtrer
 * @param enabledTypes - Set des types de relations activés
 * @returns Tableau filtré d'arêtes
 */
export const filterLemmaEdges = (
  edges: LemmaEdge[],
  enabledTypes: Set<string>
): LemmaEdge[] => {
  return edges.filter((edge) => {
    // Afficher l'arête si AU MOINS UN de ses types de relation est activé
    return edge.relationTypes.some((rt) => {
      const normalized = normalizeRelationType(rt);
      return enabledTypes.has(normalized);
    });
  });
};
