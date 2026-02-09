import React from 'react';
import { Zap } from 'lucide-react';
import Card from './ui/Card';
import SlotPlaceholder from './ui/SlotPlaceholder';
import Badge from './ui/Badge';
import { Player } from '../types';

interface LobbyAssemblingProps {
  players: Player[];
  localPlayerId: string;
  mode: string;
  maxPlayers?: number;
}

const LobbyAssembling: React.FC<LobbyAssemblingProps> = ({
  players,
  localPlayerId,
  mode,
  maxPlayers = 4
}) => {
  // Create an array of length maxPlayers to render slots
  const slots = Array.from({ length: maxPlayers });

  return (
    <div className="flex flex-col h-full p-8 relative animate-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="text-center mb-12 space-y-2">
        <h2 className="text-5xl font-black uppercase italic tracking-tighter text-white transform -skew-x-6 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
          Team <span className="text-ink-accent">Assembling</span>
        </h2>
        <div className="inline-block">
            <Badge variant="ghost" size="lg">
                <span className="text-white/60">MODE:</span>
                <span className="text-white">{mode}</span>
            </Badge>
        </div>
      </div>

      {/* Slots Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-center">
        {slots.map((_, index) => {
          const player = players[index];
          const isLocal = player?.id === localPlayerId;
          const isEmpty = !player;

          return (
            <div key={index} className="h-[400px] flex flex-col justify-end relative group perspective-1000">
                
              {isEmpty ? (
                <SlotPlaceholder label="Searching..." animate />
              ) : (
                // FILLED PLAYER STATE
                <Card 
                    variant={isLocal ? 'elevated' : 'default'}
                    className={`
                        h-full w-full flex flex-col p-0 overflow-hidden transition-all duration-500 animate-in slide-in-from-bottom-12 fade-in
                        ${isLocal ? 'border-ink-primary shadow-ink-glow' : 'border-white/20'}
                    `}
                >
                    {/* Character Image Background */}
                    <div className="absolute inset-0 bg-ink-bg">
                        <div className={`absolute inset-0 opacity-50 bg-gradient-to-t ${isLocal ? 'from-ink-primary/20' : 'from-ink-secondary/20'} to-transparent`} />
                        <img 
                            src={player.avatar} 
                            alt={player.name} 
                            className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700"
                        />
                    </div>

                    {/* Local Player Badge */}
                    {isLocal && (
                        <div className="absolute top-4 left-4 z-10 transform -rotate-3">
                            <Badge variant="primary" size="sm">YOU</Badge>
                        </div>
                    )}

                    {/* Player Info Overlay */}
                    <div className="mt-auto relative z-10 p-6 bg-gradient-to-t from-black via-black/80 to-transparent pt-12">
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="ghost" size="sm">LVL {player.level}</Badge>
                            {player.ready && <Zap size={12} className="text-ink-primary fill-ink-primary" />}
                        </div>
                        <h3 className="text-2xl font-black uppercase italic text-white leading-none mb-2 truncate">
                            {player.name}
                        </h3>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isLocal ? 'bg-ink-primary' : 'bg-ink-secondary'}`} />
                            <span className="text-xs font-bold uppercase text-white/80 tracking-wide">{player.weapon}</span>
                        </div>
                    </div>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Status */}
      <div className="mt-8 text-center">
         <p className="text-white/40 font-mono text-sm animate-pulse">
            {players.length < maxPlayers ? 'WAITING FOR PLAYERS...' : 'TEAM ASSEMBLED! PREPARING LOBBY...'}
         </p>
      </div>

    </div>
  );
};

export default LobbyAssembling;