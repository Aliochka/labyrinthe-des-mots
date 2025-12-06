// src/services/SynsetDataService.ts
/**
 * Service de données synset-centric avec cache en mémoire
 * Charge et indexe toutes les données WordNet au démarrage
 */

import type {
  SynsetNode,
  SynsetRelation,
  SynsetExpandResponse,
  SynsetRelationType,
  WordNetRawData,
  SynsetSearchParams
} from '../types/synset';

/**
 * Service principal pour les données synsets
 */
export class SynsetDataService {
  private isInitialized = false;
  private data: WordNetRawData | null = null;

  /**
   * Initialise le service en chargeant toutes les données
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[LOAD] Initialisation SynsetDataService...');

    this.data = {
      synsets: new Map(),
      relations: new Map(),
      inverseRelations: new Map(),
      lemmasBySynset: new Map(),
      synsetsByLemma: new Map(),
      globalPositions: new Map()
    };

    // Essayer de charger l'atlas complet d'abord
    try {
      await this.loadGlobalAtlas();
      console.log('[INFO] Données chargées depuis l\'atlas complet');
    } catch (atlasError) {
      console.log('[WARNING] Fallback vers chargement séparé des fichiers');
      // Si l'atlas n'est pas disponible, charger les fichiers séparément
      await Promise.all([
        this.loadSynsets(),
        this.loadRelations(),
        this.loadSenses()
      ]);
    }

    this.buildIndices();
    this.isInitialized = true;

    console.log(`[OK] SynsetDataService initialisé:`, {
      synsets: this.data.synsets.size,
      relations: this.data.relations.size,
      lemmas: this.data.synsetsByLemma.size,
      positions: this.data.globalPositions.size
    });
  }

  /**
   * Charge les synsets depuis synsets.tab (ou JSON preprocessing)
   */
  private async loadSynsets(): Promise<void> {
    try {
      // Essayer d'abord le format JSON préprocessé
      const response = await fetch('/synsets.json');
      if (response.ok) {
        const synsets = await response.json();
        Object.entries(synsets).forEach(([id, data]: [string, any]) => {
          this.data!.synsets.set(id, {
            id,
            pos: data.pos || 'n',
            gloss_en: data.gloss_en || '',
            gloss_fr: data.gloss_fr || data.gloss_en || ''
          });
        });
        console.log(`[BOOK] ${this.data!.synsets.size} synsets chargés depuis JSON`);
        return;
      }
    } catch (error) {
      console.warn('[WARNING] Impossible de charger synsets.json, fallback vers données test');
    }

    // Données de fallback pour le développement
    this.loadMockSynsets();
  }

  /**
   * Charge les relations depuis relations.tab (ou JSON)
   */
  private async loadRelations(): Promise<void> {
    try {
      const response = await fetch('/relations.json');
      if (response.ok) {
        const relations = await response.json();
        Object.entries(relations).forEach(([sourceId, targets]: [string, any]) => {
          if (Array.isArray(targets)) {
            this.data!.relations.set(sourceId, targets.map((rel: any) => ({
              target: rel.target || rel[1],
              type: this.normalizeRelationType(rel.type || rel[0])
            })));
          }
        });
        console.log(`[LINK] Relations chargées pour ${this.data!.relations.size} synsets`);
        return;
      }
    } catch (error) {
      console.warn('[WARNING] Impossible de charger relations.json, fallback vers données test');
    }

    // Données de fallback
    this.loadMockRelations();
  }

  /**
   * Charge les lemmas par synset depuis senses.tab
   */
  private async loadSenses(): Promise<void> {
    try {
      // Pour l'instant, utiliser des données mockées
      // TODO: Implémenter le chargement depuis senses.tab
      this.loadMockSenses();
    } catch (error) {
      console.warn('[WARNING] Fallback vers données lemmas test');
      this.loadMockSenses();
    }
  }

