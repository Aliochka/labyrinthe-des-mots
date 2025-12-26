// src/components/graph/Map3D.tsx
// VERSION 3D — vue "toile cosmique" basée sur UniverseGraphData
// ✅ Perf: InstancedMesh stars créé une seule fois + updates ciblées
// ✅ GPU safe: plus de new Geometry/Material par node (pool galaxies)
// ✅ Liens stables: pas de rgba(), opacité via linkOpacity, linksOnly force links
// ✅ Features conservées: ControlPanel, RelationFilter, trail, LOD, downsample, mustInclude

import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { ControlPanel } from "../../ui/ControlPanel";
import { RelationFilter } from "../../ui/RelationFilter";
import { useAppStore } from "../../../store/appStore";
import { useLODSystem } from "../../../hooks/useLODSystem";
import type {
  UniverseGraphData,
  GraphData,
  GraphNode,
  GraphLink,
  LevelId,
} from "../../../types/graph";
import { galaxyDataService } from "../../../services/GalaxyDataService";
// Utils and constants
import { idStr, linkEndId, linkIdStable } from "./utils/idUtils";
import { hashString } from "./utils/hashUtils";
import { ensureIncludedNodes } from "./utils/nodeFiltering";
import { getGalaxyColor, computeStarVisual } from "./utils/visualUtils";
import { sampleStarsForTethers, buildTetherCurve } from "./utils/samplingUtils";
import { useGalaxyMaterials } from "./hooks/useGalaxyMaterials";
import { MAX_NODES_RENDER, DEBUG_PANEL, SHOW_BOUNDING_BOX_HELPER } from "./constants";

