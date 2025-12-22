// src/components/graph/Map2D.tsx
// Vue 2D "carte cellulaire" basée sur diagrammes de Voronoi

import { useRef, useState, useMemo, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Delaunay } from "d3-delaunay";
import { ControlPanel } from "../ui/ControlPanel";
import { useAppStore } from "../../store/appStore";
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

// limites pour ne pas exploser le canvas
const MAX_NODES_2D = 15000;

// -----------------------------
// Utils de normalisation 2D
// -----------------------------
function normalizeNodesForCanvas(
    nodes: GraphNode[],
    width: number,
    height: number
): GraphNode[] {
    if (!nodes.length) return [];

    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

    for (const n of nodes) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // on remplit ~90% de la zone
    const scale =
        0.9 *
        Math.min(
            width / spanX,
            height / spanY
        );

    // clone + applique normalisation
    return nodes.map((n) => {
        const x = (n.x ?? 0) - cx;
        const y = (n.y ?? 0) - cy;
        return {
            ...n,
            x: x * scale,
            y: y * scale,
        };
    });
}

// Calcul du diagramme de Voronoi pour un niveau
const computeVoronoi = (nodes: GraphNode[], width: number, height: number) => {
    if (!nodes.length) return null;

    const points = new Float64Array(nodes.length * 2);

    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

    nodes.forEach((n, i) => {
        const x = n.x ?? 0;
        const y = n.y ?? 0;

        points[i * 2] = x;
        points[i * 2 + 1] = y;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });

    // sécurité au cas où tous les points auraient la même coordonnée en x ou y
    if (minX === maxX) {
        minX -= width / 4;
        maxX += width / 4;
    }
    if (minY === maxY) {
        minY -= height / 4;
        maxY += height / 4;
    }

    // petit padding autour du nuage de points
    const padding = Math.min(width, height) * 0.05;

    const bbox = [
        minX - padding,
        minY - padding,
        maxX + padding,
        maxY + padding,
    ] as [number, number, number, number];

    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi(bbox);

    return { voronoi, delaunay, bbox };
};


