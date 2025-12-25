// src/components/graph/Map3D.tsx
// VERSION 3D — vue "toile cosmique" basée sur UniverseGraphData
// ✅ Perf: InstancedMesh stars créé une seule fois + updates ciblées
// ✅ GPU safe: plus de new Geometry/Material par node (pool galaxies)
// ✅ Liens stables: pas de rgba(), opacité via linkOpacity, linksOnly force links
// ✅ Features conservées: ControlPanel, RelationFilter, trail, LOD, downsample, mustInclude

import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { ControlPanel } from "../ui/ControlPanel";
import { RelationFilter } from "../ui/RelationFilter";
import { useAppStore } from "../../store/appStore";
import { filterGraphLinks } from "../../utils/linkFilters";
import { useLODSystem } from "../../hooks/useLODSystem";
import type {
  UniverseGraphData,
  GraphData,
  GraphNode,
  GraphLink,
  LevelId,
} from "../../types/graph";
import { galaxyDataService } from "../../services/GalaxyDataService";

interface Props {
  graphData: UniverseGraphData | null;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

// Limites de rendu
const MAX_NODES_RENDER = 20000;
const MAX_STAR_LINKS_RENDER = 10000;

// Pool matériaux galaxies (évite leak GPU)
const GALAXY_MAT_POOL_SIZE = 64;

// Debug helpers (à false en prod)
const DEBUG_PANEL = true;
const SHOW_BOUNDING_BOX_HELPER = true;

function idStr(v: any) {
  return String(v ?? "");
}
function linkEndId(v: any) {
  if (v == null) return "";
  // si ForceGraph a muté en objet node
  if (typeof v === "object") return idStr((v as any).id);
  return idStr(v);
}

function linkIdStable(link: any) {
  // source/target peuvent être ids ou objets (ForceGraph)
  const s = linkEndId(link.source);
  const t = linkEndId(link.target);
  const type = idStr(link.relType ?? link.type ?? "");
  // on canonicalise pour éviter s-t vs t-s si tu veux un id “undirected”
  const a = s < t ? s : t;
  const b = s < t ? t : s;
  return `${a}__${b}__${type}`;
}



function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function ensureIncludedNodes(
  sampledNodes: GraphNode[],
  allNodes: GraphNode[],
  mustIncludeIds: Set<string>
): GraphNode[] {
  if (!mustIncludeIds.size) return sampledNodes;

  const out = sampledNodes.slice();
  const outSet = new Set(out.map((n) => idStr(n.id)));

  const allById = new Map<string, GraphNode>();
  for (const n of allNodes) allById.set(idStr(n.id), n);

  for (const id of mustIncludeIds) {
    if (outSet.has(id)) continue;
    const n = allById.get(id);
    if (n) {
      out.push(n);
      outSet.add(id);
    }
  }
  return out;
}

function computeStarVisual(node: any, isSelected: boolean) {
  const d = node.density ?? 0;
  const deg = node.degree ?? 0;
  const intensityFromDeg = Math.min(1, Math.log10(deg + 2) / 2);
  const density = d > 0 ? d : intensityFromDeg;

  const levelScale = 1.6; // star level
  const baseR = 0.7 * levelScale;
  const intensity = 0.35 + 0.65 * density;

  const radius = isSelected
    ? (baseR + intensity * 1.1) * 1.8
    : baseR + intensity * 1.1;

  const color = new THREE.Color();
  if (isSelected) color.set(0x4ecdc4);
  else color.setHSL(0.78 - 0.3 * intensity, 1, 0.45 + 0.3 * intensity);

  const opacity = isSelected ? 1.0 : 0.55 + 0.45 * intensity;
  return { radius, color, opacity };
}

export default function Map3D({
  graphData,
  width = window.innerWidth,
  height = window.innerHeight,
  backgroundColor = "#050010",
}: Props) {
  const fgRef = useRef<any>(null);

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
  type Agent = {
    nodeId: string;
    recent: string[]; // petite mémoire anti ping-pong
  };

  const [agentLinks, setAgentLinks] = useState(true);
  const [agentCount, setAgentCount] = useState(12);
  const [agentBudget, setAgentBudget] = useState(2); // nb d’activations par tick / agent
  const [agentTtlMs, setAgentTtlMs] = useState(2500);
  const [agentStepMs, setAgentStepMs] = useState(50);

  const neighborsRef = useRef<Map<string, Array<{ to: string; linkId: string }>>>(new Map());
  const degreeRef = useRef<Map<string, number>>(new Map());

  const agentsRef = useRef<Agent[]>([]);
  const activeLinksRef = useRef<Set<string>>(new Set());
  const activeExpiryRef = useRef<Map<string, number>>(new Map());

  const currentLevelId: LevelId | undefined = levels[levelIdx]?.id;

  // ================================================
  // LOD SYSTEM
  // ================================================
  const { renderMode, shouldShowStarLinks } = useLODSystem({
    radiusMean,
    cameraDistance,
  });

  // Quand linksOnly, on force l’état stable côté rendu stars (évite bascules)
  const effectiveRenderMode =
    currentLevelId === "star" && linksOnly ? "stars" : renderMode;

  const inStarsRenderMode =
    currentLevelId === "star" && effectiveRenderMode === "stars";

  // ================================================
  // DATA NIVEAU COURANT (avant filtrage)
  // ================================================
  const rawData: GraphData | null = useMemo(() => {
    if (!levels.length) return null;
    return levels[levelIdx].data;
  }, [levels, levelIdx]);

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
      const step = Math.ceil(nodes.length / MAX_NODES_RENDER);
      let sampled = nodes.filter((_, i) => i % step === 0);

      // Garder sélection + trail même si hors sampling
      sampled = ensureIncludedNodes(sampled, nodes, mustIncludeIds);
      nodes = sampled;
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
      const forceLinks = linksOnly; // ✅ override utilisateur
      if (shouldShowStarLinks || forceLinks) {
        filteredLinks = filterGraphLinks(filteredLinks, enabledRelationTypes);

        if (filteredLinks.length > MAX_STAR_LINKS_RENDER) {
          const step = Math.ceil(filteredLinks.length / MAX_STAR_LINKS_RENDER);
          filteredLinks = filteredLinks.filter((_, i) => i % step === 0);
        }
      } else {
        filteredLinks = [];
      }
    }
    // --- ensure stable id on links (required for agent visibility) ---
    filteredLinks = filteredLinks.map((l: any) => {
      if (!l.id) l.id = linkIdStable(l);
      return l;
    });

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
        n = (galaxyDataService as any).getNodeById(sid) as GraphNode | null;
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