interface Props {
  graphData: UniverseGraphData | null;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

// ================================================
// All utility functions have been extracted to:
// - ./utils/idUtils.ts (idStr, linkEndId, linkIdStable)
// - ./utils/hashUtils.ts (hashString, simpleHash)
// - ./utils/nodeFiltering.ts (ensureIncludedNodes)
// - ./utils/visualUtils.ts (getGalaxyColor, computeGalaxyCenterVisual, computeStarVisual)
// - ./utils/samplingUtils.ts (sampleStarsForTethers, buildTetherCurve)
// ================================================

export default function Map3D({
  graphData,
  width = window.innerWidth,
  height = window.innerHeight,
  backgroundColor = "#050010",
}: Props) {
  const fgRef = useRef<any>(null);
  const cameraInitializedRef = useRef(false);  // Track si caméra déjà positionnée
  const savedCameraState = useRef<{ pos: THREE.Vector3, lookAt: THREE.Vector3 } | null>(null);

  // Debug: compter les re-renders
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  if (renderCountRef.current <= 5) {
    console.log(`[Map3D] Render #${renderCountRef.current}, graphData=${!!graphData}`);
  }

  // ================================================
  // Exploration tracking and path visualization
  // ================================================
  const visibleNavigationNodeIds = useAppStore((s) => s.visibleNavigationNodeIds);
  const addExploredNode = useAppStore((s) => s.addExploredNode);

  // ================================================
  // FILTRAGE DES RELATIONS
  // ================================================
  const enabledRelationTypes = useAppStore((s) => s.enabledRelationTypes);
  const toggleRelationType = useAppStore((s) => s.toggleRelationType);
  const resetRelationFilter = useAppStore((s) => s.resetRelationFilter);

  // ================================================
  // INITIALIZE GALAXY SERVICE
  // ================================================
  useEffect(() => {
    if (graphData) galaxyDataService.initialize(graphData);
  }, [graphData]);

  // ================================================
  // GALAXY BUNDLES depuis graphData
  // ================================================
  const galaxyBundles = useMemo(() => {
    return graphData?.bundles?.galaxy?.routes ?? [];
  }, [graphData]);



  // ================================================
  // NIVEAUX
  // ================================================
  const levels = useMemo(() => {
    if (!graphData) return [];
    return [
      { id: "galaxy" as LevelId, data: graphData.galaxies },
      { id: "star" as LevelId, data: graphData.stars },
    ];
  }, [graphData]);

  const [levelIdx, setLevelIdx] = useState(0);
  const [linksOnly, setLinksOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [center, setCenter] = useState(new THREE.Vector3(0, 0, 0));
  const [cameraDistance, setCameraDistance] = useState(Infinity);
  const [radiusMean, setRadiusMean] = useState(1);

  const neighborsRef = useRef<Map<string, Array<{ to: string; linkId: string }>>>(new Map());
  const degreeRef = useRef<Map<string, number>>(new Map());

  const currentLevelId: LevelId | undefined = levels[levelIdx]?.id;

  // ================================================
  // LOD SYSTEM
  // ================================================
  const { renderMode, shouldShowStarLinks } = useLODSystem({
    radiusMean,
    cameraDistance,
  });

  // Forcer InstancedMesh en mode star pour la coloration par galaxie
  // (sinon le pool de materials partagés écrase les couleurs)
  const effectiveRenderMode =
    currentLevelId === "star" ? "stars" : renderMode;

  const inStarsRenderMode =
    currentLevelId === "star" && effectiveRenderMode === "stars";

  // ================================================
  // DATA NIVEAU COURANT (avant filtrage)
  // ================================================
  const rawData: GraphData | null = useMemo(() => {
    if (!levels.length) return null;

    if (currentLevelId === "galaxy") {
      return levels[levelIdx].data;
    }

    // MODE STAR : inclure les centres de galaxies comme nœuds spéciaux
    const starData = levels[levelIdx].data;
    const galaxyData = graphData?.galaxies;
    if (!galaxyData) return starData;

    const starNodes = [...(starData.nodes ?? [])];
    const galaxyCenters = galaxyData.nodes.map(g => ({
      ...g,
      __isGalaxyCenter: true  // Marqueur pour styling
    }));

    return {
      nodes: [...starNodes, ...galaxyCenters],
      links: starData.links ?? []
    };
  }, [levels, levelIdx, currentLevelId, graphData]);

  // ================================================
  // Must-include ids (selected + trail)
  // ================================================
  const mustIncludeIds = useMemo(() => {
    const s = new Set<string>();
    if (selectedNode?.id != null) s.add(idStr(selectedNode.id));
    for (const id of visibleNavigationNodeIds) s.add(idStr(id));
    return s;
  }, [selectedNode, visibleNavigationNodeIds]);

  // ================================================
  // DISPLAY DATA (downsample + link filtering)
  // IMPORTANT: deps incluent linksOnly (sinon toggle instable)
  // ================================================
  const displayData: GraphData = useMemo(() => {
    if (!rawData || !graphData) return { nodes: [], links: [] };

    const rawNodes = (rawData.nodes ?? []) as GraphNode[];
    const rawLinks = (rawData.links ?? []) as GraphLink[];

    let nodes = rawNodes;

    // Downsampling global si trop de stars
    if (currentLevelId === "star" && nodes.length > MAX_NODES_RENDER) {
      // Séparer les centres de galaxies des stars
      const galaxyCenters = nodes.filter((n: any) => n.__isGalaxyCenter);
      const stars = nodes.filter((n: any) => !n.__isGalaxyCenter);

      const step = Math.ceil(stars.length / MAX_NODES_RENDER);
      let sampledStars = stars.filter((_, i) => i % step === 0);

      // Garder sélection + trail même si hors sampling
      sampledStars = ensureIncludedNodes(sampledStars, stars, mustIncludeIds);

      // TOUJOURS inclure TOUS les centres de galaxies (46 nodes)
      nodes = [...sampledStars, ...galaxyCenters];
      console.log(`[displayData] ${sampledStars.length} stars + ${galaxyCenters.length} galaxy centers`);
    } else {
      nodes = ensureIncludedNodes(nodes, rawNodes, mustIncludeIds);
    }

    // Filtrer les liens pour ne garder que ceux entre nœuds visibles
    const nodeIdSet = new Set(nodes.map((n) => idStr(n.id)));
    let filteredLinks = rawLinks.filter((link) => {
      const s = linkEndId((link as any).source);
      const t = linkEndId((link as any).target);
      return nodeIdSet.has(s) && nodeIdSet.has(t);
    });



    if (currentLevelId === "star") {
      // Ne plus afficher les liens globaux par défaut
      // Les star-tethers remplaceront cette visualisation
      filteredLinks = [];

      // TODO plus tard : ego-graph autour de selectedNode
      // if (selectedNode) {
      //   const egoLinks = getEgoGraphLinks(selectedNode.id, topK=20);
      //   filteredLinks = egoLinks;
      // }
    }
    // --- ensure stable id on links ---
    filteredLinks = filteredLinks.map((l: any) => {
      if (!l.id) l.id = linkIdStable(l);
      return l;
    });

    if (currentLevelId === "galaxy") {
      // On laisse les liens de ForceGraph vides : les bundles sont dessinés en layer Three
      filteredLinks = [];
    }

    return { nodes, links: filteredLinks };
  }, [
    rawData,
    graphData,
    currentLevelId,
    enabledRelationTypes,
    shouldShowStarLinks,
    mustIncludeIds,
    linksOnly, // ✅ IMPORTANT
  ]);

  const displayNodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of displayData.nodes) m.set(idStr(n.id), n);
    return m;
  }, [displayData.nodes]);

  // ================================================
  // WebGL context lost/restored (debug)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    const canvas: HTMLCanvasElement | null = fg?.renderer?.()?.domElement ?? null;
    if (!canvas) return;

    const onLost = (e: Event) => {
      e.preventDefault();
      console.warn("[WebGL] context lost");
    };
    const onRestored = () => {
      console.warn("[WebGL] context restored");
      // On force une petite “secousse” en changeant un state si besoin.
      // Ici on ne fait rien: le but principal est le diagnostic.
    };

    canvas.addEventListener("webglcontextlost", onLost as any);
    canvas.addEventListener("webglcontextrestored", onRestored as any);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost as any);
      canvas.removeEventListener("webglcontextrestored", onRestored as any);
    };
  }, []);

  // ================================================
  // PATH VISUALIZATION - Discovery trail
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const scene: THREE.Scene = fg.scene();

    const oldPath = scene.getObjectByName("discovery-path");
    if (oldPath) {
      scene.remove(oldPath);
      if (oldPath instanceof THREE.Mesh) {
        oldPath.geometry.dispose();
        const mat = (oldPath as any).material;
        if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
        else mat?.dispose?.();
      }
    }

    if (visibleNavigationNodeIds.length < 2) return;

    const points: THREE.Vector3[] = [];

    for (const nodeId of visibleNavigationNodeIds) {
      const sid = idStr(nodeId);

      let n = displayNodeById.get(sid);
      if (!n && (galaxyDataService as any)?.getNodeById) {
        n = (galaxyDataService as any).getNodeById(sid) as GraphNode | undefined;
      }

      if (n && n.x != null && n.y != null && (n as any).z != null) {
        points.push(new THREE.Vector3(n.x, n.y, (n as any).z));
      }
    }

    if (points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(points);
    const geom = new THREE.TubeGeometry(
      curve,
      Math.max(20, points.length * 5),
      0.3,
      8,
      false
    );
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = "discovery-path";
    scene.add(mesh);

    return () => {
      scene.remove(mesh);
      geom.dispose();
      mat.dispose();
    };
  }, [visibleNavigationNodeIds, displayNodeById]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene: THREE.Scene = fg.scene();

    // clear old layer
    const old = scene.getObjectByName("galaxy-bundles");
    if (old) {
      scene.remove(old);
      old.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
      });
    }

    // bundles only in galaxy level, and only if not linksOnly (au choix)
    if (currentLevelId !== "galaxy") return;
    if (!galaxyBundles.length) return;
    if (linksOnly) return; // option: si linksOnly, tu veux peut-être n'afficher QUE bundles → mets false si tu préfères

    const group = new THREE.Group();
    group.name = "galaxy-bundles";

    const mat = new THREE.LineBasicMaterial({
      color: 0xffd296,
      transparent: true,
      opacity: 0.25,
    });

    for (const r of galaxyBundles) {
      const curve = new THREE.CatmullRomCurve3(
        r.points.map((p: number[]) => new THREE.Vector3(p[0], p[1], p[2])),
        false,
        "catmullrom",
        0.6
      );
      const pts = curve.getPoints(24);
      const geom = new THREE.BufferGeometry().setFromPoints(pts);

      const line = new THREE.Line(geom, mat);
      // option: encodage “poids” → opacité légère par route
      // (mais attention: LineBasicMaterial est partagé; si tu veux varier, clone mat)
      group.add(line);
    }

    scene.add(group);

    return () => {
      scene.remove(group);
      group.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        // mat est partagé → ne pas dispose ici (ou clone par line si tu veux varier)
      });
      mat.dispose();
    };
  }, [currentLevelId, galaxyBundles, linksOnly]);

  // ================================================
  // LAYER: STAR TETHERS (courbes star → centre galaxie)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene: THREE.Scene = fg.scene();

    // Nettoyage de l'ancienne couche
    const existing = scene.getObjectByName("star-tethers");
    if (existing) {
      scene.remove(existing);
      existing.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
      });
    }

    // Tethers uniquement en mode star ET quand "Afficher les liens" est activé
    if (currentLevelId !== "star") return;
    if (!linksOnly) return;  // Seulement si l'utilisateur active les liens
    if (!graphData) return;

    // Échantillonner les stars à afficher
    const sampledStars = sampleStarsForTethers(
      displayData.nodes,
      selectedNode,
      visibleNavigationNodeIds,
      graphData.starIndex
    );

    console.log(`[star-tethers] Rendering ${sampledStars.length} tethers`);

    // Créer le groupe Three.js
    const group = new THREE.Group();
    group.name = "star-tethers";

    const material = new THREE.LineBasicMaterial({
      color: 0x666666,  // Gris neutre
      transparent: true,
      opacity: 0.2,     // Très transparent pour ne pas surcharger
    });

    // Pour chaque star échantillonnée
    for (const starNode of sampledStars) {
      // Récupérer le centre de la galaxie (normaliser galaxyId en string)
      const star = graphData.starIndex.get(starNode.id as string);
      const galaxyId = star?.galaxy != null ? String(star.galaxy) : undefined;
      if (!star || galaxyId === 'void') continue;  // Skip void stars

      const galaxyNode = graphData.galaxies.nodes.find(g => g.id === galaxyId);
      if (!galaxyNode || galaxyNode.x == null || galaxyNode.y == null || galaxyNode.z == null) continue;

      // Construire la courbe S → H → G
      const curve = buildTetherCurve(
        { x: starNode.x!, y: starNode.y!, z: starNode.z! },  // S = star
        { x: galaxyNode.x, y: galaxyNode.y, z: galaxyNode.z }  // G = galaxy center
      );

      // Géométrie de la courbe
      const points = curve.getPoints(16);  // 16 points pour lisser
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);

      group.add(line);
    }

    scene.add(group);

    return () => {
      // Cleanup au démontage
      scene.remove(group);
      group.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
      });
    };
  }, [currentLevelId, linksOnly, displayData.nodes, selectedNode, visibleNavigationNodeIds, graphData]);

  // ================================================
  // LAYER: STAR BACKBONE (MST + kNN hybride)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene: THREE.Scene = fg.scene();

    // Nettoyage de l'ancienne couche
    const existing = scene.getObjectByName("star-backbone");
    if (existing) {
      scene.remove(existing);
      existing.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
      });
    }

    // Backbone uniquement en mode star ET quand "Afficher les liens" est activé
    if (currentLevelId !== "star") return;
    if (!linksOnly) return;  // Seulement si l'utilisateur active les liens
    if (!graphData?.bundles?.star?.backbone) return;

    const backbone = graphData.bundles.star.backbone;
    console.log(`[star-backbone] Rendering ${backbone.length} edges`);

    // Créer le groupe Three.js
    const group = new THREE.Group();
    group.name = "star-backbone";

    // Material avec LOD-awareness via opacité
    const material = new THREE.LineBasicMaterial({
      color: 0x4488ff,  // Bleu clair
      transparent: true,
      opacity: 0.15,    // Très transparent par défaut
    });

    // Pour chaque arête du backbone
    for (const edge of backbone) {
      if (!edge.points || edge.points.length < 2) continue;

      // Ligne droite entre les 2 points
      const p1 = new THREE.Vector3(edge.points[0][0], edge.points[0][1], edge.points[0][2]);
      const p2 = new THREE.Vector3(edge.points[1][0], edge.points[1][1], edge.points[1][2]);

      const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const line = new THREE.Line(geometry, material);

      group.add(line);
    }

    scene.add(group);

    return () => {
      // Cleanup au démontage
      scene.remove(group);
      group.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
      });
    };
  }, [currentLevelId, linksOnly, graphData]);

  // ================================================
  // WEBGL CONTEXT LOST RECOVERY
  // ================================================
  const [contextLostCount, setContextLostCount] = useState(0);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const renderer = fg.renderer?.();
    const canvas: HTMLCanvasElement | null = renderer?.domElement ?? null;
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[Map3D] WebGL context lost, preventing default...');
    };

    const handleContextRestored = () => {
      console.log('[Map3D] WebGL context restored! Forcing re-render...');
      // Force un re-render des couleurs
      setContextLostCount(prev => prev + 1);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  // ================================================
  // FADE-IN DOUX AU DÉMARRAGE
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const renderer = fg.renderer?.();
    const canvas: HTMLCanvasElement | null = renderer?.domElement ?? null;
    if (!canvas) return;

    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 0.6s ease-out";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => (canvas.style.opacity = "1"));
    });
  }, []);

  // ================================================
  // PixelRatio cap (réduit risque context lost)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    const r = fg?.renderer?.();
    if (!r) return;

    // Forcer pixelRatio=1 pour éviter WebGL context lost
    const cap = 1;  // Très conservateur
    r.setPixelRatio(cap);
    console.log(`[PixelRatio] Set to ${cap}, devicePixelRatio=${window.devicePixelRatio}`);
  }, [currentLevelId]);

  // ================================================
  // BOUNDING BOX + CAMERA (basé sur displayData)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const nodes = displayData.nodes;
    if (!nodes.length) return;

    console.log(`[camera useEffect] currentLevelId=${currentLevelId}, initialized=${cameraInitializedRef.current}, nodes=${nodes.length}`);

    const scene: THREE.Scene = fg.scene();

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    let sumX = 0,
      sumY = 0,
      sumZ = 0;

    for (const n of nodes) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const z = (n as any).z ?? 0;

      sumX += x;
      sumY += y;
      sumZ += z;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const count = nodes.length || 1;
    const c = new THREE.Vector3(sumX / count, sumY / count, sumZ / count);
    setCenter(c);

    let distSum = 0;
    for (const n of nodes) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const z = (n as any).z ?? 0;
      const dx = x - c.x,
        dy = y - c.y,
        dz = z - c.z;
      distSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    let rm = distSum / count;
    if (!isFinite(rm) || rm <= 0) rm = 1;
    setRadiusMean(rm);

    // helper optionnel
    let helper: THREE.Box3Helper | null = null;
    if (SHOW_BOUNDING_BOX_HELPER) {
      const box = new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ)
      );
      helper = new THREE.Box3Helper(box, new THREE.Color(1, 0.4, 0.1));
      scene.add(helper);
    }

    // Positionner la caméra UNIQUEMENT lors de la première initialisation
    // Après ça, ne JAMAIS toucher la caméra (l'utilisateur garde le contrôle total)
    if (!cameraInitializedRef.current) {
      const levelDistanceFactor =
        currentLevelId === "galaxy" ? 5.0 : currentLevelId === "star" ? 3.5 : 2.8;

      const dist = rm * levelDistanceFactor;
      const camPos = new THREE.Vector3(c.x + dist, c.y + dist * 0.4, c.z + dist);

      fg.cameraPosition(camPos, c, 0);
      cameraInitializedRef.current = true;
      console.log('[camera useEffect] Initial camera position set:', camPos);
    }
    // else: Ne rien faire - laisser l'utilisateur contrôler la caméra

    return () => {
      if (helper) scene.remove(helper);
    };
  }, [displayData.nodes, currentLevelId]); // currentLevelId nécessaire pour sauvegarder/restaurer caméra

  // ================================================
  // FORCER LA CAMÉRA À RESTER EN PLACE lors du changement de niveau
  // ForceGraph3D ajuste automatiquement le zoom selon le nombre de nodes,
  // on doit contrer ce comportement
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !cameraInitializedRef.current || !savedCameraState.current) return;

    // Utiliser requestAnimationFrame pour s'exécuter APRÈS le rendu de ForceGraph3D
    const rafId = requestAnimationFrame(() => {
      if (savedCameraState.current) {
        console.log('[force camera] Forcing camera to saved position');
        fg.cameraPosition(
          savedCameraState.current.pos,
          savedCameraState.current.lookAt,
          0
        );
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [currentLevelId]); // Se déclenche à chaque changement de niveau

  // ================================================
  // SAUVEGARDER la position caméra quand l'utilisateur la change
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !cameraInitializedRef.current) return;

    const intervalId = setInterval(() => {
      const camera = fg.camera();
      const controls = fg.controls();
      if (camera && controls) {
        savedCameraState.current = {
          pos: camera.position.clone(),
          lookAt: controls.target.clone()
        };
      }
    }, 500); // Sauvegarder toutes les 500ms

    return () => clearInterval(intervalId);
  }, []); // Une seule fois

  // ================================================
  // TRACK CAMERA DISTANCE (throttle 500ms)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    let alive = true;
    const tick = () => {
      if (!alive) return;
      const cam = fg.camera();
      if (cam && center) setCameraDistance(cam.position.distanceTo(center));
    };

    const interval = setInterval(tick, 500);
    tick();

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [center]);

  // ================================================
  // GALAXY RESOURCES (shared geometry + material pool)
  // Extracted to useGalaxyMaterials hook
  // ================================================
  const { galaxyGeomRef, galaxyMatPoolRef, galaxyTempColorRef } = useGalaxyMaterials();

  useEffect(() => {
    const map = new Map<string, Array<{ to: string; linkId: string }>>();
    const deg = new Map<string, number>();

    for (const l of (displayData.links ?? []) as any[]) {
      const s = linkEndId(l.source);
      const t = linkEndId(l.target);
      const id = idStr(l.id ?? linkIdStable(l));

      if (!s || !t) continue;

      if (!map.has(s)) map.set(s, []);
      if (!map.has(t)) map.set(t, []);
      map.get(s)!.push({ to: t, linkId: id });
      map.get(t)!.push({ to: s, linkId: id });

      deg.set(s, (deg.get(s) ?? 0) + 1);
      deg.set(t, (deg.get(t) ?? 0) + 1);
    }

    neighborsRef.current = map;
    degreeRef.current = deg;
  }, [displayData.links]);



  // ================================================
  // INSTANCED STARS (create once + update)
  // ================================================
  const starsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const starsGeomRef = useRef<THREE.SphereGeometry | null>(null);
  const starsMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const starsSourceRef = useRef<GraphNode[]>([]);
  const starsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsPickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  const updateStarInstances = useCallback(() => {
    const mesh = starsMeshRef.current;
    if (!mesh) return;
    if (!inStarsRenderMode) return;

    const stars = starsSourceRef.current;
    console.log(`[updateStarInstances] Updating ${stars.length} instances, graphData=${!!graphData}`);

    const tempObj = new THREE.Object3D();
    const tempCol = new THREE.Color();

    let galaxyCenterCount = 0;
    let coloredStarCount = 0;

    for (let i = 0; i < stars.length; i++) {
      const node: any = stars[i];
      const isSelected = selectedNode?.id === node.id;

      // Détecter galaxy centers
      if (node.__isGalaxyCenter) {
        galaxyCenterCount++;
      }

      // Récupérer le galaxyId via starIndex et normaliser en string
      const star = graphData?.starIndex.get(String(node.id));
      const galaxyId = star?.galaxy != null ? String(star.galaxy) : undefined;

      if (galaxyId && galaxyId !== 'void') {
        coloredStarCount++;
      }

      const { radius, color, opacity } = computeStarVisual(node, isSelected, galaxyId);

      tempObj.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      tempObj.scale.setScalar(radius);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);

      // Appliquer l'opacity à la couleur pour moins d'agressivité
      tempCol.copy(color).multiplyScalar(opacity);
      mesh.setColorAt(i, tempCol);
    }

    mesh.count = stars.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    console.log(`[updateStarInstances] Done: ${galaxyCenterCount} centers, ${coloredStarCount} colored stars`);
  }, [inStarsRenderMode, selectedNode, graphData]);

  // Create/destroy instanced mesh on mode changes
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene: THREE.Scene = fg.scene();

    if (!inStarsRenderMode) {
      const mesh = starsMeshRef.current;
      if (mesh) {
        scene.remove(mesh);
        starsMeshRef.current = null;
      }
      starsGeomRef.current?.dispose();
      starsMatRef.current?.dispose();
      starsGeomRef.current = null;
      starsMatRef.current = null;

      const canvas = starsCanvasRef.current;
      const handler = starsPickHandlerRef.current;
      if (canvas && handler) canvas.removeEventListener("click", handler);
      starsCanvasRef.current = null;
      starsPickHandlerRef.current = null;

      starsSourceRef.current = [];
      return;
    }

    // already created
    if (starsMeshRef.current) return;

    const geometry = new THREE.SphereGeometry(1, 10, 10);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
    });
    const capacity = Math.max(1, displayData.nodes.length);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3
    );
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // force shader variant instancingColor
    material.needsUpdate = true;

    mesh.name = "instanced-stars";
    scene.add(mesh);
    (mesh.material as THREE.MeshBasicMaterial).color.set(0xffffff);


    starsMeshRef.current = mesh;
    starsGeomRef.current = geometry;
    starsMatRef.current = material;
    console.log("has instanceColor", !!starsMeshRef.current?.instanceColor);
    console.log("material.vertexColors", (starsMatRef.current as any)?.vertexColors);

    requestAnimationFrame(() => updateStarInstances());

    // Picking: attach to canvas
    const renderer = fg.renderer?.();
    const canvas: HTMLCanvasElement | null = renderer?.domElement ?? null;
    starsCanvasRef.current = canvas;

    if (canvas) {
      const camera: THREE.Camera = fg.camera();
      const raycaster = new THREE.Raycaster();

      const handleClick = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        if (x < -1 || x > 1 || y < -1 || y > 1) return;

        raycaster.setFromCamera(new THREE.Vector2(x, y), camera as any);
        const targetMesh = starsMeshRef.current;
        if (!targetMesh) return;

        const hit = raycaster.intersectObject(targetMesh);
        if (!hit.length) return;

        const instanceId = hit[0].instanceId;
        if (instanceId == null) return;

        const node = starsSourceRef.current[instanceId];
        if (node) {
          setSelectedNode(node);
          addExploredNode(idStr(node.id));
        }
      };

      starsPickHandlerRef.current = handleClick;
      canvas.addEventListener("click", handleClick);
    }
  }, [inStarsRenderMode, displayData.nodes.length, addExploredNode]);

  // Update star source + instances when display nodes change
  useEffect(() => {
    if (!inStarsRenderMode) return;

    starsSourceRef.current = (displayData.nodes ?? []) as GraphNode[];

    // Resize rare: si capacity < stars.length, on recrée proprement (et on garde handler stable)
    const fg = fgRef.current;
    const scene: THREE.Scene | null = fg?.scene?.() ?? null;
    const mesh = starsMeshRef.current;

    if (scene && mesh && mesh.count < starsSourceRef.current.length) {
      scene.remove(mesh);
      const capacity = Math.max(1, displayData.nodes.length);
      console.log('[mesh resize] capacity:', capacity, 'starsSource:', starsSourceRef.current.length);
      const geometry = starsGeomRef.current ?? new THREE.SphereGeometry(1, 10, 10);
      const material =
        starsMatRef.current ??
        new THREE.MeshBasicMaterial({ transparent: true });

      const newMesh = new THREE.InstancedMesh(
        geometry,
        material,
        capacity
      );
      newMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3
      );
      newMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

      material.needsUpdate = true;

      newMesh.name = "instanced-stars";
      scene.add(newMesh);
      starsMeshRef.current = newMesh;
      console.log("has instanceColor", !!starsMeshRef.current?.instanceColor);
      console.log("material.vertexColors", (starsMatRef.current as any)?.vertexColors);

    }

    updateStarInstances();
  }, [displayData.nodes, inStarsRenderMode, updateStarInstances]);

  // Selection update only (no rebuild)
  useEffect(() => {
    if (!inStarsRenderMode) return;
    updateStarInstances();
  }, [selectedNode, inStarsRenderMode, updateStarInstances]);

  // Force re-render après restauration du contexte WebGL
  useEffect(() => {
    if (contextLostCount === 0) return;
    console.log('[Map3D] Re-rendering after context restore');
    updateStarInstances();
  }, [contextLostCount, updateStarInstances]);

  // ================================================
  // NODE OBJECT (galaxies) — GPU safe
  // ================================================
  const nodeThreeObject = (node: GraphNode & { degree?: number; density?: number }) => {
    // stars: rendered by InstancedMesh (so return null)
    if (inStarsRenderMode && currentLevelId === "star") return null as any;

    const geom = galaxyGeomRef.current;
    const pool = galaxyMatPoolRef.current;
    if (!geom || pool.length === 0) return null as any;

    const isSelected = selectedNode?.id === node.id;

    const d = (node as any).density ?? 0;
    const deg = (node as any).degree ?? 0;
    const intensityFromDeg = Math.min(1, Math.log10(deg + 2) / 2);
    const density = d > 0 ? d : intensityFromDeg;

    const levelScale =
      currentLevelId === "galaxy" ? 3.0 : currentLevelId === "star" ? 1.6 : 1.2;

    const baseR = 0.7 * levelScale;
    const intensity = 0.35 + 0.65 * density;

    const radius = isSelected
      ? (baseR + intensity * 1.1) * 1.8
      : baseR + intensity * 1.1;

    const color = galaxyTempColorRef.current;
    if (isSelected) {
      color.set(0x4ecdc4);
    } else if (currentLevelId === "galaxy") {
      // Niveau galaxy : couleur unique par galaxie
      color.copy(getGalaxyColor(String(node.id)));
    } else if (currentLevelId === "star") {
      // Niveau star (mais LOD désactive InstancedMesh) : couleur par galaxie
      const star = graphData?.starIndex.get(String(node.id));
      const galaxyId = star?.galaxy != null ? String(star.galaxy) : undefined;

      if (galaxyId !== undefined && galaxyId !== 'void') {
        color.copy(getGalaxyColor(galaxyId));
      } else {
        // Stars void : couleur par densité
        color.setHSL(0.78 - 0.3 * intensity, 1, 0.45 + 0.3 * intensity);
      }
    } else {
      // Autres niveaux : couleur par densité
      color.setHSL(0.78 - 0.3 * intensity, 1, 0.45 + 0.3 * intensity);
    }

    const opacity = isSelected ? 1.0 : 0.55 + 0.45 * intensity;

    const idx = Math.abs(hashString(idStr((node as any).id))) % pool.length;
    const mat = pool[idx];
    mat.color.copy(color);
    mat.opacity = opacity;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.setScalar(radius);
    return mesh;
  };

  // ================================================
  // LIENS — 3D safe (no rgba)
  // ================================================
  const linksVisible =
    currentLevelId === "star" ? (linksOnly ? true : shouldShowStarLinks) : true;

  const linkColor = (_link: GraphLink) => "#ffd296";

  const linkOpacityFn = (link: GraphLink) => {
    if (!linksVisible) return 0;
    const w = parseInt((link as any).relType?.replace("w", "") ?? "1", 10) || 1;
    return linksOnly ? Math.min(0.2 + w * 0.04, 0.85) : Math.min(0.08 + w * 0.01, 0.35);
  };

  const linkWidth = (link: GraphLink) => {
    const w = parseInt((link as any).relType?.replace("w", "") ?? "1", 10) || 1;
    return linksOnly ? 0.35 + w * 0.06 : 0.2 + w * 0.03;
  };

  // ================================================
  // RENDER
  // ================================================
  return (
    <div style={{ width, height, position: "relative", background: backgroundColor }}>
      <ControlPanel
        title="Map 3D"
        position="top-left"
        controls={[
          { keys: "Clic", description: "Sélectionner" },
          { keys: "Glisser", description: "Pivoter" },
          { keys: "Molette", description: "Zoomer" },
        ]}
      >
        {/* Sélecteur de niveau */}
        <div style={{ marginTop: "12px" }}>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              fontSize: "13px",
              color: "#f5f5f5",
            }}
          >
            <span style={{ opacity: 0.7 }}>Changer de niveau :</span>
            <select
              value={levels[levelIdx]?.id}
              onChange={(e) => {
                const id = e.target.value as LevelId;
                const idx = levels.findIndex((l) => l.id === id);
                if (idx >= 0) setLevelIdx(idx);
              }}
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#f5f5f5",
                borderRadius: 6,
                border: "1px solid rgba(255, 255, 255, 0.2)",
                padding: "6px 10px",
                fontSize: 13,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id} style={{ background: "#111" }}>
                  {l.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Toggle liens seuls */}
        <div style={{ marginTop: "12px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#f5f5f5",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={linksOnly}
              onChange={(e) => setLinksOnly(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Afficher uniquement les liens
          </label>
        </div>

        {/* Filtre de types de relations - niveau star uniquement */}
        {currentLevelId === "star" && (
          <RelationFilter
            enabledTypes={enabledRelationTypes}
            onToggle={toggleRelationType}
            onReset={resetRelationFilter}
          />
        )}

        {DEBUG_PANEL && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, color: "#ddd" }}>
            <div>LOD: {renderMode} (effective: {effectiveRenderMode})</div>
            <div>Stars links: {shouldShowStarLinks ? "on" : "off"} (visible: {linksVisible ? "on" : "off"})</div>
            <div>Nodes: {displayData.nodes.length}</div>
            <div>Links: {displayData.links?.length ?? 0}</div>
            <div>cameraDistance: {Number.isFinite(cameraDistance) ? cameraDistance.toFixed(1) : "∞"}</div>
            <div>radiusMean: {radiusMean.toFixed(1)}</div>
          </div>
        )}
      </ControlPanel>

      {!displayData.nodes.length ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: 14,
          }}
        >
          Aucune donnée à afficher
        </div>
      ) : (
        <ForceGraph3D
          ref={fgRef}
          width={width}
          height={height}
          backgroundColor={backgroundColor}
          graphData={displayData}
          showNavInfo={false}
          enableNodeDrag={false}
          nodeRelSize={1}
          d3AlphaDecay={1}
          d3VelocityDecay={1}
          warmupTicks={0}
          cooldownTicks={0}
          // Clic sur nœud
          onNodeClick={(node) => {
            const n = node as GraphNode;
            setSelectedNode(n);
            addExploredNode(idStr(n.id));
          }}
          // Nœuds
          nodeOpacity={linksOnly ? 0 : inStarsRenderMode ? 0 : 1}
          nodeThreeObject={
            linksOnly
              ? (() => null) as any
              : ((node: any) => {
                if (inStarsRenderMode && currentLevelId === "star") return null;
                return nodeThreeObject(node);
              }) as any
          }
          nodeLabel={(node: any) => {
            const n = node as GraphNode;
            if (inStarsRenderMode && currentLevelId === "star") return "";
            return (n as any).name ?? idStr(n.id);
          }}
          // Liens (3D safe)
          linkWidth={linkWidth as any}
          linkColor={linkColor as any}
          linkOpacity={linkOpacityFn as any}
          linkVisibility={() => linksVisible}
          linkDirectionalParticles={0}
          linkDirectionalParticleSpeed={0.01 as any}
          linkDirectionalParticleWidth={1 as any}

        />
      )}
    </div>
  );
}
