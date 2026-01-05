// src/store/appStore.ts
import { create } from "zustand";
import { Vector3 } from "three";
import type { GraphLink } from "../types/graph";
import { getDefaultEnabledRelations } from "../constants/relationTypes";

const linkKey = (l: GraphLink) => `${l.source}-${l.target}`;

// Version du store pour gérer les migrations
const STORE_VERSION = 3;

interface AppState {
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

    // --- Navigation player position (persisted between view switches) ---
    navigationPlayerPosition: Vector3 | null;
    setNavigationPlayerPosition: (pos: Vector3) => void;

    // --- settings panel ---
    isSettingsOpen: boolean;
    toggleSettings: () => void;

    // --- relation filtering ---
    enabledRelationTypes: Set<string>;
    toggleRelationType: (relationType: string) => void;
    setEnabledRelationTypes: (types: Set<string>) => void;
    resetRelationFilter: () => void;

    // --- versioning & migration ---
    storeVersion: number;
    migrateStore: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
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

    navigationPlayerPosition: null,
    setNavigationPlayerPosition: (pos) => set({ navigationPlayerPosition: pos }),

    isSettingsOpen: false,
    toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

    enabledRelationTypes: getDefaultEnabledRelations(),

    toggleRelationType: (relationType) => {
        const { enabledRelationTypes } = get();
        const next = new Set(enabledRelationTypes);
        if (next.has(relationType)) {
            next.delete(relationType);
        } else {
            next.add(relationType);
        }
        set({ enabledRelationTypes: next });
    },

    setEnabledRelationTypes: (types) => set({ enabledRelationTypes: types }),

    resetRelationFilter: () =>
        set({ enabledRelationTypes: getDefaultEnabledRelations() }),

    // --- versioning & migration ---
    storeVersion: STORE_VERSION,

    migrateStore: () => {
        const currentVersion = get().storeVersion;

        // Migration v1 → v2 (suppression multiscale + layout)
        if (currentVersion < 2) {
            console.log('[Migration] Migrating store from v1 to v2...');

            // Nettoyer l'ancien système de layout
            if (typeof window !== 'undefined') {
                localStorage.removeItem('layout');

                // Supprimer les refs multiscale
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.includes('multiscale') || key.includes('levelIdx') || key.includes('layout')) {
                        console.log(`[Migration] Removing legacy key: ${key}`);
                        localStorage.removeItem(key);
                    }
                });
            }

            // Mettre à jour la version
            set({ storeVersion: 2 });

            console.log('[Migration] ✓ Store migrated to v2 (universe.json)');
        }

        // Migration v2 → v3 (nouvelle catégorisation des relations)
        if (currentVersion < 3) {
            console.log('[Migration] Migrating store from v2 to v3...');

            // Réinitialiser les filtres de relations avec les nouvelles catégories
            set({
                enabledRelationTypes: getDefaultEnabledRelations(),
                storeVersion: 3
            });

            console.log('[Migration] ✓ Store migrated to v3 (2-category relation filtering)');
        }
    }
}));

// Exécuter la migration au démarrage (côté client uniquement)
if (typeof window !== 'undefined') {
    useAppStore.getState().migrateStore();
}
