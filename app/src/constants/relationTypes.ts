// src/constants/relationTypes.ts
/**
 * Configuration des types de relations sémantiques
 * pour le filtrage dans Map3D et GraphExploration
 */

export interface RelationTypeConfig {
  id: string;
  label: string;
  color: string;
  description: string;
  enabledByDefault: boolean;
}

/**
 * Top 6 types de relations par fréquence
 * Basé sur les statistiques WordNet/OMW-FR
 */
export const RELATION_TYPES: RelationTypeConfig[] = [
  {
    id: 'HYPERNYM',
    label: 'Hyperonyme',
    color: '#4ecdc4',
    description: 'Généralisation (ex: animal → mammifère)',
    enabledByDefault: true,
  },
  {
    id: 'HYPONYM',
    label: 'Hyponyme',
    color: '#45b7d1',
    description: 'Spécialisation (ex: chien → animal)',
    enabledByDefault: true,
  },
  {
    id: 'ANTONYM',
    label: 'Antonyme',
    color: '#ff6b6b',
    description: 'Opposé (ex: chaud ↔ froid)',
    enabledByDefault: true,
  },
  {
    id: 'DERIVATION',
    label: 'Dérivation',
    color: '#96ceb4',
    description: 'Forme dérivée (ex: courir → coureur)',
    enabledByDefault: true,
  },
  {
    id: 'SIMILAR_TO',
    label: 'Similaire',
    color: '#ffeaa7',
    description: 'Similitude sémantique',
    enabledByDefault: false,
  },
  {
    id: 'MERONYM',
    label: 'Méronyme',
    color: '#dfe6e9',
    description: 'Partie de (ex: roue → voiture)',
    enabledByDefault: false,
  },
];

/**
 * Obtenir les types de relations activés par défaut
 */
export const getDefaultEnabledRelations = (): Set<string> => {
  return new Set(
    RELATION_TYPES.filter((r) => r.enabledByDefault).map((r) => r.id)
  );
};

/**
 * Normaliser un type de relation pour gérer les variations
 * @param relType - Type de relation brut
 * @returns Type normalisé
 */
export const normalizeRelationType = (relType: string): string => {
  const normalized = relType.toUpperCase().trim();

  // Regrouper les variations de MERONYM/HOLONYM
  // (MEMBER_MERONYM, PART_HOLONYM, etc. → MERONYM)
  if (normalized.includes('MERONYM') || normalized.includes('HOLONYM')) {
    return 'MERONYM';
  }

  return normalized;
};
