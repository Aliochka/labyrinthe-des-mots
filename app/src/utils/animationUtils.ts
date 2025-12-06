// src/utils/animationUtils.ts
/**
 * Utilitaires d'animation pour les synsets
 */

interface Position {
  x: number;
  y: number;
  z: number;
}

interface AnimationOptions {
  onUpdate?: (positions: Record<string, Position>) => void;
  onComplete?: () => void;
  easing?: (t: number) => number;
}

class AnimationManager {
  private animations = new Map<string, number>();

  /**
   * Easing ease-in-out-cubic
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Anime des positions entre deux états
   */
  async animatePositions(
    animationId: string,
    startPositions: Record<string, Position>,
    targetPositions: Record<string, Position>,
    duration: number = 600,
    options: AnimationOptions = {}
  ): Promise<void> {
    const { onUpdate, onComplete, easing = this.easeInOutCubic } = options;

    // Arrêter l'animation précédente si elle existe
    this.stopAnimation(animationId);

    return new Promise((resolve) => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easing(progress);

        // Calculer les positions interpolées
        const currentPositions: Record<string, Position> = {};

        for (const nodeId in targetPositions) {
          const start = startPositions[nodeId] || { x: 0, y: 0, z: 0 };
          const target = targetPositions[nodeId];

          currentPositions[nodeId] = {
            x: start.x + (target.x - start.x) * easedProgress,
            y: start.y + (target.y - start.y) * easedProgress,
            z: start.z + (target.z - start.z) * easedProgress
          };
        }

        // Notifier la mise à jour
        onUpdate?.(currentPositions);

        if (progress < 1) {
          // Continuer l'animation
          const frameId = requestAnimationFrame(animate);
          this.animations.set(animationId, frameId);
        } else {
          // Animation terminée
          this.animations.delete(animationId);
          onComplete?.();
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Arrête une animation spécifique
   */
  stopAnimation(animationId: string): void {
    const frameId = this.animations.get(animationId);
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      this.animations.delete(animationId);
    }
  }

  /**
   * Arrête toutes les animations
   */
  stopAllAnimations(): void {
    this.animations.forEach((frameId) => {
      cancelAnimationFrame(frameId);
    });
    this.animations.clear();
  }
}

export const globalAnimationManager = new AnimationManager();
export { type Position, type AnimationOptions };