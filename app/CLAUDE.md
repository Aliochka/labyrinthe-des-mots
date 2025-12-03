# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Labyrinthe des Mots is a React/TypeScript application that provides an immersive 3D exploration of French semantic word relationships using WordNet data. Users can navigate through semantic connections between French words in a full-screen 3D environment.

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Run ESLint
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Core Technology Stack
- **React 19.2.0** with TypeScript and Vite
- **Three.js** for 3D graphics rendering
- **French WordNet (OMW-FR)** semantic data
- Canvas textures for 3D text rendering
- OrbitControls for 3D navigation

### Key Architectural Components

**WordNet Data Layer** (`src/wordnet/`):
- `loadData.ts`: Loads preprocessed French WordNet JSON files from `/public/`
- `semantic-api.ts`: Core semantic operations (word expansion, path finding)
- Data files: `synsets.json`, `relations.json`, `lexicalIndex.json` in public folder

**3D Visualization Layer** (`src/visualization/`):
- `Graph3DView.tsx`: Three.js integration with React, handles WebGL rendering
- Floating text labels that always face camera
- Click detection using raycasting
- Full-screen 3D scene with keyboard/mouse navigation

**State Management Pattern**:
- Uses `useRef` for persistent state that survives React re-mounts
- localStorage for data persistence across sessions
- Progressive graph expansion with merge algorithms

**UI Components** (`src/components/ui/`):
- `ControlPanel.tsx`: Floating glassmorphism panel with collapsible interface
- `WordInput.tsx`: Compact input components for word submission

### Data Flow Architecture

1. **Word Input**: User enters words in floating control panel
2. **Semantic Resolution**: `semantic-api.ts` normalizes words and queries WordNet index
3. **Graph Expansion**: BFS traversal builds semantic neighborhood around words
4. **3D Rendering**: Three.js renders floating text nodes and relationship edges
5. **Progressive Navigation**: Clicking words expands graph while maintaining camera position

### Critical Implementation Details

**Progressive Graph Expansion**:
- `mergeGraphs()` function in `App.tsx` combines existing and new semantic data
- Each click performs limited expansion (depth: 2, maxNodes: 30) to prevent performance issues
- Camera position remains stable during expansion

**State Persistence**:
- `firstWordRef.current`, `wordPathRef.current` for persistent state
- `localStorage` keys: `'expandFirst'`, `'highlightNodeIds'`
- Robust error handling for component re-mounting scenarios

**3D Text Rendering**:
- Canvas-based texture generation for each word
- Dynamic font sizing based on node importance (center, highlighted, normal)
- Automatic camera-facing orientation using `lookAt(camera.position)`

### WordNet Data Structure

The application uses three preprocessed JSON files:
- **synsets.json**: Semantic concepts with French lemmas and glosses
- **relations.json**: Hypernym/hyponym/antonym relationships between synsets
- **lexicalIndex.json**: Normalized word → synset ID mappings

Word normalization removes accents, apostrophes, hyphens and converts to lowercase for consistent lookup.

### Performance Considerations

- Graph expansion is limited to prevent browser performance issues
- Three.js scene cleanup on component unmount
- Efficient BFS algorithms with early termination
- Canvas texture caching for text rendering

### State Management Gotchas

- Component may re-mount frequently due to React 19 behavior
- All critical state must use `useRef` or localStorage persistence
- Avoid dependencies on regular `useState` for navigation state
- Error boundaries around semantic API calls to prevent cascading failures