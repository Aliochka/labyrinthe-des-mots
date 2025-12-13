// src/components/graph/Map3D.tsx
// VERSION 3D — vue "toile cosmique" basée sur le MultiScaleGraph
// avec toggle pour mode "liens seuls" et intégration des modes Play / Study.

import {
  useRef,
  useState,
  useMemo,
  useEffect,
} from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { ControlPanel } from "../ui/ControlPanel";
import { useAppStore } from "../../store/appStore"; // <<< 🔥 MODE GLOBAL
import type {
  MultiScaleGraph,
  GraphData,
  GraphNode,
  GraphLink,
} from "../../types/graph";

interface Props {
  graph: MultiScaleGraph | null;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

type LevelId = "supercluster" | "cluster" | "galaxy" | "planet";

// Limite dure pour ne pas tuer le GPU
const MAX_NODES_2D = 15000;


export default function Map3D({
  graph,
  width = window.innerWidth,
  height = window.innerHeight,
  backgroundColor = "#050010",
}: Props) {
  const fgRef = useRef<any>(null);

  // ================================================
  // MODE GLOBAL (play / study) + exploration
  // ================================================
  const mode = useAppStore((s) => s.mode);
  const exploredNodeIds = useAppStore((s) => s.exploredNodeIds);
  const visibleNavigationNodeIds = useAppStore((s) => s.visibleNavigationNodeIds);
  const addExploredNode = useAppStore((s) => s.addExploredNode);

  // ================================================
  // NIVEAUX FRACTAUX + MODE D'AFFICHAGE
  // ================================================
  const levels = graph?.levels ?? [];
  const [levelIdx, setLevelIdx] = useState(0);
  const [zoomK, setZoomK] = useState(1); // pure info visuelle
  const [linksOnly, setLinksOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const currentLevelId: LevelId | undefined = levels[levelIdx]?.id as LevelId | undefined;

  // ================================================
  // DATA NIVEAU COURANT (avant filtrage)
  // ================================================
  const rawData: GraphData | null = useMemo(() => {
    if (!levels.length) return null;
    return levels[levelIdx].data;
  }, [levels, levelIdx]);

  // ================================================
  // 🔥 MODE PLAY / STUDY — filtrage + downsample
  // ================================================
  const displayData: GraphData = useMemo(() => {
    if (!rawData) return { nodes: [], links: [] };

    let rawNodes = rawData.nodes;

    // --- MODE STUDY : on montre tout le niveau courant (avec downsample) ---
    if (mode === "study") {
      if (rawNodes.length > MAX_NODES_2D) {
        const step = Math.ceil(rawNodes.length / MAX_NODES_2D);
        rawNodes = rawNodes.filter((_, i) => i % step === 0);
      }
      return { nodes: rawNodes, links: [] };
    }

    // --- MODE PLAY : montrer les nœuds visibles de Navigation ---
    if (!visibleNavigationNodeIds.length) {
      // Rien encore visible dans Navigation → rien à afficher
      return { nodes: [], links: [] };
    }

    const visibleSet = new Set(visibleNavigationNodeIds.map(String));

    // Si on est au niveau planet, on affiche les nœuds visibles de Navigation
    if (currentLevelId === "planet") {
      const nodes = rawNodes.filter((n) =>
        visibleSet.has(String(n.id))
      );

      console.log(`[Map3D/play/planet] ${nodes.length} nœuds visibles (sur ${visibleNavigationNodeIds.length} dans Navigation)`);

      return { nodes, links: [] };
    }

    // Sinon (supercluster/cluster/galaxy) : filtrer les clusters contenant des nœuds visibles
    const filteredClusters = rawNodes.filter((cluster) => {
      const members = cluster.members ?? [];
      // Garder le cluster si au moins un de ses membres est visible dans Navigation
      return members.some((memberId) => visibleSet.has(String(memberId)));
    });

    console.log(
      `[Map3D/play/${currentLevelId}] ${filteredClusters.length} clusters contiennent des nœuds visibles (sur ${rawNodes.length} total)`
    );

    return { nodes: filteredClusters, links: [] };
  }, [rawData, mode, visibleNavigationNodeIds, currentLevelId]);


  // ================================================
  // LECTURE DU "ZOOM" À PARTIR DE LA CAMÉRA (info)
  // ================================================
  useEffect(() => {
    const id = window.setInterval(() => {
      const fg = fgRef.current;
      if (!fg) return;

      const cam: THREE.PerspectiveCamera = fg.camera();
      const dist = cam.position.length() || 1;
      const k = 1000 / dist;

      setZoomK((prev) => (Math.abs(prev - k) > 0.02 ? k : prev));
    }, 300);

    return () => window.clearInterval(id);
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
      requestAnimationFrame(() => {
        canvas.style.opacity = "1";
      });
    });
  }, []);

  // ================================================
  // CUBE / BOUNDING BOX + CAMERA BASÉE SUR RAYON MOYEN
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // 🆕 En mode Play : utiliser rawData pour bounding box et caméra
    // En mode Study : utiliser displayData (comportement actuel)
    const nodesForBoundingBox = mode === "play" && rawData
      ? rawData.nodes
      : displayData.nodes;

    if (!nodesForBoundingBox.length) return;

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