  /**
   * Charge l'atlas global des positions
   */
  private async loadGlobalAtlas(): Promise<void> {
    try {
      const response = await fetch('/atlas-complete.json');
      if (response.ok) {
        const atlas = await response.json();
        if (atlas.nodes && Array.isArray(atlas.nodes)) {
          atlas.nodes.forEach((node: any) => {
            if (node.id && typeof node.x === 'number') {
              // Charger les positions globales
              this.data!.globalPositions.set(node.id, {
                x: node.x,
                y: node.y,
                z: node.z
              });

              // Charger les synsets depuis l'atlas
              this.data!.synsets.set(node.id, {
                id: node.id,
                pos: node.pos || 'n',
                gloss_en: node.gloss_en || '',
                gloss_fr: node.gloss_fr || node.gloss_en || ''
              });

              // Charger les lemmas français depuis l'atlas
              if (node.lemmas && Array.isArray(node.lemmas)) {
                this.data!.lemmasBySynset.set(node.id, node.lemmas);
              }
            }
          });
        }

        // Charger les relations depuis l'atlas
        // ⚠️ L'atlas utilise un graphe non orienté, donc on doit ajouter les edges dans les deux sens
        if (atlas.edges && Array.isArray(atlas.edges)) {
          atlas.edges.forEach((edge: any) => {
            if (edge.source && edge.target) {
              // Direction source → target
              if (!this.data!.relations.has(edge.source)) {
                this.data!.relations.set(edge.source, []);
              }
              this.data!.relations.get(edge.source)!.push({
                target: edge.target,
                type: this.normalizeRelationType(edge.relation_type || 'also')
              });

              // Direction inverse target → source (pour graphe non orienté)
              if (!this.data!.relations.has(edge.target)) {
                this.data!.relations.set(edge.target, []);
              }
              this.data!.relations.get(edge.target)!.push({
                target: edge.source,
                type: this.normalizeRelationType(edge.relation_type || 'also')
              });
            }
          });
        }

        // Créer l'index inverse des relations pour optimiser les requêtes
        this.buildInverseRelationIndex();

        console.log(`[GLOBE] Atlas chargé: ${this.data!.globalPositions.size} synsets, ${this.data!.relations.size} relations, ${this.data!.lemmasBySynset.size} groupes de lemmas`);
        return;
      }
    } catch (error) {
      console.warn('[WARNING] Impossible de charger atlas global, positions par défaut');
    }

    // Positions de fallback
    this.loadMockPositions();
  }

  /**
   * Construit les index de recherche
   */
  private buildIndices(): void {
    // Index lemma -> synsets
    this.data!.lemmasBySynset.forEach((lemmas, synsetId) => {
      lemmas.forEach(lemma => {
        const normalized = this.normalizeLemma(lemma);
        if (!this.data!.synsetsByLemma.has(normalized)) {
          this.data!.synsetsByLemma.set(normalized, []);
        }
        this.data!.synsetsByLemma.get(normalized)!.push(synsetId);
      });
    });

    console.log(`[SEARCH] Index construit: ${this.data!.synsetsByLemma.size} lemmas uniques`);
  }

  /**
   * Recherche des synsets par lemma
   */
  searchSynsets(params: SynsetSearchParams): SynsetNode[] {
    this.ensureInitialized();

    if (params.synsetId) {
      const synset = this.getSynsetById(params.synsetId);
      return synset ? [synset] : [];
    }

    if (params.lemma) {
      const normalized = this.normalizeLemma(params.lemma);
      const synsetIds = this.data!.synsetsByLemma.get(normalized) || [];

      let results = synsetIds
        .map(id => this.getSynsetById(id))
        .filter((node): node is SynsetNode => node !== null);

      if (params.pos) {
        results = results.filter(node => node.pos === params.pos);
      }

      if (params.limit) {
        results = results.slice(0, params.limit);
      }

      return results;
    }

    return [];
  }

  /**
   * Construit l'index inverse des relations pour optimiser les requêtes
   */
  private buildInverseRelationIndex(): void {
    console.log('[INDEX] Construction de l\'index inverse des relations...');

    for (const [sourceId, relations] of this.data!.relations.entries()) {
      for (const relation of relations) {
        const targetId = relation.target;

        if (!this.data!.inverseRelations.has(targetId)) {
          this.data!.inverseRelations.set(targetId, []);
        }

        this.data!.inverseRelations.get(targetId)!.push({
          source: sourceId,
          type: relation.type
        });
      }
    }

    console.log(`[INDEX] Index inverse créé: ${this.data!.inverseRelations.size} entrées`);
  }

