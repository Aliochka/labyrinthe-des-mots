// src/utils/synsetPositions.ts
/**
 * Calcul des positions locales pour les synsets
 * Basé sur les positions globales de l'atlas ForceAtlas2
 */

import type {
  LocalSynsetNode,
  GlobalPosition,
  LocalPositionConfig
} from '../types/synset';

/**
 * Configuration par défaut pour les positions locales
 */
const DEFAULT_CONFIG: LocalPositionConfig = {
  localRadius: 200,
  minDistance: 50,
  centerWeight: 1.5
};

/**
 * Calcule les positions locales pour un ensemble de synsets
 * Préserve les relations spatiales de l'atlas global
 */
export function computeLocalSynsetPositions(
  synsets: LocalSynsetNode[],
  config: Partial<LocalPositionConfig> = {}
): Record<string, GlobalPosition> {
  const conf = { ...DEFAULT_CONFIG, ...config };

  if (synsets.length === 0) return {};

  console.log(`Calcul positions locales pour ${synsets.length} synsets`);

  // 1. Extraire les positions globales
  const validSynsets = synsets.filter(synset =>
    typeof synset.x_global === 'number' &&
    typeof synset.y_global === 'number' &&
    typeof synset.z_global === 'number'
  );

  if (validSynsets.length === 0) {
    console.warn('Aucune position globale valide trouvee');
    return generateFallbackSynsetPositions(synsets, conf);
  }

  const globalCoords = validSynsets.map(synset => ({
    synset,
    pos: {
      x: synset.x_global,
      y: synset.y_global,
      z: synset.z_global
    }
  }));

  // 2. Calculer le centre de masse global
  const centerOfMass = calculateCenterOfMass(globalCoords.map(item => item.pos));

  // 3. Trouver le synset central
  const centerSynset = synsets.find(s => s.isCenter) || synsets[0];

  // 4. Calculer l'échelle locale
  const distances = globalCoords.map(item =>
    distance3D(item.pos, centerOfMass)
  );
  const maxDistance = Math.max(...distances, 1);
  const scale = conf.localRadius / (maxDistance * 1.2);

  // 5. Transformer vers l'espace local
  const localPositions: Record<string, GlobalPosition> = {};

  for (const { synset, pos } of globalCoords) {
    // Centrer autour du centre de masse
    const centered = {
      x: pos.x - centerOfMass.x,
      y: pos.y - centerOfMass.y,
      z: pos.z - centerOfMass.z
    };

    // Appliquer l'échelle
    let scaled = {
      x: centered.x * scale,
      y: centered.y * scale,
      z: centered.z * scale
    };

    // Rapprocher le synset central vers (0,0,0)
    if (synset.isCenter) {
      scaled.x *= 0.3;
      scaled.y *= 0.3;
      scaled.z *= 0.3;
    }

    localPositions[synset.id] = scaled;
  }

  // 6. Traiter les synsets sans position globale
  for (const synset of synsets) {
    if (!localPositions[synset.id]) {
      localPositions[synset.id] = generateRandomSynsetPosition(conf.localRadius * 0.8);
    }
  }

  // 7. Ajuster pour éviter les collisions
  return adjustForSynsetCollisions(localPositions, conf.minDistance);
}

/**
 * Génère des positions de départ pour l'animation des nouveaux synsets
 */
export function createStartPositionsForNewSynsets(
  existingPositions: Record<string, GlobalPosition>,
  newSynsetIds: string[],
  centerSynsetId?: string
): Record<string, GlobalPosition> {
  const startPositions: Record<string, GlobalPosition> = { ...existingPositions };

  const basePosition = centerSynsetId && existingPositions[centerSynsetId]
    ? existingPositions[centerSynsetId]
    : { x: 0, y: 0, z: 0 };

  // Placer les nouveaux synsets près du centre avec un jitter
  newSynsetIds.forEach(synsetId => {
    startPositions[synsetId] = {
      x: basePosition.x + (Math.random() - 0.5) * 40,
      y: basePosition.y + (Math.random() - 0.5) * 40,
      z: basePosition.z + (Math.random() - 0.5) * 40
    };
  });

  return startPositions;
}

