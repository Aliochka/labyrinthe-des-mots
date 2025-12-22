// src/utils/frustumCulling.ts
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';

/**
 * Filtre les nœuds visibles dans le frustum de la caméra.
 * Utilisé pour le culling des stars dans Map3D afin de réduire le nombre d'instances rendues.
 *
 * @param nodes - Liste des nœuds à filtrer
 * @param camera - Caméra Three.js pour le calcul du frustum
 * @returns Liste des nœuds visibles dans le frustum
 */
export function frustumCullNodes(
  nodes: GraphNode[],
  camera: THREE.Camera
): GraphNode[] {
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();

  // Calculer la matrice de projection combinée (projection × view)
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);

  // Filtrer les nœuds dont la position est dans le frustum
  return nodes.filter(node => {
    // Skip nœuds sans position 3D
    if (node.x == null || node.y == null || node.z == null) return false;

    const pos = new THREE.Vector3(node.x, node.y, node.z);
    return frustum.containsPoint(pos);
  });
}
