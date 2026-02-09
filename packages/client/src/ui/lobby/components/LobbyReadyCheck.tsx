import React from 'react';
import { Player } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';
import Badge from './ui/Badge';
import PlayerAvatar from './ui/PlayerAvatar';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface LobbyReadyCheckProps {
  players: Player[];
  localPlayerId: string;
  onConfirm: () => void;
}

const LobbyReadyCheck: React.FC<LobbyReadyCheckProps> = ({
  players,
  localPlayerId,
  onConfirm
}) => {
  const localPlayer = players.find(p => p.id === localPlayerId);
  const isLocalReady = localPlayer?.ready || false;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 relative animate-in zoom-in-95 duration-300">
      
      {/* Intense Background Pattern */}
      <div className="absolute inset-0 bg-ink-primary/5 pointer-events-none animate-pulse-fast" />
      <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

      <div className="z-10 w-full max-w-5xl space-y-12 text-center">
        
        {/* Dynamic Header */}
        <div className="space-y-4 flex flex-col items-center">
          <Badge variant="danger" icon={AlertTriangle} className="animate-bounce bg-ink-danger/20 border-ink-danger/50">
            ACTION REQUIRED
          </Badge>
          <h2 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter text-white transform -skew-x-6 drop-shadow-[8px_8px_0_rgba(0,0,0,1)]">
            Match <span className="text-ink-primary">Found!</span>
          </h2>
          <p className="text-xl md:text-2xl text-white/80 font-mono tracking-widest uppercase">
            Waiting for players to accept...
          </p>
        </div>

        {/* Players Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-4">
          {players.map((player) => {
            const isReady = player.ready;
            const isLocal = player.id === localPlayerId;

            return (
              <div 
                key={player.id}
                className={`
                  relative transition-all duration-500 ease-out
                  ${isReady ? 'scale-105 -translate-y-2' : 'scale-100 opacity-60'}
                `}
              >
                <Card 
                  variant={isReady ? 'elevated' : 'glass'}
                  className={`
                    p-6 flex flex-col items-center gap-4 border-4 transition-all duration-300 relative overflow-visible
                    ${isReady ? 'border-ink-primary bg-ink-primary text-black' : 'border-white/10 bg-black/40'}
                    ${isLocal ? 'ring-4 ring-white/20' : ''}
                  `}
                >
                  {/* Status Indicator Badge */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                     <Badge 
                        variant={isReady ? 'primary' : 'default'} 
                        className={isReady ? 'bg-black text-ink-primary border-white' : 'bg-ink-surface text-white/40'}
                     >
                        {isReady ? 'ACCEPTED' : 'WAITING'}
                     </Badge>
                  </div>

                  {/* Avatar Area */}
                  <PlayerAvatar 
                    src={player.avatar}
                    alt={player.name}
                    size="lg"
                    isReady={isReady}
                    statusIcon="check"
                  />
                  
                  {/* Name */}
                  <div className="text-center w-full">
                    <div className="font-black uppercase italic text-lg truncate">
                      {player.name}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Action Area */}
        <div className="h-32 flex items-center justify-center pt-8">
           {!isLocalReady ? (
             <Button 
                variant="primary" 
                size="lg" 
                className="text-3xl py-8 px-16 w-full max-w-lg hover:scale-105 animate-pulse-fast shadow-[0_0_50px_rgba(204,255,0,0.3)]"
                onClick={() => {
                    console.log('Player confirmed match');
                    onConfirm();
                }}
             >
                ACCEPT MATCH
             </Button>
           ) : (
             <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 text-ink-primary">
                    <CheckCircle2 size={40} className="fill-black" />
                    <span className="text-4xl font-black italic uppercase">You are ready!</span>
                </div>
                <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Redirecting when all players accept</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};

export default LobbyReadyCheck;