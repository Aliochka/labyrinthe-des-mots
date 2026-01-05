// src/components/graph/Map2D/Map2D.tsx
// Vue 2D "carte cellulaire" basée sur diagrammes de Voronoi
// Architecture modulaire avec machine à états pour exploration de galaxies

import { useRef, useState, useMemo, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ControlPanel } from "../../ui/ControlPanel";
import { useAppStore } from "../../../store/appStore";
import type {
    UniverseGraphData,
    GraphData,
    GraphNode,
    GraphLink,
} from "../../../types/graph";
import { galaxyDataService } from "../../../services/GalaxyDataService";

// Utilities and hooks
import { normalizeNodesForCanvas } from "./utils/normalize";
import { drawVoronoiCell, type VoronoiDrawContext } from "./utils/drawVoronoi";
import { filterStarsByGalaxy } from "./utils/filterStars";
import { useVoronoiDiagram } from "./hooks/useVoronoiDiagram";
import { useViewState } from "./hooks/useViewState";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { MAX_NODES_2D } from "./constants";

interface Props {
    graphData: UniverseGraphData | null;
    width?: number;
    height?: number;
    backgroundColor?: string;
}

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

    const exploredIdSet = useMemo(
        () => new Set(exploredNodeIds.map(String)),
        [exploredNodeIds]
    );

    // ================================================
    // INITIALIZE GALAXY SERVICE
    // ================================================
    useEffect(() => {
        if (graphData) {
            galaxyDataService.initialize(graphData);
        }
    }, [graphData]);

    // ================================================
    // VIEW STATE MACHINE (3 modes)
    // ================================================
    const {
        mode,
        selectedGalaxy,
        setSelectedGalaxy,
        enterGalaxyStars,
        returnToAllGalaxies,
    } = useViewState(fgRef);

    // ================================================
    // KEYBOARD CONTROLS (SPACE / ESC)
    // ================================================
    useKeyboardControls({
        onSpace: () => {
            if (mode === 'galaxy-selected' && selectedGalaxy) {
                console.log('[Map2D] SPACE pressed → entering galaxy-stars mode');
                enterGalaxyStars();
            } else if (mode === 'galaxy-selected') {
                console.warn('[Map2D] SPACE pressed but no galaxy selected');
            } else {
                console.log('[Map2D] SPACE pressed in mode:', mode);
            }
        },
        onEscape: () => {
            if (mode === 'galaxy-stars') {
                console.log('[Map2D] ESC pressed → returning to all-galaxies');
                returnToAllGalaxies();
            } else {
                console.log('[Map2D] ESC pressed in mode:', mode);
            }
        },
    });

    // ================================================
    // SELECTED STAR (when clicking in galaxy-stars mode)
    // ================================================
    const [selectedStar, setSelectedStar] = useState<GraphNode | null>(null);

    // ================================================
    // DATA DISPLAY (ViewMode-driven)
    // ================================================
    const displayData: GraphData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };

        // Mode 1 & 2: Afficher toutes les galaxies
        if (mode === 'all-galaxies' || mode === 'galaxy-selected') {
            const galaxies = graphData.galaxies.nodes;
            const normalized = normalizeNodesForCanvas(galaxies, width, height);
            console.log(`[Map2D/${mode}] Displaying ${normalized.length} galaxies`);
            return { nodes: normalized, links: [] };
        }

        // Mode 3: Afficher UNIQUEMENT les étoiles de la galaxie sélectionnée
        if (mode === 'galaxy-stars' && selectedGalaxy) {
            const stars = filterStarsByGalaxy(
                graphData.stars.nodes,
                String(selectedGalaxy.id),
                galaxyDataService,
                MAX_NODES_2D
            );

            const normalized = normalizeNodesForCanvas(stars, width, height);
            console.log(`[Map2D/galaxy-stars] Galaxy ${selectedGalaxy.id}: ${normalized.length} stars`);
            return { nodes: normalized, links: [] };
        }

        console.warn('[Map2D/displayData] Unexpected state:', { mode, selectedGalaxy });
        return { nodes: [], links: [] };
    }, [mode, selectedGalaxy, graphData, width, height]);

    // ================================================
    // CALCUL VORONOI (sur données finales)
    // ================================================
    const voronoiData = useVoronoiDiagram(displayData.nodes, width, height);

    // ================================================
    // FADE-IN AU DÉMARRAGE + INITIALISATION
    // ================================================
    const [isInitialized, setIsInitialized] = useState(false);

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
            // Forcer le zoom initial à 1.0
            if (fg.zoom) {
                fg.zoom(1.0);
                console.log("[Map2D] Zoom initial forcé à 1.0");
            }
            setIsInitialized(true);
            console.log("[Map2D] Initialized! nodes=", displayData.nodes.length);
        }, 300);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                canvas.style.opacity = "1";
            });
        });

        return () => clearTimeout(initTimer);
    }, [displayData.nodes.length, isInitialized]);

    const drawLink = (_link: GraphLink, _ctx: CanvasRenderingContext2D) => { };

    // ================================================
    // GESTION DU CLIC
    // ================================================
    const handleNodeClick = (node: any) => {
        const n = node as GraphNode;

        if (mode === 'all-galaxies') {
            // Clic sur galaxie → mode galaxy-selected
            console.log('[Map2D] Galaxy clicked:', n.id, n.name);
            setSelectedGalaxy(n);
            addExploredNode(String(n.id));
        } else if (mode === 'galaxy-selected') {
            // Re-clic sur même galaxie ou autre galaxie
            if (n.id === selectedGalaxy?.id) {
                console.log('[Map2D] Same galaxy clicked, use SPACE to explore');
            } else {
                console.log('[Map2D] Different galaxy clicked:', n.id, n.name);
                setSelectedGalaxy(n);
                addExploredNode(String(n.id));
            }
        } else if (mode === 'galaxy-stars') {
            // Clic sur étoile → sélectionner l'étoile
            console.log('[Map2D] Star clicked:', n.id, n.name);
            setSelectedStar(n);
            addExploredNode(String(n.id));
        }
    };

    // ================================================
    // NODE SELECTION (for Voronoi highlight)
    // ================================================
    const selectedNode = mode === 'galaxy-stars' ? selectedStar : selectedGalaxy;

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
                controls={
                    mode === 'all-galaxies'
                        ? [
                            { keys: 'Clic', description: 'Sélectionner galaxie' },
                            { keys: 'Molette', description: 'Zoomer' },
                            { keys: 'Glisser', description: 'Naviguer' },
                        ]
                        : mode === 'galaxy-selected'
                            ? [
                                { keys: 'ESPACE', description: 'Explorer galaxie' },
                                { keys: 'Clic', description: 'Autre galaxie' },
                                { keys: 'Molette', description: 'Zoomer' },
                            ]
                            : [
                                { keys: 'ESC', description: 'Retour galaxies' },
                                { keys: 'Clic', description: 'Sélectionner étoile' },
                                { keys: 'Molette', description: 'Zoomer' },
                            ]
                }
            >
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {/* Mode all-galaxies */}
                    {mode === 'all-galaxies' && (
                        <>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                Mode: <span style={{ color: '#4ecdc4' }}>Vue Macro</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#999' }}>
                                Galaxies: <span style={{ color: '#4ecdc4' }}>{displayData.nodes.length}</span>
                            </div>
                        </>
                    )}

                    {/* Mode galaxy-selected */}
                    {mode === 'galaxy-selected' && selectedGalaxy && (
                        <>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                Mode: <span style={{ color: '#4ecdc4' }}>Galaxie Sélectionnée</span>
                            </div>
                            <div style={{ marginTop: 8, padding: 8, background: 'rgba(78,205,196,0.15)', borderRadius: 4 }}>
                                <div style={{ fontSize: 12, color: '#4ecdc4', fontWeight: 600, marginBottom: 4 }}>
                                    {selectedGalaxy.name ?? String(selectedGalaxy.id)}
                                </div>
                                <div style={{ fontSize: 10, color: '#aaa' }}>
                                    {galaxyDataService.getGalaxyMembers(String(selectedGalaxy.id)).length} étoiles
                                </div>
                                <div style={{ fontSize: 9, color: '#888', marginTop: 6, fontStyle: 'italic' }}>
                                    Appuyez sur ESPACE pour explorer
                                </div>
                            </div>
                        </>
                    )}

                    {/* Mode galaxy-stars */}
                    {mode === 'galaxy-stars' && selectedGalaxy && (
                        <>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                Mode: <span style={{ color: '#4ecdc4' }}>Exploration</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                Galaxie: <span style={{ color: '#4ecdc4' }}>{selectedGalaxy.name ?? String(selectedGalaxy.id)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                                Étoiles: <span style={{ color: '#4ecdc4' }}>{displayData.nodes.length}</span>
                            </div>
                            {selectedStar && (
                                <div style={{ marginTop: 8, padding: 8, background: 'rgba(78,205,196,0.1)', borderRadius: 4 }}>
                                    <div style={{ fontSize: 11, color: '#4ecdc4', fontWeight: 600 }}>
                                        {selectedStar.name ?? String(selectedStar.id)}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                                        {(selectedStar as any).degree ?? 0} connexions
                                    </div>
                                </div>
                            )}
                            <div style={{ fontSize: 9, color: '#888', marginTop: 8, fontStyle: 'italic' }}>
                                ESC pour retour macro
                            </div>
                        </>
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
                    onNodeClick={handleNodeClick}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        if (!voronoiData?.voronoi) return;

                        const idx = displayData.nodes.findIndex(
                            (n) => n.id === (node as any).id
                        );
                        if (idx < 0) return;

                        // Create draw context
                        const drawContext: VoronoiDrawContext = {
                            voronoiData,
                            selectedNode,
                            exploredIdSet,
                            displayNodes: displayData.nodes,
                            starIndex: graphData?.starIndex ?? new Map(),
                        };

                        try {
                            drawVoronoiCell(
                                node as any,
                                ctx,
                                globalScale,
                                idx,
                                drawContext
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
