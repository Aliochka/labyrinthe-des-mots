// src/wordnet/loadData.ts
/**
 * Module de chargement des données WordNet françaises prétraitées.
 *
 * Charge les fichiers JSON depuis /public et fournit les types TypeScript
 * pour manipuler les synsets, relations et index lexical.
 */

export type PosTag = "N" | "V" | "ADJ";

export type RelationType = "HYPERNYM" | "HYPONYM" | "ANTONYM";

export interface SynsetData {
  originalId: string;  // Format "00001740-n"
  pos: PosTag;         // "N" | "V" | "ADJ"
  lemmas: string[];    // Lemmes français non normalisés
  gloss?: string;      // Définition FR si dispo, sinon EN
}

export type SynsetsMap = Record<string, SynsetData>; // clé = numericId as string

export type RelationsMap = Record<
  string,              // synsetId source (string)
  [RelationType, number][]  // [relation, targetId]
>;

export type LexicalIndex = Record<
  string,              // forme normalisée du mot
  Partial<Record<PosTag, number[]>>  // { "N": [1, 5], "V": [12] }
>;

export interface WordnetData {
  synsets: SynsetsMap;
  relations: RelationsMap;
  lexicalIndex: LexicalIndex;
}

/**
 * Charge les données WordNet françaises depuis les fichiers JSON publics.
 *
 * @returns Promise contenant synsets, relations et index lexical
 * @throws Error si un des fichiers ne peut pas être chargé ou parsé
 */
export async function loadWordnetData(): Promise<WordnetData> {
  try {
    // Charger les trois fichiers en parallèle
    const [synsetsResponse, relationsResponse, lexicalResponse] = await Promise.all([
      fetch('/synsets.json'),
      fetch('/relations.json'),
      fetch('/lexicalIndex.json')
    ]);

    // Vérifier que tous les fetch ont réussi
    if (!synsetsResponse.ok) {
      throw new Error(`Impossible de charger synsets.json: ${synsetsResponse.status} ${synsetsResponse.statusText}`);
    }
    if (!relationsResponse.ok) {
      throw new Error(`Impossible de charger relations.json: ${relationsResponse.status} ${relationsResponse.statusText}`);
    }
    if (!lexicalResponse.ok) {
      throw new Error(`Impossible de charger lexicalIndex.json: ${lexicalResponse.status} ${lexicalResponse.statusText}`);
    }

    // Parser le JSON
    const [synsets, relations, lexicalIndex] = await Promise.all([
      synsetsResponse.json() as Promise<SynsetsMap>,
      relationsResponse.json() as Promise<RelationsMap>,
      lexicalResponse.json() as Promise<LexicalIndex>
    ]);

    // Validation basique des données
    if (!synsets || typeof synsets !== 'object') {
      throw new Error('Format invalide pour synsets.json');
    }
    if (!relations || typeof relations !== 'object') {
      throw new Error('Format invalide pour relations.json');
    }
    if (!lexicalIndex || typeof lexicalIndex !== 'object') {
      throw new Error('Format invalide pour lexicalIndex.json');
    }

    return {
      synsets,
      relations,
      lexicalIndex
    };

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Erreur lors du chargement des données WordNet: ${error.message}`);
    } else {
      throw new Error('Erreur inconnue lors du chargement des données WordNet');
    }
  }
}