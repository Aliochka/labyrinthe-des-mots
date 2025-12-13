// src/App.tsx
import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
} from 'react-router-dom';
import { GamePage } from './pages/GamePage';
import { StudyPage } from './pages/StudyPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          background: '#111',
          color: '#f5f5f5',
        }}
      >
        <Routes>
          <Route path="/" element={<GamePage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/study" element={<StudyPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;