    nodesForBoundingBox.forEach((n) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const z = n.z ?? 0;

      sumX += x;
      sumY += y;
      sumZ += z;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    });

    const nodeCount = nodesForBoundingBox.length || 1;

    const center = new THREE.Vector3(
      sumX / nodeCount,
      sumY / nodeCount,
      sumZ / nodeCount
    );

    let distSum = 0;
    nodesForBoundingBox.forEach((n) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const z = n.z ?? 0;
      const dx = x - center.x;
      const dy = y - center.y;
      const dz = z - center.z;
      distSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
    });
    let radiusMean = distSum / nodeCount;
    if (!isFinite(radiusMean) || radiusMean <= 0) radiusMean = 1;

    const box = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    );
    const helper = new THREE.Box3Helper(box, new THREE.Color(1, 0.4, 0.1));
    scene.add(helper);

    const levelDistanceFactor =
      currentLevelId === "galaxie" ? 6.0 :
        currentLevelId === "constellation" ? 5.0 :
          currentLevelId === "amas" ? 4.0 :
            currentLevelId === "continent" ? 3.5 :
              currentLevelId === "pays" ? 3.0 :
                2.8;

    const dist = radiusMean * levelDistanceFactor;

    const camPos = new THREE.Vector3(
      center.x + dist,
      center.y + dist * 0.4,
      center.z + dist
    );

    fg.cameraPosition(camPos, center, 0);

    return () => {
      scene.remove(helper);
    };
  }, [displayData, currentLevelId, mode, rawData]);

  // ================================================
  // STYLE DES NOEUDS (étoiles / galaxies)
  // ================================================
  const nodeThreeObject = (
    node: GraphNode & { degree?: number; density?: number }
  ) => {
    const isSelected = selectedNode?.id === node.id;

    const d = node.density ?? 0;
    const deg = node.degree ?? 0;
    const intensityFromDeg = Math.min(1, Math.log10(deg + 2) / 2);
    const density = d > 0 ? d : intensityFromDeg;

    const levelScale =
      currentLevelId === "galaxie" ? 3.5 :
        currentLevelId === "constellation" ? 3.0 :
          currentLevelId === "amas" ? 2.3 :
            currentLevelId === "continent" ? 1.8 :
              currentLevelId === "pays" ? 1.4 :
                1.2;

    const baseR = 0.7 * levelScale;
    const intensity = 0.35 + 0.65 * density;

    const radius = isSelected
      ? (baseR + intensity * 1.1) * 1.8
      : (baseR + intensity * 1.1);

    const geo = new THREE.SphereGeometry(
      radius,
      isSelected ? 16 : 10,
      isSelected ? 16 : 10
    );

    const color = isSelected
      ? new THREE.Color(0x4ecdc4)
      : new THREE.Color().setHSL(
        0.78 - 0.30 * intensity,
        1,
        0.45 + 0.30 * intensity
      );

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isSelected ? 1.0 : 0.55 + 0.45 * intensity,
    });

    return new THREE.Mesh(geo, mat);
  };

  // ================================================
  // STYLE DES LIENS
  // ================================================
  const baseLinkColor = (link: GraphLink) => {
    const w = parseInt(link.relType?.replace("w", "") ?? "1", 10) || 1;

    const baseAlpha =
      currentLevelId === "galaxie" ? 0.25 :
        currentLevelId === "constellation" ? 0.22 :
          currentLevelId === "amas" ? 0.18 :
            0.12;

    const alpha = Math.min(baseAlpha + w * 0.01, 0.4);
    return `rgba(255,210,150,${alpha})`;
  };

  const linkColor = (link: GraphLink) => {
    if (!linksOnly) return baseLinkColor(link);
    const w = parseInt(link.relType?.replace("w", "") ?? "1", 10) || 1;
    const alpha = Math.min(0.18 + w * 0.04, 0.6);
    return `rgba(255,230,200,${alpha})`;
  };

  const linkWidth = (link: GraphLink) => {
    const w = parseInt(link.relType?.replace("w", "") ?? "1", 10) || 1;
    return linksOnly ? 0.35 + w * 0.06 : 0.2 + w * 0.03;
  };

  // ================================================
  // RENDER
  // ================================================
  return (
    <div style={{ width, height, position: "relative", background: backgroundColor }}>
      {/* Control Panel */}
      <ControlPanel
        title="Map 3D"
        position="top-left"
        controls={[
          { keys: 'Clic', description: 'Sélectionner' },
          { keys: 'Glisser', description: 'Pivoter' },
          { keys: 'Molette', description: 'Zoomer' },
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
      </ControlPanel>

      {!displayData.nodes.length ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: 14,
          }}
        >
          {mode === 'play' ? 'Explorez des mots dans Navigation pour les voir ici' : 'Aucune donnée à afficher'}
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
        // 🎯 Clic sur nœud
        onNodeClick={(node) => {
          const n = node as GraphNode;
          setSelectedNode(n);

          // 🔥 Mode Play → on enregistre l'exploration
          if (mode === "play") {
            addExploredNode(String(n.id));
          }
        }}
        // 🎯 Nœuds visibles uniquement si !linksOnly
        nodeOpacity={linksOnly ? 0 : 1}
        nodeThreeObject={
          linksOnly ? (() => null) as any : (nodeThreeObject as any)
        }
        // 🎯 Liens : style spécial en mode "liens seuls"
        linkWidth={linkWidth as any}
        linkOpacity={linksOnly ? 0.5 : 0.18}
        linkColor={linkColor as any}
      />
      )}
    </div>
  );
}
