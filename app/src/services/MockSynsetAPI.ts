// src/services/MockSynsetAPI.ts
/**
 * API mockée pour le système synset-centric
 * Simule les endpoints backend pour le développement
 */

import { synsetDataService } from './SynsetDataService';
import type { SynsetExpandResponse, SynsetNode } from '../types/synset';

/**
 * Service API mocké pour synsets
 */
export class MockSynsetAPI {
  /**
   * Initialise le service (charge les données)
   */
  static async initialize(): Promise<void> {
    await synsetDataService.initialize();
    console.log('🎭 MockSynsetAPI initialisé');
  }

  /**
   * Expansion d'un synset - GET /api/synsets/expand/:synsetId
   */
  static async expandSynset(synsetId: string): Promise<SynsetExpandResponse> {
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300)); // Délai simulé

    const result = synsetDataService.expandSynset(synsetId);

    if (!result) {
      throw new Error(`Synset ${synsetId} non trouvé`);
    }

    return result;
  }

  /**
   * Recherche de synsets par lemma - GET /api/synsets/search?lemma=...
   */
  static async searchSynsets(lemma: string, pos?: string): Promise<SynsetNode[]> {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const results = synsetDataService.searchSynsets({
      lemma,
      pos,
      limit: 10
    });

    return results;
  }

  /**
   * Récupération d'un synset par ID - GET /api/synsets/:synsetId
   */
  static async getSynset(synsetId: string): Promise<SynsetNode | null> {
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    return synsetDataService.getSynsetById(synsetId);
  }
}

/**
 * Setup de l'intercepteur fetch pour simuler l'API
 */
export function setupMockSynsetAPI(): void {
  // Initialiser le service
  MockSynsetAPI.initialize();

  // Intercepter les appels fetch
  const originalFetch = window.fetch;

  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();

    // Intercepter les appels vers l'API synsets
    if (url.includes('/api/synsets/')) {
      try {
        let data: any;

        // Expansion d'un synset
        if (url.includes('/expand/')) {
          const synsetId = url.split('/expand/')[1].split('?')[0];
          data = await MockSynsetAPI.expandSynset(synsetId);
        }
        // Recherche de synsets
        else if (url.includes('/search')) {
          const urlObj = new URL(url, window.location.origin);
          const lemma = urlObj.searchParams.get('lemma');
          const pos = urlObj.searchParams.get('pos') || undefined;

          if (lemma) {
            data = await MockSynsetAPI.searchSynsets(lemma, pos);
          } else {
            throw new Error('Paramètre lemma requis');
          }
        }
        // Récupération d'un synset par ID
        else {
          const synsetId = url.split('/api/synsets/')[1].split('?')[0];
          data = await MockSynsetAPI.getSynset(synsetId);

          if (!data) {
            return new Response(JSON.stringify({ error: 'Synset non trouvé' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur API';
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Appel normal pour les autres URLs
    return originalFetch.call(this, input, init);
  };

  console.log('🎭 API synsets mockée activée');
  console.log('   GET /api/synsets/expand/:synsetId');
  console.log('   GET /api/synsets/search?lemma=...&pos=...');
  console.log('   GET /api/synsets/:synsetId');
}

/**
 * Fonction helper pour tester l'API
 */
export async function testMockAPI(): Promise<void> {
  console.log('[TEST] Test de l\'API mockée...');

  try {
    // Test de recherche
    const searchResults = await fetch('/api/synsets/search?lemma=entité');
    const synsets = await searchResults.json();
    console.log('Résultats recherche "entité":', synsets);

    if (synsets.length > 0) {
      // Test d'expansion
      const expandResult = await fetch(`/api/synsets/expand/${synsets[0].id}`);
      const expansion = await expandResult.json();
      console.log(`Expansion de ${synsets[0].id}:`, expansion);
    }

    console.log('[OK] Tests API réussis');
  } catch (error) {
    console.error('[ERROR] Erreur test API:', error);
  }
}