export default function Map2D({
    graphData,
    width = window.innerWidth,
    height = window.innerHeight,
    backgroundColor = "#050510",
}: Props) {
    const fgRef = useRef<any>(null);

    // ---- Exploration tracking ----
    const exploredNodeIds = useAppStore((s) => s.exploredNodeIds);
    const addExploredNode = useAppStore((s) => s.addExploredNode);

    // ================================================
    // INITIALIZE GALAXY SERVICE
    // ================================================
    useEffect(() => {
        if (graphData) {
            galaxyDataService.initialize(graphData);
        }
    }, [graphData]);

    const exploredIdSet = useMemo(
        () => new Set(exploredNodeIds.map(String)),
        [exploredNodeIds]
    );

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
    const [zoomK, setZoomK] = useState(1);
    const [isInitialized, setIsInitialized] = useState(false);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    // Niveau courant basé sur levelIdx (même logique pour Study et Play)
    const currentLevelId: LevelId | undefined = levels[levelIdx]?.id;

    // ================================================
    // DATA NIVEAU COURANT
    //   - study : niveau fractal courant
    //   - play  : niveau fractal courant (même chose, mais filtré différemment)
    // ================================================
    const rawData: GraphData | null = useMemo(() => {
        if (!levels.length) return null;

        console.log(`[Map2D/rawData] levelIdx=${levelIdx}, level=${levels[levelIdx]?.id}, nodes=${levels[levelIdx]?.data.nodes.length}`);
        return levels[levelIdx].data;
    }, [levels, levelIdx]);

    // ================================================
    // Display data with full universe (always show all nodes)
    // ================================================
    const displayData: GraphData = useMemo(() => {
        if (!rawData || !graphData) return { nodes: [], links: [] };

        const rawNodes = rawData.nodes;
        let nodes = rawNodes;

        // Downsampling global si trop de stars
        if (currentLevelId === 'star' && nodes.length > MAX_NODES_2D) {
            const step = Math.ceil(nodes.length / MAX_NODES_2D);
            nodes = nodes.filter((_, i) => i % step === 0);
            console.log(`[Map2D/star] Downsampled: ${rawNodes.length} → ${nodes.length}`);
        }

        const normalized = normalizeNodesForCanvas(nodes, width, height);
        return { nodes: normalized, links: [] };
    }, [rawData, graphData, currentLevelId, width, height]);

    // ================================================
    // CALCUL VORONOI (sur données finales)
    // ================================================
    // ================================================
    // CALCUL VORONOI (sur données finales)
    // ================================================
    const voronoiData = useMemo(() => {
        if (!displayData.nodes.length) return null;

        const result = computeVoronoi(displayData.nodes, width, height);
        if (!result) return null;

        return {
            ...result,
            nodes: displayData.nodes,
        };
    }, [displayData, width, height]);


    // ================================================
    // LOGIQUE DE ZOOM → NIVEAUX (2 niveaux: galaxy / star)
    // ================================================
    // Seuil unique :
    // - galaxy (idx 0) : zoom < 5
    // - star (idx 1) : zoom >= 5
    const ZOOM_THRESHOLD = 5;
    const lastZoomUpdate = useRef(0);

    const updateLevelFromZoom = (k: number) => {
        if (!levels.length) {
            console.warn("[updateLevelFromZoom] No levels loaded");
            return;
        }

        const newIdx = k >= ZOOM_THRESHOLD ? 1 : 0; // 0 = galaxy, 1 = star

        console.log(`[updateLevelFromZoom] k=${k.toFixed(2)}, newIdx=${newIdx}, current=${levelIdx}, threshold=${ZOOM_THRESHOLD}`);

        if (newIdx !== levelIdx) {
            const now = Date.now();
            // Throttle seulement si déjà initialisé (pour éviter trop de changements rapides)
            if (!isInitialized || now - lastZoomUpdate.current > 150) {
                lastZoomUpdate.current = now;
                setLevelIdx(newIdx);
                console.log(
                    `🔍 Zoom level changed to ${levels[newIdx]?.id} (k=${k.toFixed(2)})`
                );
            } else {
                console.log(`[updateLevelFromZoom] Throttled (too soon)`);
            }
        } else {
            console.log(`[updateLevelFromZoom] Level unchanged`);
        }
    };

    const handleZoom = (transform: { k: number }) => {
        const k = transform.k;
        console.log("ZOOM EVENT >>> k =", k, "isInitialized=", isInitialized);

        setZoomK((prev) => (Math.abs(prev - k) > 0.05 ? k : prev));
        updateLevelFromZoom(k);
    };

    // ================================================
    // FADE-IN AU DÉMARRAGE + INITIALISATION
    // ================================================
    useEffect(() => {
        const fg = fgRef.current;
        if (!fg) return;

        // Attendre que les données soient présentes
        if (displayData.nodes.length === 0) return;

        // Ne pas réinitialiser si déjà fait
        if (isInitialized) return;

        const canvas: HTMLCanvasElement | null =
            fg?.canvas ?? fg?.ctx?.canvas ?? null;
        if (!canvas) return;

        canvas.style.opacity = "0";
        canvas.style.transition = "opacity 0.6s ease-out";

        const initTimer = setTimeout(() => {
            // Forcer le zoom initial à 0.8 (zone supercluster)
            if (fg.zoom) {
                fg.zoom(0.8);
                console.log("[Map2D] Zoom initial forcé à 0.8 (supercluster)");
            }
            setIsInitialized(true);
            console.log("[Map2D] Initialized! isInitialized=true, nodes=", displayData.nodes.length);
        }, 300);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvas.style.opacity = "1";
            });
        });

        return () => clearTimeout(initTimer);
    }, [displayData.nodes.length, isInitialized]);

    // ================================================
    // CELLULES VORONOI
    // ================================================
    const drawVoronoiCell = (
        node: GraphNode & { density?: number },
        ctx: CanvasRenderingContext2D,
        globalScale: number,
        nodeIndex: number,
        isExplored: boolean
    ) => {
        if (!voronoiData?.voronoi) return;

        const { voronoi, delaunay, nodes: voronoiNodes } = voronoiData;
        const k = Math.max(0.25, Math.min(globalScale, 4));

        const isSelected = selectedNode?.id === node.id;

        const degree = (node as any).degree ?? 0;
        const maxDegree = 500;
        const importance = Math.min(degree / maxDegree, 1);

        // Opacité globale plus forte
        let cellAlpha = 0.18 + importance * 0.55;
        if (k > 1.5) cellAlpha *= 1.25;
        if (k > 3) cellAlpha *= 1.4;
        if (isExplored) cellAlpha *= 1.1;
        cellAlpha = Math.min(cellAlpha, 0.9);

        // Palette plus lumineuse
        let hue = 210 - importance * 50;
        let sat = 55 + importance * 30;
        let light = 45 + importance * 25;

        if (isExplored) {
            light += 10;
            sat += 10;
        }

        if (isSelected) {
            hue = 180;
            sat = 100;
            light = 60;
        }

        const cellPath = voronoi.renderCell(nodeIndex);
        if (!cellPath) return;

        ctx.save();
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${cellAlpha})`;

        if (isSelected || isExplored) {
            ctx.strokeStyle = `rgba(76, 205, 196, 0.9)`;
            ctx.lineWidth = isSelected ? 3 : 2;
        } else {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + importance * 0.25})`;
            ctx.lineWidth = 0.7 + importance * 1.5;
        }

        const path = new Path2D(cellPath);
        ctx.fill(path);
        ctx.stroke(path);
        ctx.restore();

        // Rayon approximatif via voisins
        const baseNodes = voronoiNodes ?? displayData.nodes;
        const neighbors = Array.from(delaunay.neighbors(nodeIndex));
        let minDist = Infinity;

        for (const neighbor of neighbors) {
            const neighborNode = baseNodes[neighbor];
            if (!neighborNode || neighborNode.x == null || neighborNode.y == null) {
                continue;
            }

            const dx = neighborNode.x - node.x!;
            const dy = neighborNode.y - node.y!;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) minDist = dist;
        }

        const cellRadius = minDist < Infinity ? minDist / 2 : 50;

        // Label
        const label = node.name ?? String(node.id);
        const baseSize = 10 + importance * 10;
        const fontSize = Math.max(baseSize, Math.min(32, cellRadius / 2));

        ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(label).width;
        const canFitText = textWidth < cellRadius * 2.2;

        if (isExplored || isSelected || canFitText) {
            ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Sans-Serif`;
            ctx.fillStyle = isSelected
                ? `rgba(255, 255, 255, 0.98)`
                : isExplored
                    ? `rgba(255, 255, 255, 0.85)`
                    : `rgba(255, 255, 255, ${0.65 + importance * 0.35})`;

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (isSelected || isExplored) {
                ctx.shadowColor = "rgba(0,0,0,0.85)";
                ctx.shadowBlur = 8;
            }

            ctx.fillText(label, node.x!, node.y!);
        }
    };

    const drawLink = (_link: GraphLink, _ctx: CanvasRenderingContext2D) => { };

    // ================================================
    // GESTION DU CLIC
    // ================================================
    const handleNodeClick = (node: any) => {
        const n = node as GraphNode;
        setSelectedNode(n);
        addExploredNode(String(n.id));
    };

    // ================================================
    // RENDER
    // ================================================
    return (
        <div
            style={{
                width,
                height,
                background: backgroundColor,
                position: "relative",
            }}
        >
            <ControlPanel
                title="Map 2D"
                position="top-left"
                controls={[
                    { keys: 'Clic', description: 'Sélectionner' },
                    { keys: 'Molette', description: 'Zoomer' },
                    { keys: 'Glisser', description: 'Naviguer' },
                ]}
            >
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                        Niveau: <span style={{ color: '#4ecdc4' }}>{currentLevelId ?? '—'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                        Zoom: <span style={{ color: '#4ecdc4' }}>{zoomK.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>
                        Cellules: <span style={{ color: '#4ecdc4' }}>{displayData.nodes.length}</span>
                    </div>
                    {selectedNode && (
                        <div style={{ marginTop: 8, padding: 8, background: 'rgba(78,205,196,0.1)', borderRadius: 4 }}>
                            <div style={{ fontSize: 11, color: '#4ecdc4', fontWeight: 600 }}>
                                {selectedNode.name ?? String(selectedNode.id)}
                            </div>
                            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                                {(selectedNode as any).degree ?? 0} connexions
                            </div>
                        </div>
                    )}
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
                    Aucune donnée à afficher
                </div>
            ) : (
            <ForceGraph2D
                ref={fgRef}
                width={width}
                height={height}
                backgroundColor={backgroundColor}
                graphData={displayData}
                onZoom={handleZoom}
                onNodeClick={handleNodeClick}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    if (!voronoiData?.voronoi) return;

                    const idx = displayData.nodes.findIndex(
                        (n) => n.id === (node as any).id
                    );
                    if (idx < 0) return;

                    const isExplored = exploredIdSet.has(String((node as any).id));

                    try {
                        drawVoronoiCell(
                            node as any,
                            ctx,
                            globalScale,
                            idx,
                            isExplored
                        );
                    } catch (err) {
                        console.warn("Voronoi draw error:", err);
                    }
                }}
                nodePointerAreaPaint={(node, color, ctx) => {
                    if (!voronoiData?.voronoi) return;

                    const idx = displayData.nodes.findIndex(
                        (n) => n.id === (node as any).id
                    );
                    if (idx < 0) return;

                    const cellPath = voronoiData.voronoi.renderCell(idx);
                    if (!cellPath) return;

                    ctx.fillStyle = color;
                    const path = new Path2D(cellPath);
                    ctx.fill(path);
                }}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={drawLink}
                d3AlphaDecay={1}
                d3VelocityDecay={1}
                enableNodeDrag={false}
                warmupTicks={0}
                cooldownTicks={0}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                minZoom={0.5}
                maxZoom={20}
            />
            )}
        </div>
    );
}
