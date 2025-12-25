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
 * Catégories de relations simplifiées
 * Basé sur lemma-graph+etym.json
 */
export const RELATION_TYPES: RelationTypeConfig[] = [
  {
    id: 'ETYMOLOGY',
    label: 'Étymologique',
    color: '#ff6b6b',
    description: 'Relations étymologiques entre mots',
    enabledByDefault: true,
  },
  {
    id: 'SEMANTIC',
    label: 'Sémantique',
    color: '#4ecdc4',
    description: 'Relations sémantiques (hyperonyme, antonyme, etc.)',
    enabledByDefault: true,
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
 * Normaliser un type de relation pour mapper vers les 2 catégories
 * @param relType - Type de relation brut
 * @returns Type normalisé (ETYMOLOGY ou SEMANTIC)
 */
export const normalizeRelationType = (relType: string): string => {
  const normalized = relType.toUpperCase().trim();

  // Relations étymologiques
  if (normalized === 'ETYMOLOGY') {
    return 'ETYMOLOGY';
  }

  // Toutes les autres relations sont sémantiques
  // (HYPERNYM, HYPONYM, ANTONYM, DERIVATION, SIMILAR_TO, MERONYM,
  //  ALSO_SEE, ATTRIBUTE, CAUSES, ENTAILMENT, PERTAINYM, etc.)
  return 'SEMANTIC';
};
