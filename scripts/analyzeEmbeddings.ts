// scripts/analyzeEmbeddings.ts
/**
 * Script d'analyse des embeddings générés
 * Vérifie que les mots sémantiquement proches sont bien positionnés près les uns des autres
 */

import { promises as fs } from 'fs';

interface Position {
  x: number;
  y: number;
  z: number;
}

// Calcule la distance euclidienne entre deux positions 3D
function distance(pos1: Position, pos2: Position): number {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Trouve les K voisins les plus proches d'un mot
function findNearest(
  targetWord: string,
  positions: Record<string, Position>,
  k: number = 10
): Array<{ word: string; distance: number }> {
  const targetPos = positions[targetWord];
  if (!targetPos) {
    throw new Error(`Mot "${targetWord}" non trouvé`);
  }

  const distances = Object.entries(positions)
    .filter(([word]) => word !== targetWord)
    .map(([word, pos]) => ({
      word,
      distance: distance(targetPos, pos)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);

  return distances;
}

async function main() {
  console.log('📊 === Analyse des Embeddings 3D ===\n');

  // Charger les positions
  const data = await fs.readFile('data/precomputed-positions-embeddings.json', 'utf-8');
  const positions: Record<string, Position> = JSON.parse(data);

  console.log(`✅ ${Object.keys(positions).length} positions chargées\n`);

  // Mots à analyser (paires sémantiquement liées)
  const testWords = [
    'chat',
    'chien',
    'maison',
    'ville',
    'amour',
    'travail',
    'faire',
    'voyager'
  ];

  console.log('🔍 Voisins les plus proches (distance euclidienne 3D):\n');

  for (const word of testWords) {
    if (!positions[word]) {
      console.log(`⚠️  "${word}" non trouvé`);
      continue;
    }

    const neighbors = findNearest(word, positions, 8);
    console.log(`📍 "${word}":`);
    console.log(`   Position: (${positions[word].x.toFixed(1)}, ${positions[word].y.toFixed(1)}, ${positions[word].z.toFixed(1)})`);
    console.log(`   Voisins:`);
    neighbors.forEach((n, i) => {
      console.log(`      ${i + 1}. ${n.word.padEnd(25)} (dist: ${n.distance.toFixed(2)})`);
    });
    console.log('');
  }

  // Statistiques globales
  console.log('📊 Statistiques globales:\n');

  const allPositions = Object.values(positions);

  // Calcul du centre de gravité
  const center = {
    x: allPositions.reduce((sum, p) => sum + p.x, 0) / allPositions.length,
    y: allPositions.reduce((sum, p) => sum + p.y, 0) / allPositions.length,
    z: allPositions.reduce((sum, p) => sum + p.z, 0) / allPositions.length
  };

  // Calcul de l'écart-type
  const variance = {
    x: allPositions.reduce((sum, p) => sum + Math.pow(p.x - center.x, 2), 0) / allPositions.length,
    y: allPositions.reduce((sum, p) => sum + Math.pow(p.y - center.y, 2), 0) / allPositions.length,
    z: allPositions.reduce((sum, p) => sum + Math.pow(p.z - center.z, 2), 0) / allPositions.length
  };

  const stdDev = {
    x: Math.sqrt(variance.x),
    y: Math.sqrt(variance.y),
    z: Math.sqrt(variance.z)
  };

  console.log(`   Centre de gravité: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
  console.log(`   Écart-type: (${stdDev.x.toFixed(2)}, ${stdDev.y.toFixed(2)}, ${stdDev.z.toFixed(2)})`);

  // Bornes
  const bounds = {
    x: { min: Math.min(...allPositions.map(p => p.x)), max: Math.max(...allPositions.map(p => p.x)) },
    y: { min: Math.min(...allPositions.map(p => p.y)), max: Math.max(...allPositions.map(p => p.y)) },
    z: { min: Math.min(...allPositions.map(p => p.z)), max: Math.max(...allPositions.map(p => p.z)) }
  };

  console.log(`   Bornes X: [${bounds.x.min.toFixed(2)}, ${bounds.x.max.toFixed(2)}]`);
  console.log(`   Bornes Y: [${bounds.y.min.toFixed(2)}, ${bounds.y.max.toFixed(2)}]`);
  console.log(`   Bornes Z: [${bounds.z.min.toFixed(2)}, ${bounds.z.max.toFixed(2)}]`);
}

main().catch(console.error);