  expandSynset(
    synsetId: string,
    maxNodes: number = 100,
    maxDepth: number = 4 // tu peux ajuster
  ): SynsetExpandResponse | null {
    this.ensureInitialized();

    const centerNode = this.getSynsetById(synsetId);
    if (!centerNode) return null;

    // --- 1. BFS sur le graphe non orienté ---

    // info BFS : parent + profondeur
    const bfsInfo = new Map<string, { parent?: string; depth: number }>();

    const visited = new Set<string>();
    const queue: string[] = [];

    visited.add(synsetId);
    bfsInfo.set(synsetId, { depth: 0 });
    queue.push(synsetId);

    const getEdges = (id: string) => {
      const out = this.data!.relations.get(id) || [];
      const inc = this.data!.inverseRelations.get(id) || [];
      // on normalise : source = id courant, target = voisin
      return [
        ...out.map(rel => ({ source: id, target: rel.target, type: rel.type })),
        ...inc.map(rel => ({ source: rel.source, target: id, type: rel.type }))
      ];
    };

    while (queue.length > 0 && visited.size < maxNodes) {
      const currentId = queue.shift()!;
      const info = bfsInfo.get(currentId)!;

      if (info.depth >= maxDepth) {
        continue;
      }

      const edges = getEdges(currentId);

      for (const edge of edges) {
        const nextId = edge.target;
        if (visited.has(nextId)) continue;

        visited.add(nextId);
        bfsInfo.set(nextId, { parent: currentId, depth: info.depth + 1 });
        queue.push(nextId);

        if (visited.size >= maxNodes) break;
      }
    }

    // --- 2. Construire la liste des nodes (voisins) ---

    const neighbors: SynsetNode[] = [];
    for (const id of visited) {
      if (id === synsetId) continue;
      const node = this.getSynsetById(id);
      if (node) neighbors.push(node);
    }

    // --- 3. Construire les relations + marquer les arêtes d'arbre ---

    const relations: SynsetRelation[] = [];
    const relationKeys = new Set<string>();

    // set des paires parent-enfant (arbre BFS)
    const treePairs = new Set<string>();
    for (const [nodeId, info] of bfsInfo.entries()) {
      if (!info.parent) continue;
      const p = info.parent;
      const key1 = `${p}-${nodeId}`;
      const key2 = `${nodeId}-${p}`;
      treePairs.add(key1);
      treePairs.add(key2);
    }

    for (const id of visited) {
      const edges = getEdges(id);

      for (const edge of edges) {
        // on ne garde que les relations dont la cible est aussi dans le BFS
        if (!visited.has(edge.target)) continue;

        const key = `${edge.source}-${edge.target}-${edge.type}`;
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);

        const treeKey = `${edge.source}-${edge.target}`;
        const isTreeEdge =
          treePairs.has(treeKey) ||
          treePairs.has(`${edge.target}-${edge.source}`);

        relations.push({
          ...edge,
          isTreeEdge // ⚠️ ajoute cette prop dans SynsetRelation si pas déjà
        } as SynsetRelation);
      }
    }

    console.log(
      `[EXPAND BFS] ${synsetId} → ${neighbors.length} synsets (objectif ${maxNodes}, profondeur max ${maxDepth})`
    );