/**
 * Calcule le centre de masse de positions 3D
 */
function calculateCenterOfMass(positions: GlobalPosition[]): GlobalPosition {
  const count = positions.length;
  if (count === 0) return { x: 0, y: 0, z: 0 };

  return positions.reduce(
    (acc, pos) => ({
      x: acc.x + pos.x / count,
      y: acc.y + pos.y / count,
      z: acc.z + pos.z / count
    }),
    { x: 0, y: 0, z: 0 }
  );
}

/**
 * Distance euclidienne 3D
 */
function distance3D(a: GlobalPosition, b: GlobalPosition): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

/**
 * Génère des positions de secours pour synsets sans données globales
 */
function generateFallbackSynsetPositions(
  synsets: LocalSynsetNode[],
  config: LocalPositionConfig
): Record<string, GlobalPosition> {
  const positions: Record<string, GlobalPosition> = {};

  synsets.forEach((synset, index) => {
    if (synset.isCenter) {
      positions[synset.id] = { x: 0, y: 0, z: 0 };
    } else {
      const angle = (index * 2 * Math.PI) / (synsets.length - 1);
      const radius = config.localRadius * 0.7;
      positions[synset.id] = {
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 30,
        y: (Math.random() - 0.5) * radius * 0.5,
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * 30
      };
    }
  });

  return positions;
}

/**
 * Génère une position aléatoire dans une sphère
 */
function generateRandomSynsetPosition(radius: number): GlobalPosition {
  const theta = Math.random() * 2 * Math.PI;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = Math.random() * radius;

  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi)
  };
}

/**
 * Ajuste les positions pour éviter les collisions entre synsets
 */
function adjustForSynsetCollisions(
  positions: Record<string, GlobalPosition>,
  minDistance: number
): Record<string, GlobalPosition> {
  const synsetIds = Object.keys(positions);
  const adjusted = { ...positions };

  for (let i = 0; i < synsetIds.length; i++) {
    for (let j = i + 1; j < synsetIds.length; j++) {
      const id1 = synsetIds[i];
      const id2 = synsetIds[j];
      const pos1 = adjusted[id1];
      const pos2 = adjusted[id2];

      const dist = distance3D(pos1, pos2);
      if (dist < minDistance && dist > 0) {
        const pushFactor = (minDistance - dist) / 2;
        const direction = {
          x: (pos2.x - pos1.x) / dist,
          y: (pos2.y - pos1.y) / dist,
          z: (pos2.z - pos1.z) / dist
        };

        adjusted[id1] = {
          x: pos1.x - direction.x * pushFactor,
          y: pos1.y - direction.y * pushFactor,
          z: pos1.z - direction.z * pushFactor
        };

        adjusted[id2] = {
          x: pos2.x + direction.x * pushFactor,
          y: pos2.y + direction.y * pushFactor,
          z: pos2.z + direction.z * pushFactor
        };
      }
    }
  }

  return adjusted;
}

/**
 * Calcule une taille de noeud basée sur le nombre de lemmas
 */
export function calculateSynsetNodeSize(synset: LocalSynsetNode): number {
  const baseSizeValue = synset.isCenter ? 8 : 5;
  const lemmaBonus = Math.min(synset.lemmas.length * 0.5, 3); // Max +3
  return baseSizeValue + lemmaBonus;
}

/**
 * Génère un label d'affichage pour un synset
 */
export function generateSynsetLabel(synset: LocalSynsetNode, maxLength: number = 25): string {
  if (synset.lemmas.length === 0) return synset.id;

  const primaryLemma = synset.lemmas[0];

  if (synset.lemmas.length === 1) {
    return primaryLemma;
  }

  const label = synset.lemmas.slice(0, 3).join(', ');

  if (label.length <= maxLength) {
    return label + (synset.lemmas.length > 3 ? '...' : '');
  }

  return primaryLemma + ` (+${synset.lemmas.length - 1})`;
}