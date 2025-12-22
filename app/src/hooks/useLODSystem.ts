// src/hooks/useLODSystem.ts
import { useMemo, useRef } from "react";

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
  const thresholds = useMemo(() => ({
    GALAXY_TO_STARS: config.radiusMean * 2.5,
    SHOW_STAR_LINKS: config.radiusMean * 1.2,
  }), [config.radiusMean]);

  // ✅ Hystérésis mode (évite flapping galaxies/stars)
  const modeRef = useRef<RenderMode>("galaxies");
  const modeOn = thresholds.GALAXY_TO_STARS;
  const modeHyst = modeOn * 0.08; // 8%

  if (modeRef.current === "stars") {
    if (config.cameraDistance > modeOn + modeHyst) modeRef.current = "galaxies";
  } else {
    if (config.cameraDistance < modeOn - modeHyst) modeRef.current = "stars";
  }

  const renderMode = modeRef.current;

  // ✅ Hystérésis liens
  const linksRef = useRef(false);
  const linkOn = thresholds.SHOW_STAR_LINKS;
  const linkHyst = linkOn * 0.08;

  if (linksRef.current) {
    if (config.cameraDistance > linkOn + linkHyst) linksRef.current = false;
  } else {
    if (config.cameraDistance < linkOn - linkHyst) linksRef.current = true;
  }

  return { renderMode, shouldShowStarLinks: linksRef.current, thresholds };
}
