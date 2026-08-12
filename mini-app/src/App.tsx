import { Routes, Route, Navigate } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import GameCompletedPage from './pages/GameCompletedPage';
// import DebugOverlay from './components/DebugOverlay';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/lobby" replace />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/game/:gameId" element={<GamePage />} />
        <Route path="/game/:gameId/completed" element={<GameCompletedPage />} />
      </Routes>
      {/* <DebugOverlay /> */}
    </>
  );
}
