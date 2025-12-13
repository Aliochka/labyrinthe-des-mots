// src/store/appStore.ts
import { create } from "zustand";
import type { AppMode } from "../types/mode";
import type { GraphLink } from "../types/graph"; // 👈 si tu veux suivre les liens
import type { LayoutType } from "../services/LemmaDataService";

const linkKey = (l: GraphLink) => `${l.source}-${l.target}`;

interface AppState {
    // --- mode global ---
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    toggleMode: () => void;

    // --- exploration de mots ---
    exploredNodeIds: string[];
    exploredLinkKeys: string[];

    addExploredNode: (id: string) => void;
    addExploredNodes: (ids: string[]) => void;
    addExploredLinks: (links: GraphLink[]) => void;

    resetExploration: () => void;

    // --- nœuds visibles dans Navigation (expansion BFS) ---
    visibleNavigationNodeIds: string[];
    setVisibleNavigationNodeIds: (ids: string[]) => void;

    // --- layout 3D (utilisé par Navigation + Maps 2D/3D) ---
    layout: LayoutType;
    setLayout: (layout: LayoutType) => void;

    // --- settings panel ---
    isSettingsOpen: boolean;
    toggleSettings: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
    mode: "study",

    setMode: (mode) => set({ mode }),
    toggleMode: () =>
        set((state) => ({
            mode: state.mode === "play" ? "study" : "play",
        })),

    exploredNodeIds: [],
    exploredLinkKeys: [],

    addExploredNode: (id) => {
        const { exploredNodeIds } = get();
        if (exploredNodeIds.includes(id)) return;
        set({ exploredNodeIds: [...exploredNodeIds, id] });
    },

    addExploredNodes: (ids) => {
        const { exploredNodeIds } = get();
        const setIds = new Set(exploredNodeIds);
        ids.forEach((id) => setIds.add(id));
        set({ exploredNodeIds: Array.from(setIds) });
    },

    addExploredLinks: (links) => {
        const { exploredLinkKeys } = get();
        const setKeys = new Set(exploredLinkKeys);
        links.forEach((l) => setKeys.add(linkKey(l)));
        set({ exploredLinkKeys: Array.from(setKeys) });
    },

    resetExploration: () =>
        set({
            exploredNodeIds: [],
            exploredLinkKeys: [],
            visibleNavigationNodeIds: [],
        }),

    visibleNavigationNodeIds: [],
    setVisibleNavigationNodeIds: (ids) => set({ visibleNavigationNodeIds: ids }),

    layout: "deepwalk",
    setLayout: (layout) => set({ layout }),

    isSettingsOpen: false,
    toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}));
