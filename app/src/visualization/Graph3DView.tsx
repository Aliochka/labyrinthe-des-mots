// src/visualization/Graph3DView.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GraphSlice } from '../types/graph';

interface Graph3DViewProps {
  graph: GraphSlice | null;
  highlightNodeIds?: number[];
  title?: string;
}

export function Graph3DView({
  graph,
  highlightNodeIds = [],
  title
}: Graph3DViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  // Initialisation de Three.js
  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45, // fov
      canvasRef.current.clientWidth / canvasRef.current.clientHeight, // aspect
      0.1, // near
      1000 // far
    );
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    // Éclairage
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6); // lumière ambiante douce
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Groupe pour contenir tous les objets du graphe
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Rendu initial
    renderer.render(scene, camera);

    // Gestion du resize
    const handleResize = () => {
      if (!canvasRef.current || !camera || !renderer) return;

      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);

      // Dispose des objets Three.js
      if (renderer) {
        renderer.dispose();
      }
      if (scene) {
        scene.clear();
      }
    };
  }, []); // Dépendance vide = init une seule fois

  // Rendu du graphe (nœuds et arêtes)
  useEffect(() => {
    if (!graph || !groupRef.current) return;

    const group = groupRef.current;

    // Vider le groupe des anciens objets
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);

      // Dispose des géométries et matériaux
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      } else if (child instanceof THREE.Line) {
        if (child.geometry) child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }

    // Trouver le nœud central
    const centerNode = graph.nodes.find((n) => n.id === graph.centerId) ?? graph.nodes[0];
    const otherNodes = graph.nodes.filter((n) => n.id !== centerNode.id);

    // Calculer les positions 3D
    const nodePositions = new Map<number, THREE.Vector3>();

    // Centre à (0, 0, 0)
    nodePositions.set(centerNode.id, new THREE.Vector3(0, 0, 0));

    // Autres nœuds sur un cercle dans le plan XZ
    const radius = 5;
    otherNodes.forEach((node, index) => {
      const angle = (index / Math.max(1, otherNodes.length)) * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = 0;
      nodePositions.set(node.id, new THREE.Vector3(x, y, z));
    });

    // Créer les arêtes (lignes) en premier pour qu'elles soient en arrière-plan
    graph.edges.forEach((edge) => {
      const fromPos = nodePositions.get(edge.from);
      const toPos = nodePositions.get(edge.to);

      if (fromPos && toPos) {
        const geometry = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);

        // Couleur différente si l'arête fait partie du chemin surligné
        const edgeOnPath = highlightNodeIds.includes(edge.from) && highlightNodeIds.includes(edge.to);
        const material = new THREE.LineBasicMaterial({
          color: edgeOnPath ? 0xffcc33 : 0x555555,
          opacity: edgeOnPath ? 0.9 : 0.7,
          transparent: true
        });

        const line = new THREE.Line(geometry, material);
        group.add(line);
      }
    });

    // Créer les nœuds (sphères)
    graph.nodes.forEach((node) => {
      const position = nodePositions.get(node.id);
      if (!position) return;

      const isCenter = node.id === centerNode.id;
      const isHighlighted = highlightNodeIds.includes(node.id);

      // Taille de la sphère
      const baseRadius = isCenter ? 0.3 : 0.2;
      const radius = isHighlighted ? baseRadius + 0.05 : baseRadius;

      // Couleur
      let color: number;
      if (isHighlighted) {
        color = 0xffcc33; // jaune/or
      } else if (isCenter) {
        color = 0x33aaff; // bleu
      } else {
        color = 0x888888; // gris
      }

      const geometry = new THREE.SphereGeometry(radius, 16, 12);
      const material = new THREE.MeshStandardMaterial({ color });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);

      // Halo pour les nœuds surlignés
      if (isHighlighted) {
        const haloGeometry = new THREE.RingGeometry(radius + 0.1, radius + 0.2, 16);
        const haloMaterial = new THREE.MeshBasicMaterial({
          color: 0xffcc33,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        halo.position.copy(position);
        halo.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 5, 10));
        group.add(halo);
      }

      group.add(mesh);

      // Ajouter du texte pour le label du nœud
      // Note: Pour un vrai projet, on utiliserait une librairie comme troika-three-text
      // Ici on simule avec un plan simple pour l'exemple
      if (node.lemmas[0]) {
        // Créer un canvas pour le texte
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = 128;
          canvas.height = 64;

          context.fillStyle = isHighlighted ? '#ffec9a' : '#f5f5f5';
          context.font = '12px system-ui, sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(node.lemmas[0], 64, 32);

          const texture = new THREE.CanvasTexture(canvas);
          const labelMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1
          });
          const labelGeometry = new THREE.PlaneGeometry(1, 0.5);
          const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);

          labelMesh.position.set(position.x, position.y + radius + 0.3, position.z);
          labelMesh.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 5, 10));

          group.add(labelMesh);
        }
      }
    });

    // Rendu après mise à jour du graphe
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

  }, [graph, highlightNodeIds]); // Redessiner quand le graphe ou les surlignages changent

  // Guard clause pour graphe vide - APRÈS tous les hooks
  if (!graph || graph.nodes.length === 0) {
    return <p>Aucun graphe à afficher.</p>;
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        background: '#181818',
        borderRadius: '0.75rem',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}

      <div
        style={{
          borderRadius: '0.5rem',
          border: '1px solid #333',
          background: '#050505',
          width: '100%',
          height: '100%',
          minHeight: '400px',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            borderRadius: '0.5rem',
          }}
        />
      </div>
    </div>
  );
}