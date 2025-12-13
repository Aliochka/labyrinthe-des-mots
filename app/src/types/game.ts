import { Vector3 } from 'three';
import type { LemmaNode } from './lemma';

export interface WordNode {
  id: string;
  word: string;
  position: Vector3;
  importance: number; // 0-1, based on relationCount
  senseCount: number;
  relationCount: number;
  synsets: LemmaNode['synsets'];
}
