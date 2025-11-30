// src/components/graph/GraphView.tsx
import React from 'react';
import type { GraphSlice } from '../../types/graph';

interface GraphViewProps {
    graph: GraphSlice | null;
    highlightNodeIds?: number[]; // pour surligner certains nœuds (ex: chemin)
    title?: string;
}

export const GraphView: React.FC<GraphViewProps> = ({
    graph,
    highlightNodeIds = [],
    title,
}) => {
    if (!graph || graph.nodes.length === 0) {
        return <p>Aucun graphe à afficher.</p>;
    }

    // Taille logique du canvas (utilisée pour le layout)
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const centerNode =
        graph.nodes.find((n) => n.id === graph.centerId) ?? graph.nodes[0];

    const isHighlighted = (id: number) => highlightNodeIds.includes(id);

    // Séparation centre / autres
    const otherNodes = graph.nodes.filter((n) => n.id !== centerNode.id);

    // Disposition simple : centre au milieu, les autres sur un cercle
    const radius = Math.min(width, height) / 3;

    const positionedNodes = [
        {
            node: centerNode,
            x: centerX,
            y: centerY,
        },
        ...otherNodes.map((node, index) => {
            const angle = (index / Math.max(1, otherNodes.length)) * 2 * Math.PI;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            return { node, x, y };
        }),
    ];

    const nodePositionById = new Map<number, { x: number; y: number }>();
    for (const p of positionedNodes) {
        nodePositionById.set(p.node.id, { x: p.x, y: p.y });
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
                }}
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* Liens */}
                    {graph.edges.map((edge, index) => {
                        const fromPos = nodePositionById.get(edge.from);
                        const toPos = nodePositionById.get(edge.to);
                        if (!fromPos || !toPos) return null;

                        const edgeOnPath =
                            isHighlighted(edge.from) && isHighlighted(edge.to);

                        return (
                            <g key={index}>
                                <line
                                    x1={fromPos.x}
                                    y1={fromPos.y}
                                    x2={toPos.x}
                                    y2={toPos.y}
                                    stroke={edgeOnPath ? '#ffcc33' : '#555'}
                                    strokeWidth={edgeOnPath ? 2.5 : 1}
                                    strokeOpacity={edgeOnPath ? 0.9 : 0.7}
                                />
                                {/* petit label au milieu de l'arête */}
                                <text
                                    x={(fromPos.x + toPos.x) / 2}
                                    y={(fromPos.y + toPos.y) / 2}
                                    fill={edgeOnPath ? '#ffdd66' : '#888'}
                                    fontSize="10"
                                    textAnchor="middle"
                                >
                                    {edge.type}
                                </text>
                            </g>
                        );
                    })}

                    {/* Nœuds */}
                    {positionedNodes.map(({ node, x, y }) => {
                        const isCenter = node.id === centerNode.id;
                        const highlighted = isHighlighted(node.id);

                        const baseRadius = isCenter ? 16 : 10;
                        const radiusNode = highlighted ? baseRadius + 2 : baseRadius;

                        const fill = highlighted
                            ? '#ffcc33'
                            : isCenter
                                ? '#33aaff'
                                : '#888';

                        return (
                            <g key={node.id}>
                                {/* Halo pour les nœuds sur le chemin */}
                                {highlighted && (
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r={radiusNode + 6}
                                        fill="none"
                                        stroke="#ffcc33"
                                        strokeWidth={2}
                                        strokeOpacity={0.6}
                                    />
                                )}

                                <circle cx={x} cy={y} r={radiusNode} fill={fill} />

                                <text
                                    x={x}
                                    y={y - radiusNode - 4}
                                    fill={highlighted ? '#ffec9a' : '#f5f5f5'}
                                    fontSize="12"
                                    textAnchor="middle"
                                >
                                    {node.lemmas[0]}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};
