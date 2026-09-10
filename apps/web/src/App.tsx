import { useState } from 'react';
import { haversine, score, PAULO_AFONSO_CENTER } from '@paguessr/shared';
import type { LatLng } from '@paguessr/shared';
import { MOCK_LOCATIONS } from './data/mockLocations';
import type { GameState, RoundResult } from './types';
import { RoundHeader } from './components/RoundHeader';
import { ImagePanel } from './components/ImagePanel';
import { GuessMap } from './components/GuessMap';
import { RoundResultModal } from './components/RoundResultModal';
import { GameResult } from './components/GameResult';

export function App() {
  const [locations] = useState(MOCK_LOCATIONS);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('guessing');
  const [currentGuess, setCurrentGuess] = useState<LatLng | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);

  const totalRounds = locations.length;
  const currentLocation = locations[currentRoundIndex];
  const totalScore = results.reduce((acc, curr) => acc + curr.score, 0);

  const handleSelectGuess = (coords: LatLng) => {
    if (gameState !== 'guessing') return;
    setCurrentGuess(coords);
  };

  const handleConfirmGuess = () => {
    if (!currentGuess || gameState !== 'guessing') return;

    const distanceMeters = haversine(currentGuess, currentLocation.coords);
    const roundScore = score(distanceMeters);

    const newResult: RoundResult = {
      roundNumber: currentRoundIndex + 1,
      location: currentLocation,
      guess: currentGuess,
      distanceMeters,
      score: roundScore,
    };

    setResults((prev) => [...prev, newResult]);
    setGameState('round_result');
  };

  const handleNextRound = () => {
    if (currentRoundIndex + 1 < totalRounds) {
      setCurrentRoundIndex((prev) => prev + 1);
      setCurrentGuess(null);
      setGameState('guessing');
    } else {
      setGameState('finished');
    }
  };

  const handlePlayAgain = () => {
    setCurrentRoundIndex(0);
    setCurrentGuess(null);
    setResults([]);
    setGameState('guessing');
  };

  const latestResult = results[results.length - 1];
  const isLastRound = currentRoundIndex === totalRounds - 1;

  return (
    <div className="app-shell">
      <RoundHeader
        currentRound={currentRoundIndex + 1}
        totalRounds={totalRounds}
        totalScore={totalScore}
      />

      <main className="game-body">
        {gameState === 'finished' ? (
          <GameResult results={results} onPlayAgain={handlePlayAgain} />
        ) : (
          <div className="game-stage">
            <ImagePanel location={currentLocation} />
            <GuessMap
              center={PAULO_AFONSO_CENTER}
              guess={currentGuess}
              location={currentLocation}
              gameState={gameState}
              onSelectGuess={handleSelectGuess}
              onConfirmGuess={handleConfirmGuess}
            />

            {gameState === 'round_result' && latestResult && (
              <RoundResultModal
                result={latestResult}
                isLastRound={isLastRound}
                onNext={handleNextRound}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
