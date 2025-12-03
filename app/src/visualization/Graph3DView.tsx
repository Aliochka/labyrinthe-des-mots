// src/visualization/Graph3DView.tsx
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphSlice } from '../wordnet/semantic-api';

interface Graph3DViewProps {
  graph: GraphSlice | null;
  highlightNodeIds?: number[];
  title?: string;
  onWordClick?: (word: string) => void;
}

export function Graph3DView({
  graph,
  highlightNodeIds = [],
  title,
  onWordClick
}: Graph3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const textMeshesRef = useRef<THREE.Mesh[]>([]);
  const textMeshDataRef = useRef<Map<THREE.Mesh, string>>(new Map()); // Associer mesh -> mot
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  // Initialisation de Three.js avec useLayoutEffect pour synchronisation DOM
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || rendererRef.current) {
      return; // Éviter la double initialisation
    }

    // Utiliser directement les dimensions de la fenêtre pour le plein écran
    const width = window.innerWidth;
    const height = window.innerHeight;


    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Retour au noir
    sceneRef.current = scene;

    // Camera avec les dimensions de la fenêtre
    const camera = new THREE.PerspectiveCamera(
      45, // fov
      width / height, // aspect basé sur fenêtre
      0.1, // near
      1000 // far
    );
    camera.position.set(0, 8, 15); // Plus haut et plus loin
    camera.lookAt(0, 8, 0); // Regarder vers le centre des objets en hauteur
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    // Utiliser les dimensions de la fenêtre
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Synchroniser le viewport WebGL avec la taille exacte
    renderer.setViewport(0, 0, width, height);

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    // Ajouter le canvas au container
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Éclairage
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Groupe pour contenir tous les objets du graphe
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // OrbitControls pour navigation 3D
    const controls = new OrbitControls(camera, renderer.domElement);

    // Configuration des contrôles
    controls.enableDamping = false; // Désactiver le damping pour éviter la boucle
    controls.screenSpacePanning = false;
    controls.minDistance = 5; // Distance minimale
    controls.maxDistance = 50; // Distance maximale
    controls.maxPolarAngle = Math.PI; // Permet de regarder en dessous
    controls.enabled = true; // Réactivé

    // Position initiale des contrôles
    controls.target.set(0, 8, 0); // Cible vers le centre des objets
    controls.update();

    controlsRef.current = controls;

    // Événements pour déclencher le rendu et orienter les textes
    const onControlsChange = () => {
      // Réorienter tous les textes vers la caméra
      textMeshesRef.current.forEach(textMesh => {
        textMesh.lookAt(camera.position);
      });

      renderer.render(scene, camera);
    };

    controls.addEventListener('change', onControlsChange);

    // Gestionnaire de clic pour les mots
    const handleClick = (event: MouseEvent) => {
      if (!onWordClick) {
        return;
      }

      // Convertir les coordonnées de souris en coordonnées normalisées
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycasting pour détecter les objets cliqués
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(textMeshesRef.current);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const word = textMeshDataRef.current.get(clickedMesh);
        if (word) {
          onWordClick(word);
        }
      }
    };

    // Ajout des événements de clic
    renderer.domElement.addEventListener('click', handleClick);
    console.log('🎧 Click listener added to canvas');

    // Gestionnaire de clavier pour les flèches
    const handleKeyDown = (event: KeyboardEvent) => {
      const moveSpeed = 1; // Vitesse de déplacement

      let needsUpdate = false;

      switch (event.key) {
        case 'ArrowUp':
          camera.position.y += moveSpeed;
          controls.target.y += moveSpeed;
          needsUpdate = true;
          break;
        case 'ArrowDown':
          camera.position.y -= moveSpeed;
          controls.target.y -= moveSpeed;
          needsUpdate = true;
          break;
        case 'ArrowLeft':
          camera.position.x -= moveSpeed;
          controls.target.x -= moveSpeed;
          needsUpdate = true;
          break;
        case 'ArrowRight':
          camera.position.x += moveSpeed;
          controls.target.x += moveSpeed;
          needsUpdate = true;
          break;
      }

      if (needsUpdate) {
        event.preventDefault();
        controls.update();

        // Réorienter tous les textes vers la nouvelle position de caméra
        textMeshesRef.current.forEach(textMesh => {
          textMesh.lookAt(camera.position);
        });

        renderer.render(scene, camera);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Rendu initial
    renderer.render(scene, camera);

    // Animation loop pour les contrôles avec damping - TEMPORAIREMENT DÉSACTIVÉ
    /*
    let animationId: number;
    const animate = () => {
      if (controls) {
        controls.update(); // Nécessaire pour le damping
      }
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
      animationId = requestAnimationFrame(animate);
    };
    animate();
    */

    // Gestion du resize avec viewport synchronization
    const handleResize = () => {
      if (!camera || !renderer) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      // Crucial : mettre à jour à la fois la taille ET le viewport
      renderer.setSize(width, height);
      renderer.setViewport(0, 0, width, height);

      renderer.render(scene, camera);
    };

    resizeHandlerRef.current = handleResize;
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      // Arrêter la boucle d'animation
      if (typeof animationId !== 'undefined') {
        cancelAnimationFrame(animationId);
      }

      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }

      if (controlsRef.current) {
        controlsRef.current.removeEventListener('change', onControlsChange);
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('click', handleClick);
      }

      window.removeEventListener('keydown', handleKeyDown);

      if (renderer && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      if (renderer) {
        renderer.dispose();
      }

      if (scene) {
        scene.clear();
      }

      // Nettoyer les références
      textMeshesRef.current = [];
      textMeshDataRef.current.clear();
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      groupRef.current = null;
    };
  }, []); // Dépendance vide = init une seule fois

  // Rendu du graphe (nœuds et arêtes)
  useLayoutEffect(() => {
    if (!graph || !groupRef.current || graph.nodes.length === 0) {
      // Le rendu se fait automatiquement via la boucle d'animation
      return;
    }

    const group = groupRef.current;


    // Vider la liste des textes et leurs données
    textMeshesRef.current = [];
    textMeshDataRef.current.clear();

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

    // Algorithme amélioré pour les graphiques fusionnés
    // Identifier le nœud central et les clusters d'expansion
    const centerNode = graph.nodes.find((n) => n.id === graph.centerId) ?? graph.nodes[0];
    const nodePositions = new Map<number, THREE.Vector3>();

    console.log('🎯 Positioning nodes:', {
      totalNodes: graph.nodes.length,
      centerNodeId: centerNode.id,
      centerNodeLemma: centerNode.lemmas[0]
    });

    // Centre à (0, 0, 0)
    nodePositions.set(centerNode.id, new THREE.Vector3(0, 0, 0));

    // Grouper les nœuds par distance du centre (pour gérer les expansions)
    const nodesByDistance = new Map<number, number[]>();

    // BFS pour calculer les distances depuis le centre
    const distances = new Map<number, number>();
    const queue = [{ nodeId: centerNode.id, distance: 0 }];
    distances.set(centerNode.id, 0);

    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()!;

      if (!nodesByDistance.has(distance)) {
        nodesByDistance.set(distance, []);
      }
      nodesByDistance.get(distance)!.push(nodeId);

      // Trouver les nœuds connectés
      graph.edges.forEach(edge => {
        let nextNodeId = null;
        if (edge.source === nodeId && !distances.has(edge.target)) {
          nextNodeId = edge.target;
        } else if (edge.target === nodeId && !distances.has(edge.source)) {
          nextNodeId = edge.source;
        }

        if (nextNodeId) {
          distances.set(nextNodeId, distance + 1);
          queue.push({ nodeId: nextNodeId, distance: distance + 1 });
        }
      });
    }

    console.log('📊 Node distances:', Array.from(nodesByDistance.entries()).map(([dist, nodes]) =>
      ({ distance: dist, count: nodes.length })
    ));

    // Positionner les nœuds par couches concentriques
    nodesByDistance.forEach((nodeIds, distance) => {
      if (distance === 0) return; // Centre déjà positionné

      const radius = 6 + distance * 4; // Rayons croissants pour chaque couche
      const nodesInLayer = nodeIds;

      nodesInLayer.forEach((nodeId, index) => {
        if (nodesInLayer.length === 1) {
          // Un seul nœud : position aléatoire sur la sphère
          const phi = Math.random() * Math.PI;
          const theta = Math.random() * 2 * Math.PI;
          const x = radius * Math.sin(phi) * Math.cos(theta);
          const y = radius * Math.cos(phi);
          const z = radius * Math.sin(phi) * Math.sin(theta);
          nodePositions.set(nodeId, new THREE.Vector3(x, y, z));
        } else {
          // Répartition uniforme autour de la sphère
          const phi = Math.acos(1 - 2 * (index + 1) / nodesInLayer.length);
          const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 1) + distance * Math.PI / 3; // Décalage par couche

          const x = radius * Math.sin(phi) * Math.cos(theta);
          const y = radius * Math.cos(phi);
          const z = radius * Math.sin(phi) * Math.sin(theta);

          nodePositions.set(nodeId, new THREE.Vector3(x, y, z));
        }
      });
    });

    // Créer les arêtes (lignes) en premier pour qu'elles soient en arrière-plan
    graph.edges.forEach((edge) => {
      const fromPos = nodePositions.get(edge.source);
      const toPos = nodePositions.get(edge.target);

      if (fromPos && toPos) {
        const geometry = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);

        // Couleur différente si l'arête fait partie du chemin surligné
        const edgeOnPath = highlightNodeIds.includes(edge.source) && highlightNodeIds.includes(edge.target);
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

      // Créer le texte flottant directement
      if (node.lemmas[0]) {
        // Taille et couleurs selon le type de nœud
        let fontSize = isCenter ? 24 : (isHighlighted ? 20 : 16);
        let textColor = isHighlighted ? '#ffcc33' : (isCenter ? '#33aaff' : '#f5f5f5');

        // Créer un canvas pour le texte
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          // Ajuster la taille du canvas selon le texte
          const text = node.lemmas[0].replace(/_/g, ' '); // Remplacer les underscores par des espaces
          canvas.width = Math.max(text.length * fontSize * 0.6, 128);
          canvas.height = fontSize + 20;

          // Style du texte
          context.fillStyle = textColor;
          context.font = `${fontSize}px system-ui, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';

          // Effet d'ombre pour la lisibilité
          if (!isCenter && !isHighlighted) {
            context.shadowColor = 'rgba(0, 0, 0, 0.8)';
            context.shadowOffsetX = 2;
            context.shadowOffsetY = 2;
            context.shadowBlur = 4;
          }

          context.fillText(text, canvas.width / 2, canvas.height / 2);

          const texture = new THREE.CanvasTexture(canvas);
          const labelMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1
          });

          const labelGeometry = new THREE.PlaneGeometry(
            canvas.width / 64, // Mise à l'échelle
            canvas.height / 64
          );

          // CRITIQUE : Calculer les normales pour le raycasting
          labelGeometry.computeVertexNormals();
          const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);

          labelMesh.position.copy(position);
          // Faire face à la caméra
          labelMesh.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 8, 15));

          // Ajouter à la liste des textes pour la réorientation et le clic
          textMeshesRef.current.push(labelMesh);
          textMeshDataRef.current.set(labelMesh, node.lemmas[0]); // Associer mesh -> mot original

          group.add(labelMesh);
        }
      }

    });

    // Rendu après mise à jour du graphe avec remise à jour complète
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;

      // Forcer une remise à jour complète du renderer et camera
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Re-configurer complètement le renderer
      renderer.setSize(width, height, false); // false = ne pas mettre à jour le style CSS
      renderer.setViewport(0, 0, width, height);

      // Re-configurer la caméra
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      // Rendu manuel temporaire
      renderer.render(sceneRef.current, camera);
    }

  }, [graph, highlightNodeIds]); // Redessiner quand le graphe ou les surlignages changent

  // Déterminer le contenu à afficher dans le container
  const shouldShowGraph = graph && graph.nodes.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#050505',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1, // En arrière-plan par rapport au ControlPanel (zIndex 1000)
        overflow: 'hidden',
        pointerEvents: 'auto', // S'assurer que les événements de souris fonctionnent
        cursor: shouldShowGraph ? 'crosshair' : 'default', // Indicator visuel selon le contenu
      }}
    >
      {!shouldShowGraph && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#888',
          zIndex: 2
        }}>
          {!graph ? (
            <>
              <p>Aucun graphe à afficher.</p>
              <p style={{ fontSize: '0.8rem' }}>Entrez un mot pour commencer l'exploration.</p>
            </>
          ) : (
            <>
              <p>Graphe vide.</p>
              <p style={{ fontSize: '0.8rem' }}>Aucun nœud trouvé pour ce mot.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}