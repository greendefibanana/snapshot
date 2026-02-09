import React, { useState, useEffect } from 'react';
import LobbyScene from './LobbyScene';
import { SAMPLE_PLAYERS } from '../constants';
import { ChevronLeft } from 'lucide-react';
import { Player } from '../types';

type LobbyPhase = 'idle' | 'queueing' | 'assembling' | 'ready_check' | 'countdown' | 'ready';

interface LobbyProps {
    onGameStart: () => void;
}

const LobbyMockup: React.FC<LobbyProps> = ({ onGameStart }) => {
    const [phase, setPhase] = useState<LobbyPhase>('idle');
    const [isReady, setIsReady] = useState(false);
    const [selectedMode] = useState('Turf War');
    const [, setQueueTime] = useState(0);
    const [countdownTime, setCountdownTime] = useState(5);

    // State for players
    const [assembledPlayers, setAssembledPlayers] = useState<Player[]>([]);

    // Queue Timer
    useEffect(() => {
        let interval: any;
        if (phase === 'queueing') {
            interval = setInterval(() => {
                setQueueTime(prev => prev + 1);
            }, 1000);
        } else {
            setQueueTime(0);
        }
        return () => clearInterval(interval);
    }, [phase]);

    // Assembling Phase Simulation
    useEffect(() => {
        if (phase === 'assembling') {
            // Start with just the local player
            const found = SAMPLE_PLAYERS.find(p => p.id === '1');
            if (!found) return;
            const localPlayer: Player = { ...found, ready: false }; // Ensure reset
            setAssembledPlayers([localPlayer]);

            let currentIndex = 1;
            const interval = setInterval(() => {
                if (currentIndex < SAMPLE_PLAYERS.length) {
                    // Add players one by one
                    const newPlayer = { ...SAMPLE_PLAYERS[currentIndex], ready: false } as Player; // Ensure reset
                    setAssembledPlayers(prev => [...prev, newPlayer]);
                    currentIndex++;
                } else {
                    clearInterval(interval);
                    // Transition to Ready Check
                    setTimeout(() => {
                        setPhase('ready_check');
                    }, 1500);
                }
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [phase]);

    // Ready Check Simulation
    useEffect(() => {
        if (phase === 'ready_check') {
            // Bots click ready randomly
            const interval = setInterval(() => {
                setAssembledPlayers(current => {
                    const unreadyBots = current.filter(p => p.id !== '1' && !p.ready);
                    if (unreadyBots.length === 0) return current;

                    const randomBot = unreadyBots[Math.floor(Math.random() * unreadyBots.length)];
                    if (!randomBot) return current;
                    return current.map(p => p.id === randomBot.id ? { ...p, ready: true } : p);
                });
            }, 1200);

            return () => clearInterval(interval);
        }
    }, [phase]);

    // Watch for all ready to transition to Countdown
    useEffect(() => {
        if (phase === 'ready_check' && assembledPlayers.length > 0) {
            const allReady = assembledPlayers.every(p => p.ready);
            if (allReady) {
                setTimeout(() => {
                    setPhase('countdown');
                    setCountdownTime(5);
                }, 1000);
            }
        }
    }, [phase, assembledPlayers]);

    // Countdown Logic
    useEffect(() => {
        if (phase === 'countdown') {
            const interval = setInterval(() => {
                setCountdownTime(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        setTimeout(() => {
                            setIsReady(true);
                            onGameStart();
                        }, 500);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [phase]);

    // --- RENDER SPATIAL LOBBY ---
    return (
        <div className="relative w-full h-full bg-ink-bg overflow-hidden">
            <LobbyScene
                phase={phase}
                players={assembledPlayers}
                selectedMode={selectedMode}
                isReady={isReady}
                onReadyChange={setIsReady}
                countdownTime={countdownTime}
            />

            {/* Optional: Minimal Screen-Space HUD/Vignette if needed */}
            <div className="absolute inset-0 pointer-events-none bg-radial-gradient from-transparent to-black/40" />

            {/* Back Button (Screen Space for usability) */}
            <div className="absolute top-8 left-8 pointer-events-auto">
                {phase !== 'idle' && (
                    <button
                        onClick={() => setPhase('idle')}
                        className="bg-black/50 text-white p-3 rounded-full hover:bg-ink-primary hover:text-black transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}
            </div>

            {/* Debug/Dev Info */}
            <div className="absolute bottom-4 right-4 text-xs text-white/20 pointer-events-none">
                Phase: {phase} | R3F Spatial UI
            </div>
        </div>
    );
};

export default LobbyMockup;