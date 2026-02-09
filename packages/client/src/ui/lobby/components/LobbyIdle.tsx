import React from 'react';
import { Trophy, Globe, Lock, Zap, Target, Crown, Users } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

interface LobbyIdleProps {
  mode: string;
  ruleset: 'Standard' | 'Anarchy' | 'League';
  access: 'Public' | 'Private';
  playerCount: number;
  maxPlayers: number;
  onStart: () => void;
  onModeChange: (mode: string) => void;
}

const GAME_MODES = [
  { 
    id: 'Turf War', 
    icon: Zap, 
    description: 'Cover the most ground!', 
    colorClass: 'text-ink-primary group-hover:text-black',
    bgClass: 'group-hover:bg-ink-primary'
  },
  { 
    id: 'Tower Control', 
    icon: Target, 
    description: 'Ride the tower to the goal.', 
    colorClass: 'text-ink-secondary group-hover:text-white',
    bgClass: 'group-hover:bg-ink-secondary'
  },
  { 
    id: 'Rainmaker', 
    icon: Crown, 
    description: 'Carry the Rainmaker!', 
    colorClass: 'text-ink-danger group-hover:text-white',
    bgClass: 'group-hover:bg-ink-danger'
  },
];

const LobbyIdle: React.FC<LobbyIdleProps> = ({
  mode,
  ruleset,
  access,
  playerCount,
  maxPlayers,
  onStart,
  onModeChange
}) => {
  return (
    <div className="flex flex-col h-full gap-8 p-8 animate-in fade-in zoom-in-95 duration-500">
      
      {/* Header Area */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-5xl font-black uppercase italic tracking-tighter text-white transform -skew-x-6 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
            Match <span className="text-ink-primary">Setup</span>
          </h2>
          <p className="text-white/60 font-mono mt-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            CONNECTED TO REGION: NA-EAST
          </p>
        </div>
        
        {/* Player Summary Badge */}
        <Badge size="lg" icon={Users} className="py-2 px-4 shadow-ink-hard bg-ink-surface text-white border-2 border-white/10">
          <span className="text-xl">{playerCount} / {maxPlayers}</span>
        </Badge>
      </div>

      {/* Main Content Split */}
      <div className="flex-1 flex flex-col md:flex-row gap-8">
        
        {/* Left: Mode Selection */}
        <div className="flex-1 space-y-4">
          <h3 className="text-xl font-bold uppercase text-white/40 tracking-widest">Select Mode</h3>
          <div className="grid gap-4">
            {GAME_MODES.map((gameMode) => {
              const isSelected = mode === gameMode.id;
              const Icon = gameMode.icon;
              
              return (
                <button
                  key={gameMode.id}
                  onClick={() => onModeChange(gameMode.id)}
                  className={`
                    group relative w-full text-left p-6 rounded-2xl border-2 transition-all duration-200 overflow-hidden
                    ${isSelected 
                      ? 'border-white bg-white/10 shadow-ink-hard translate-x-2' 
                      : 'border-white/10 hover:border-white/40 bg-ink-surface/50 hover:bg-ink-surface'
                    }
                  `}
                >
                  <div className={`
                    absolute inset-0 opacity-0 transition-opacity duration-300
                    ${isSelected ? 'opacity-100 bg-white/5' : ''}
                    ${gameMode.bgClass} group-hover:opacity-10
                  `}/>
                  
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <h4 className={`
                        text-2xl font-black uppercase italic transition-colors
                        ${isSelected ? 'text-white' : 'text-white/60 group-hover:text-white'}
                      `}>
                        {gameMode.id}
                      </h4>
                      <p className="text-sm font-mono text-white/40 mt-1">{gameMode.description}</p>
                    </div>
                    <Icon 
                      size={32} 
                      className={`
                        transition-colors duration-200 transform group-hover:scale-110 group-hover:rotate-12
                        ${isSelected ? 'text-white' : gameMode.colorClass}
                      `} 
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Settings & Action */}
        <div className="flex-1 flex flex-col gap-8">
          
          {/* Settings Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold uppercase text-white/40 tracking-widest">Lobby Settings</h3>
            
            <div className="grid grid-cols-2 gap-4">
                {/* Ruleset Badge */}
                <Card className="p-4 flex flex-col gap-2 items-start hover:border-ink-secondary transition-colors group cursor-pointer">
                    <div className="bg-ink-secondary/20 p-2 rounded-lg group-hover:bg-ink-secondary group-hover:text-white transition-colors">
                        <Trophy size={20} className="text-ink-secondary group-hover:text-white" />
                    </div>
                    <div>
                        <div className="text-xs font-mono text-white/40 uppercase">Ruleset</div>
                        <div className="text-xl font-black uppercase">{ruleset}</div>
                    </div>
                </Card>

                {/* Access Badge */}
                <Card className="p-4 flex flex-col gap-2 items-start hover:border-ink-accent transition-colors group cursor-pointer">
                    <div className="bg-ink-accent/20 p-2 rounded-lg group-hover:bg-ink-accent group-hover:text-black transition-colors">
                        {access === 'Public' ? <Globe size={20} className="text-ink-accent group-hover:text-black" /> : <Lock size={20} />}
                    </div>
                    <div>
                        <div className="text-xs font-mono text-white/40 uppercase">Access</div>
                        <div className="text-xl font-black uppercase">{access}</div>
                    </div>
                </Card>
            </div>
            
            {/* Map Preview (Decorative) */}
            <div className="relative h-32 rounded-2xl overflow-hidden border-2 border-white/10 group">
                <div className="absolute inset-0 bg-gradient-to-r from-ink-bg to-transparent z-10" />
                <img 
                    src="https://picsum.photos/seed/map/800/200" 
                    alt="Map" 
                    className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 transition-all duration-500 transform group-hover:scale-110" 
                />
                <div className="absolute bottom-4 left-4 z-20">
                    <div className="text-xs font-bold uppercase text-ink-primary mb-1">Current Rotation</div>
                    <div className="text-xl font-black italic uppercase">Neon Underpass</div>
                </div>
            </div>
          </div>

          {/* Start Action */}
          <div className="mt-auto">
             <Button 
                variant="primary" 
                size="lg" 
                className="w-full py-6 text-2xl tracking-widest hover:scale-[1.02]"
                onClick={() => {
                    console.log('Starting matchmaking...');
                    onStart();
                }}
             >
                <span className="flex items-center gap-3">
                    START MATCHMAKING
                    <Zap size={24} className="fill-black animate-pulse" />
                </span>
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyIdle;