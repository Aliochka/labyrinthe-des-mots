// src/hooks/useLODSystem.ts
import { useMemo } from 'react';

/**
 * Configuration pour le système LOD (Level of Detail)
 */
export interface LODConfig {
  /** Rayon moyen des nœuds dans la scène (calculé depuis bounding box) */
  radiusMean: number;
  /** Distance actuelle de la caméra au centre de la scène */
  cameraDistance: number;
}

/**
 * Type de rendu basé sur la distance caméra
 */
export type RenderMode = 'galaxies' | 'stars';

/**
 * Résultat du hook useLODSystem
 */
export interface LODResult {
  /** Mode de rendu actuel basé sur la distance caméra */
  renderMode: RenderMode;
  /** Indique si les liens des stars doivent être affichés */
  shouldShowStarLinks: boolean;
  /** Seuils calculés pour les transitions LOD */
  thresholds: {
    GALAXY_TO_STARS: number;
    SHOW_STAR_LINKS: number;
  };
}

/**
 * Hook pour gérer le système LOD (Level of Detail) dans Map3D.
 *
 * Calcule dynamiquement le mode de rendu basé sur la distance caméra :
 * - Distance > Seuil (radiusMean * 2.5) : Afficher galaxies uniquement
 * - Distance ≤ Seuil : Afficher stars + galaxies
 * - Distance < Seuil liens (radiusMean * 1.2) : Afficher liens stars
 *
 * @param config - Configuration LOD (radiusMean, cameraDistance)
 * @returns Objet contenant renderMode, shouldShowStarLinks, et thresholds
 */
export function useLODSystem(config: LODConfig): LODResult {
  // Calcul des seuils basés sur le rayon moyen
  const thresholds = useMemo(() => ({
    GALAXY_TO_STARS: config.radiusMean * 2.5,
    SHOW_STAR_LINKS: config.radiusMean * 1.2,
  }), [config.radiusMean]);

  // Détermination du mode de rendu
  const renderMode = useMemo<RenderMode>(() => {
    return config.cameraDistance > thresholds.GALAXY_TO_STARS
      ? 'galaxies'
      : 'stars';
  }, [config.cameraDistance, thresholds.GALAXY_TO_STARS]);

  // Détermine si on affiche les liens stars (seulement si proche)
  const shouldShowStarLinks = config.cameraDistance < thresholds.SHOW_STAR_LINKS;

  console.log('[useLODSystem]', {
    radiusMean: config.radiusMean.toFixed(2),
    cameraDistance: config.cameraDistance.toFixed(2),
    renderMode,
    shouldShowStarLinks,
    thresholds: {
      GALAXY_TO_STARS: thresholds.GALAXY_TO_STARS.toFixed(2),
      SHOW_STAR_LINKS: thresholds.SHOW_STAR_LINKS.toFixed(2),
    }
  });

  return {
    renderMode,
    shouldShowStarLinks,
    thresholds
  };
}
