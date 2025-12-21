// src/services/GalaxyDataService.ts

import type { GalaxyNode, UniverseGraphData } from '../types/graph';

/**
 * Service dédié aux galaxies
 * Séparé de LemmaDataService pour éviter le monolithe
 *
 * Responsabilités:
 * - Gérer les membres des galaxies (mapping galaxy -> stars)
 * - Recherche et filtrage des galaxies
 * - Vérification de visibilité
 */
export class GalaxyDataService {
  private galaxyMembersMap: Map<string, string[]> = new Map();
  private galaxies: GalaxyNode[] = [];

  /**
   * Initialiser avec les données du hook useUniverseGraph
   */
  initialize(graphData: UniverseGraphData) {
    this.galaxyMembersMap = graphData.galaxyMembersMap;
    this.galaxies = graphData.galaxies.nodes.map(node => {
      // Convert GraphNode back to GalaxyNode (keep only galaxy-specific fields)
      return {
        id: node.id,
        name: node.name,
        slug: (node as any).slug || node.id,
        confidence: (node as any).confidence || 1.0,
        size: node.size || 0,
        x: node.x || 0,
        y: node.y || 0,
        z: node.z || 0,
      };
    });
  }

  /**
   * Obtenir les IDs des stars d'une galaxie
   */
  getGalaxyMembers(galaxyId: string): string[] {
    return this.galaxyMembersMap.get(galaxyId) ?? [];
  }

  /**
   * Vérifie si une galaxie contient au moins une étoile visible
   * Utilisé en mode Play pour filtrer les galaxies
   */
  hasVisibleStars(galaxyId: string, visibleStarIds: Set<string>): boolean {
    const members = this.galaxyMembersMap.get(galaxyId) ?? [];
    return members.some(starId => visibleStarIds.has(starId));
  }

  /**
   * Obtenir toutes les galaxies
   */
  getAllGalaxies(): GalaxyNode[] {
    return this.galaxies;
  }

  /**
   * Rechercher une galaxie par ID
   */
  getGalaxyById(galaxyId: string): GalaxyNode | undefined {
    return this.galaxies.find(g => g.id === galaxyId);
  }

  /**
   * Rechercher des galaxies par nom (fuzzy search)
   * Utile pour l'autocomplete ou la recherche utilisateur
   */
  searchGalaxies(query: string): GalaxyNode[] {
    const lowerQuery = query.toLowerCase();
    return this.galaxies.filter(g =>
      g.name.toLowerCase().includes(lowerQuery) ||
      g.slug.includes(lowerQuery)
    );
  }

  /**
   * Obtenir les statistiques globales
   */
  getStats() {
    return {
      totalGalaxies: this.galaxies.length,
      totalStars: Array.from(this.galaxyMembersMap.values())
        .reduce((sum, members) => sum + members.length, 0),
      avgStarsPerGalaxy: this.galaxies.length > 0
        ? Array.from(this.galaxyMembersMap.values())
            .reduce((sum, members) => sum + members.length, 0) / this.galaxies.length
        : 0,
    };
  }
}

// Instance singleton
export const galaxyDataService = new GalaxyDataService();
