// src/types/synset.ts
/**
 * Types unifiés pour le système synset-centric
 * Backend et frontend utilisent les mêmes définitions
 */

/**
 * Position globale dans l'atlas ForceAtlas2
 */
export interface GlobalPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Noeud synset avec toutes ses données
 */
export interface SynsetNode {
  /** ID unique du synset (ex: "00001740-n") */
  id: string;

  /** Partie du discours (n, v, a, r) */
  pos: string;

  /** Tous les lemmas appartenant à ce synset */
  lemmas: string[];

  /** Définition/glose du synset */
  gloss: string;

  /** Position globale dans l'atlas ForceAtlas2 */
  x_global: number;
  y_global: number;
  z_global: number;

  /** Métadonnées optionnelles */
  frequency?: number;
  domain?: string;
}

/**
 * Relation entre deux synsets
 */
export interface SynsetRelation {
  /** Synset source */
  source: string;

  /** Synset cible */
  target: string;

  /** Type de relation */
  type: SynsetRelationType;
  isTreeEdge?: boolean;
}

/**
 * Types de relations sémantiques
 */
export type SynsetRelationType =
  | 'hypernym'      // Est un type de
  | 'hyponym'       // A pour type
  | 'meronym'       // Partie de
  | 'holonym'       // Contient
  | 'antonym'       // Opposé à
  | 'similar'       // Similaire à
  | 'derivation'    // Dérivé de
  | 'causes'        // Cause
  | 'entails'       // Implique
  | 'also';         // Voir aussi

/**
 * Réponse API pour l'expansion d'un synset
 */
export interface SynsetExpandResponse {
  /** Synset central (celui qui a été cliqué) */
  centerNode: SynsetNode;

  /** Synsets voisins découverts */
  neighbors: SynsetNode[];

  /** Relations entre le centre et ses voisins */
  relations: SynsetRelation[];
}

/**
 * Synset local pour l'affichage frontend (avec positions locales)
 */
export interface LocalSynsetNode extends SynsetNode {
  /** Position locale dans le sous-graphe */
  x?: number;
  y?: number;
  z?: number;

  /** État d'affichage */
  isCenter?: boolean;
  isNew?: boolean;
  isHighlighted?: boolean;
}

/**
 * Graphe local pour l'exploration frontend
 */
export interface LocalSynsetGraph {
  nodes: LocalSynsetNode[];
  relations: SynsetRelation[];
}

/**
 * Configuration pour le calcul de positions locales
 */
export interface LocalPositionConfig {
  /** Rayon de la sphère locale */
  localRadius: number;

  /** Distance minimale entre noeuds */
  minDistance: number;

  /** Facteur de centrage pour le noeud principal */
  centerWeight: number;
}

/**
 * Données de base chargées depuis les fichiers WordNet
 */
export interface WordNetRawData {
  /** Données des synsets depuis synsets.tab */
  synsets: Map<string, {
    id: string;
    pos: string;
    gloss_en: string;
    gloss_fr: string;
  }>;

  /** Relations depuis relations.tab */
  relations: Map<string, Array<{
    target: string;
    type: SynsetRelationType;
  }>>;

  /** Index inverse des relations (target -> sources) */
  inverseRelations: Map<string, Array<{
    source: string;
    type: SynsetRelationType;
  }>>;

  /** Lemmas par synset depuis senses.tab */
  lemmasBySynset: Map<string, string[]>;

  /** Index inverse: lemma -> synsets */
  synsetsByLemma: Map<string, string[]>;

  /** Atlas global des positions */
  globalPositions: Map<string, GlobalPosition>;
}

/**
 * Paramètres de recherche de synset
 */
export interface SynsetSearchParams {
  /** Lemma à rechercher */
  lemma?: string;

  /** ID direct du synset */
  synsetId?: string;

  /** Filtrer par POS */
  pos?: string;

  /** Nombre maximum de résultats */
  limit?: number;
}