    return {
      centerNode,
      neighbors,
      relations
    };
  }



  /**
   * Récupère un synset par son ID
   */
  getSynsetById(synsetId: string): SynsetNode | null {
    this.ensureInitialized();

    const synsetData = this.data!.synsets.get(synsetId);
    if (!synsetData) return null;

    const lemmas = this.data!.lemmasBySynset.get(synsetId) || [];
    const globalPos = this.data!.globalPositions.get(synsetId) || { x: 0, y: 0, z: 0 };

    // Calculer l'importance basée sur le nombre total de relations
    const outgoingCount = (this.data!.relations.get(synsetId) || []).length;
    const incomingCount = (this.data!.inverseRelations.get(synsetId) || []).length;
    const relationCount = outgoingCount + incomingCount;

    return {
      id: synsetId,
      pos: synsetData.pos,
      lemmas,
      gloss: synsetData.gloss_fr || synsetData.gloss_en,
      x_global: globalPos.x,
      y_global: globalPos.y,
      z_global: globalPos.z,
      relationCount: relationCount
    };
  }

  /**
   * Normalise un lemma pour la recherche
   */
  private normalizeLemma(lemma: string): string {
    return lemma
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
      .replace(/[''`]/g, '')           // Supprimer apostrophes
      .replace(/[-]/g, '')             // Supprimer tirets
      .trim();
  }

  /**
   * Normalise le type de relation
   */
  private normalizeRelationType(type: string): SynsetRelationType {
    const typeMap: Record<string, SynsetRelationType> = {
      'hypernym': 'hypernym',
      'hyponym': 'hyponym',
      'meronym': 'meronym',
      'holonym': 'holonym',
      'antonym': 'antonym',
      'similar': 'similar',
      'derivation': 'derivation',
      'causes': 'causes',
      'entails': 'entails'
    };

    return typeMap[type.toLowerCase()] || 'also';
  }

  /**
   * Vérifie que le service est initialisé
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.data) {
      throw new Error('SynsetDataService non initialisé. Appelez initialize() d\'abord.');
    }
  }

  /**
   * Données mockées pour le développement
   */
  private loadMockSynsets(): void {
    const mockData = [
      { id: '00001740-n', pos: 'n', gloss_fr: 'chose qui a une existence distincte' },
      { id: '00002098-n', pos: 'n', gloss_fr: 'mammifère carnivore domestique' },
      { id: '00002341-n', pos: 'n', gloss_fr: 'animal vertébré ovipare à plumes' },
      { id: '00002567-n', pos: 'n', gloss_fr: 'être vivant ayant une organisation cellulaire' },
      { id: '00002890-n', pos: 'n', gloss_fr: 'construction servant de logement' },
      { id: '00003100-n', pos: 'n', gloss_fr: 'mammifère domestique herbivore' },
      { id: '00003200-n', pos: 'n', gloss_fr: 'grand mammifère terrestre' },
      { id: '00003300-n', pos: 'n', gloss_fr: 'petit animal domestique' },
      { id: '00003400-n', pos: 'n', gloss_fr: 'objet manufacturé' },
      { id: '00003500-n', pos: 'n', gloss_fr: 'lieu de vie familial' }
    ];

    mockData.forEach(item => {
      this.data!.synsets.set(item.id, {
        id: item.id,
        pos: item.pos,
        gloss_en: item.gloss_fr,
        gloss_fr: item.gloss_fr
      });
    });
  }

  private loadMockRelations(): void {
    const mockRelations = [
      // Entité → ses sous-types
      { source: '00001740-n', target: '00002567-n', type: 'hyponym' },
      { source: '00001740-n', target: '00003400-n', type: 'hyponym' },

      // Être vivant → animaux
      { source: '00002567-n', target: '00002098-n', type: 'hyponym' },
      { source: '00002567-n', target: '00002341-n', type: 'hyponym' },
      { source: '00002567-n', target: '00003100-n', type: 'hyponym' },
      { source: '00002567-n', target: '00003200-n', type: 'hyponym' },
      { source: '00002567-n', target: '00003300-n', type: 'hyponym' },

      // Animaux → être vivant (relations inverses)
      { source: '00002098-n', target: '00002567-n', type: 'hypernym' },
      { source: '00002341-n', target: '00002567-n', type: 'hypernym' },
      { source: '00003100-n', target: '00002567-n', type: 'hypernym' },
      { source: '00003200-n', target: '00002567-n', type: 'hypernym' },
      { source: '00003300-n', target: '00002567-n', type: 'hypernym' },

      // Objet → maison
      { source: '00003400-n', target: '00002890-n', type: 'hyponym' },
      { source: '00003400-n', target: '00003500-n', type: 'hyponym' },

      // Maisons → objet
      { source: '00002890-n', target: '00003400-n', type: 'hypernym' },
      { source: '00003500-n', target: '00003400-n', type: 'hypernym' },

      // Relations similaires
      { source: '00002098-n', target: '00003300-n', type: 'similar' },
      { source: '00002890-n', target: '00003500-n', type: 'similar' },
      { source: '00003100-n', target: '00003200-n', type: 'similar' }
    ];

    mockRelations.forEach(rel => {
      if (!this.data!.relations.has(rel.source)) {
        this.data!.relations.set(rel.source, []);
      }
      this.data!.relations.get(rel.source)!.push({
        target: rel.target,
        type: rel.type as SynsetRelationType
      });
    });
  }

  private loadMockSenses(): void {
    const mockSenses = [
      { synsetId: '00001740-n', lemmas: ['entité', 'être', 'chose'] },
      { synsetId: '00002098-n', lemmas: ['chat', 'félin', 'minet'] },
      { synsetId: '00002341-n', lemmas: ['oiseau', 'volatile'] },
      { synsetId: '00002567-n', lemmas: ['être vivant', 'organisme'] },
      { synsetId: '00002890-n', lemmas: ['maison', 'habitation', 'demeure'] },
      { synsetId: '00003100-n', lemmas: ['cheval', 'équidé'] },
      { synsetId: '00003200-n', lemmas: ['éléphant', 'pachyderme'] },
      { synsetId: '00003300-n', lemmas: ['souris', 'rongeur'] },
      { synsetId: '00003400-n', lemmas: ['objet', 'chose', 'article'] },
      { synsetId: '00003500-n', lemmas: ['foyer', 'domicile', 'résidence'] }
    ];

    mockSenses.forEach(item => {
      this.data!.lemmasBySynset.set(item.synsetId, item.lemmas);
    });
  }

  private loadMockPositions(): void {
    const mockPositions = [
      { id: '00001740-n', x: 0, y: 0, z: 0 },
      { id: '00002098-n', x: 50, y: 20, z: -30 },
      { id: '00002341-n', x: -40, y: 30, z: 25 },
      { id: '00002567-n', x: -25, y: 40, z: 10 },
      { id: '00002890-n', x: -100, y: 0, z: 50 },
      { id: '00003100-n', x: 80, y: 15, z: -20 },
      { id: '00003200-n', x: 70, y: 45, z: 35 },
      { id: '00003300-n', x: 30, y: 35, z: -40 },
      { id: '00003400-n', x: -50, y: -20, z: 30 },
      { id: '00003500-n', x: -80, y: 10, z: 60 }
    ];

    mockPositions.forEach(pos => {
      this.data!.globalPositions.set(pos.id, {
        x: pos.x,
        y: pos.y,
        z: pos.z
      });
    });
  }
}

/**
 * Instance globale du service
 */
export const synsetDataService = new SynsetDataService();