    // pendant debug: très conservateur
    const cap = currentLevelId === "star" ? 1 : 1.5;
    r.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, cap));
  }, [currentLevelId]);

  // ================================================
  // BOUNDING BOX + CAMERA (basé sur displayData)
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const nodes = displayData.nodes;
    if (!nodes.length) return;

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

    const levelDistanceFactor =
      currentLevelId === "galaxy" ? 5.0 : currentLevelId === "star" ? 3.5 : 2.8;

    const dist = rm * levelDistanceFactor;
    const camPos = new THREE.Vector3(c.x + dist, c.y + dist * 0.4, c.z + dist);

    fg.cameraPosition(camPos, c, 0);

    return () => {
      if (helper) scene.remove(helper);
    };
  }, [displayData.nodes, currentLevelId]);

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
  // ================================================
  const galaxyGeomRef = useRef<THREE.SphereGeometry | null>(null);
  const galaxyMatPoolRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const galaxyTempColorRef = useRef(new THREE.Color());

  useEffect(() => {
    // Shared geometry for all galaxy nodes
    galaxyGeomRef.current = new THREE.SphereGeometry(1, 12, 12);

    // Pool materials to avoid allocating per-node
    galaxyMatPoolRef.current = Array.from({ length: GALAXY_MAT_POOL_SIZE }, () => {
      return new THREE.MeshBasicMaterial({ transparent: true });
    });

    return () => {
      galaxyGeomRef.current?.dispose();
      galaxyGeomRef.current = null;

      for (const m of galaxyMatPoolRef.current) m.dispose();
      galaxyMatPoolRef.current = [];
    };
  }, []);

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

    // Reset agents / active links à chaque rebuild des liens (sinon incohérences)
    agentsRef.current = [];
    activeLinksRef.current = new Set();
    activeExpiryRef.current = new Map();
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

    const tempObj = new THREE.Object3D();
    const tempCol = new THREE.Color();

    for (let i = 0; i < stars.length; i++) {
      const node: any = stars[i];
      const isSelected = selectedNode?.id === node.id;

      const { radius, color, opacity } = computeStarVisual(node, isSelected);

      tempObj.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      tempObj.scale.setScalar(radius);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);

      tempCol.copy(color).multiplyScalar(opacity);
      mesh.setColorAt(i, tempCol);
    }

    mesh.count = stars.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [inStarsRenderMode, selectedNode]);

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
      vertexColors: true,
      transparent: true,
    });

    const capacity = Math.max(1, displayData.nodes.length);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = "instanced-stars";
    scene.add(mesh);

    starsGeomRef.current = geometry;
    starsMatRef.current = material;
    starsMeshRef.current = mesh;

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

    if (scene && mesh && mesh.instanceMatrix.count < starsSourceRef.current.length) {
      scene.remove(mesh);

      // dispose old mesh only (geometry/material are refs)
      // mesh.dispose() isn't always present; remove is enough if we dispose geom/mat separately
      const geometry = starsGeomRef.current ?? new THREE.SphereGeometry(1, 10, 10);
      const material =
        starsMatRef.current ??
        new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });

      const newMesh = new THREE.InstancedMesh(
        geometry,
        material,
        Math.max(1, starsSourceRef.current.length)
      );
      newMesh.name = "instanced-stars";
      scene.add(newMesh);
      starsMeshRef.current = newMesh;
    }

    updateStarInstances();
  }, [displayData.nodes, inStarsRenderMode, updateStarInstances]);

  // Selection update only (no rebuild)
  useEffect(() => {
    if (!inStarsRenderMode) return;
    updateStarInstances();
  }, [selectedNode, inStarsRenderMode, updateStarInstances]);

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
    if (isSelected) color.set(0x4ecdc4);
    else color.setHSL(0.78 - 0.3 * intensity, 1, 0.45 + 0.3 * intensity);

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


  useEffect(() => {
    // on active surtout quand star + liens visibles + agentLinks
    const enabled =
      currentLevelId === "star" &&
      linksVisible &&
      agentLinks &&
      (displayData.links?.length ?? 0) > 0;

    if (!enabled) return;

    const pickRandomNodeId = () => {
      const nodes = displayData.nodes as GraphNode[];
      if (!nodes.length) return "";
      const n = nodes[(Math.random() * nodes.length) | 0];
      return idStr(n.id);
    };

    const ensureAgents = () => {
      if (agentsRef.current.length === agentCount) return;

      const seed = selectedNode?.id != null ? idStr(selectedNode.id) : pickRandomNodeId();
      const next: Agent[] = [];
      for (let i = 0; i < agentCount; i++) {
        next.push({ nodeId: seed || pickRandomNodeId(), recent: [] });
      }
      agentsRef.current = next;
    };

    const chooseNext = (fromId: string, recent: string[]) => {
      const neigh = neighborsRef.current.get(fromId) ?? [];
      if (!neigh.length) return null;

      // évite retour immédiat si possible
      const recentSet = new Set(recent);
      const candidates = neigh.filter((n) => !recentSet.has(n.to));
      const pool = candidates.length ? candidates : neigh;

      // anti-hub: proba ~ 1/(1+degree)
      let sum = 0;
      const weights = pool.map((n) => {
        const d = degreeRef.current.get(n.to) ?? 0;
        const w = 1 / (1 + d);
        sum += w;
        return w;
      });

      let r = Math.random() * sum;
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i];
      }
      return pool[0];
    };

    const tick = () => {
      ensureAgents();

      const now = performance.now();
      const active = activeLinksRef.current;
      const expiry = activeExpiryRef.current;

      // purge TTL
      for (const [id, t] of expiry) {
        if (t <= now) {
          expiry.delete(id);
          active.delete(id);
        }
      }

      // move + activate
      for (const a of agentsRef.current) {
        for (let k = 0; k < agentBudget; k++) {
          const step = chooseNext(a.nodeId, a.recent);
          if (!step) {
            a.nodeId = pickRandomNodeId();
            a.recent = [];
            continue;
          }

          active.add(step.linkId);
          expiry.set(step.linkId, now + agentTtlMs);

          a.recent.push(a.nodeId);
          if (a.recent.length > 4) a.recent.shift();

          a.nodeId = step.to;
        }
      }

      fgRef.current?.refresh?.();
    };

    const handle = window.setInterval(tick, agentStepMs);
    return () => window.clearInterval(handle);
  }, [
    agentLinks,
    agentCount,
    agentBudget,
    agentTtlMs,
    agentStepMs,
    currentLevelId,
    linksVisible,
    displayData.nodes,
    displayData.links,
    selectedNode,
  ]);


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

        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f5f5", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={agentLinks}
              onChange={(e) => setAgentLinks(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Mode agents (liens explorés)
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
          linkVisibility={(link: any) => {
            if (!linksVisible) return false;
            if (currentLevelId !== "star") return true;
            if (!agentLinks) return true;

            const id = idStr(link.id ?? linkIdStable(link));
            return activeLinksRef.current.has(id);
          }}
          linkDirectionalParticles={(link: any) => {
            if (currentLevelId !== "star" || !agentLinks) return 0;
            const id = idStr(link.id ?? linkIdStable(link));
            return activeLinksRef.current.has(id) ? 2 : 0;
          }}
          linkDirectionalParticleSpeed={0.01 as any}
          linkDirectionalParticleWidth={1 as any}

        />
      )}
    </div>
  );
}
