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
import { RelationFilter } from "../ui/RelationFilter";
import { useAppStore } from "../../store/appStore"; // <<< 🔥 MODE GLOBAL
import { filterGraphLinks } from "../../utils/linkFilters";
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

// Limite dure pour ne pas tuer le GPU
const MAX_NODES_2D = 15000;


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
    if (graphData) {
      galaxyDataService.initialize(graphData);
    }
  }, [graphData]);

  // ================================================
  // NIVEAUX (2 niveaux: galaxy + star)
  // ================================================
  const levels = useMemo(() => {
    if (!graphData) return [];
    return [
      { id: 'galaxy' as LevelId, data: graphData.galaxies },
      { id: 'star' as LevelId, data: graphData.stars },
    ];
  }, [graphData]);

  const [levelIdx, setLevelIdx] = useState(0);
  const [linksOnly, setLinksOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const currentLevelId: LevelId | undefined = levels[levelIdx]?.id;

  // ================================================
  // DATA NIVEAU COURANT (avant filtrage)
  // ================================================
  const rawData: GraphData | null = useMemo(() => {
    if (!levels.length) return null;
    return levels[levelIdx].data;
  }, [levels, levelIdx]);

  // ================================================
  // Display data with full universe (always show all nodes)
  // ================================================
  const displayData: GraphData = useMemo(() => {
    if (!rawData || !graphData) return { nodes: [], links: [] };

    const rawNodes = rawData.nodes;
    const rawLinks = rawData.links || [];
    let nodes = rawNodes;

    // Downsampling global si trop de stars
    if (currentLevelId === 'star' && nodes.length > MAX_NODES_2D) {
      const step = Math.ceil(nodes.length / MAX_NODES_2D);
      nodes = nodes.filter((_, i) => i % step === 0);
      console.log(`[Map3D/star] Downsampled: ${rawNodes.length} → ${nodes.length}`);
    }

    // Filtrer les liens pour ne garder que ceux entre nœuds visibles
    const nodeIdSet = new Set(nodes.map(n => String(n.id)));
    let filteredLinks = rawLinks.filter(link =>
      nodeIdSet.has(String(link.source)) && nodeIdSet.has(String(link.target))
    );

    // Appliquer le filtrage par type de relation (niveau star uniquement)
    if (currentLevelId === 'star') {
      filteredLinks = filterGraphLinks(filteredLinks, enabledRelationTypes);
    }

    return { nodes, links: filteredLinks };
  }, [rawData, graphData, currentLevelId, enabledRelationTypes]);

  // ================================================
  // PATH VISUALIZATION - Discovery trail
  // ================================================
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const scene: THREE.Scene = fg.scene();

    // Remove old path if exists
    const oldPath = scene.getObjectByName('discovery-path');
    if (oldPath) {
      scene.remove(oldPath);
      if (oldPath instanceof THREE.Mesh) {
        oldPath.geometry.dispose();
        if (Array.isArray(oldPath.material)) {
          oldPath.material.forEach(m => m.dispose());
        } else {
          oldPath.material.dispose();
        }
      }
    }

    // Show path only if at least 2 words discovered
    if (visibleNavigationNodeIds.length < 2) return;

    // Get positions from displayData
    const pathPoints: THREE.Vector3[] = [];

    for (const nodeId of visibleNavigationNodeIds) {
      const node = displayData.nodes.find(n => String(n.id) === String(nodeId));
      if (node && node.x != null && node.y != null && node.z != null) {
        pathPoints.push(new THREE.Vector3(node.x, node.y, node.z));
      }
    }

    if (pathPoints.length < 2) return;

    // Create smooth path with CatmullRomCurve3
    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      pathPoints.length * 5, // segments
      0.3,  // radius
      8,    // radial segments
      false // closed
    );

    // Cyan semi-transparent material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff, // Cyan
      transparent: true,
      opacity: 0.6,
    });

    const pathMesh = new THREE.Mesh(tubeGeometry, material);
    pathMesh.name = 'discovery-path';

    scene.add(pathMesh);

    console.log(`[Map3D] Path trail rendered with ${pathPoints.length} points`);

    // Cleanup
    return () => {
      scene.remove(pathMesh);
      tubeGeometry.dispose();
      material.dispose();
    };
  }, [visibleNavigationNodeIds, displayData]);

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

    // Always use displayData for bounding box and camera
    const nodesForBoundingBox = displayData.nodes;

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
      currentLevelId === "galaxy" ? 5.0 :
        currentLevelId === "star" ? 3.5 :
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
  }, [displayData, currentLevelId, rawData]);

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
      currentLevelId === "galaxy" ? 3.0 :
        currentLevelId === "star" ? 1.6 :
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
      currentLevelId === "galaxy" ? 0.22 :
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

        {/* Filtre de types de relations - niveau star uniquement */}
        {currentLevelId === 'star' && (
          <RelationFilter
            enabledTypes={enabledRelationTypes}
            onToggle={toggleRelationType}
            onReset={resetRelationFilter}
          />
        )}
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
          // 🎯 Clic sur nœud
          onNodeClick={(node) => {
            const n = node as GraphNode;
            setSelectedNode(n);
            addExploredNode(String(n.id));
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
