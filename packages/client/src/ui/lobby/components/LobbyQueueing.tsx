import React from 'react';
import { Loader2, X, Clock, Wifi } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';

interface LobbyQueueingProps {
  waitTimeSec: number;
  mode: string;
  ruleset: string;
  onAbort: () => void;
}

const LobbyQueueing: React.FC<LobbyQueueingProps> = ({
  waitTimeSec,
  mode,
  ruleset,
  onAbort
}) => {
  // Format seconds into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 relative animate-in zoom-in-95 duration-300">
      
      {/* Background Pulse Effect */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-ink-primary/5 rounded-full animate-ping [animation-duration:3s]" />
        <div className="absolute w-[300px] h-[300px] bg-ink-primary/10 rounded-full animate-pulse" />
      </div>

      {/* Main Status */}
      <div className="relative z-10 text-center space-y-8 max-w-2xl w-full">
        
        {/* Animated Icon */}
        <div className="flex justify-center">
            <div className="relative">
                <Loader2 size={80} className="text-ink-primary animate-spin" />
                <Wifi size={32} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
        </div>

        <div className="space-y-2">
            <h2 className="text-6xl font-black uppercase italic tracking-tighter text-white transform -skew-x-6 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
            Searching...
            </h2>
            <p className="text-xl text-white/60 font-mono tracking-widest animate-pulse">
                LOOKING FOR OPPONENTS
            </p>
        </div>

        {/* Timer Card */}
        <Card variant="glass" className="p-8 border-ink-primary/30 backdrop-blur-xl">
            <div className="flex items-center justify-center gap-4 mb-4">
                <Clock className="text-ink-primary" />
                <span className="text-6xl font-black font-mono tracking-widest text-white tabular-nums">
                    {formatTime(waitTimeSec)}
                </span>
            </div>
            
            <div className="flex justify-center gap-8 border-t border-white/10 pt-4">
                <div className="text-center">
                    <div className="text-xs font-bold uppercase text-white/40">Mode</div>
                    <div className="text-xl font-black uppercase text-ink-primary">{mode}</div>
                </div>
                <div className="w-px bg-white/10" />
                <div className="text-center">
                    <div className="text-xs font-bold uppercase text-white/40">Ruleset</div>
                    <div className="text-xl font-black uppercase text-white">{ruleset}</div>
                </div>
            </div>
        </Card>

        {/* Abort Action */}
        <div className="pt-8">
            <Button 
                variant="danger" 
                size="lg" 
                className="w-64 mx-auto hover:scale-105"
                onClick={() => {
                    console.log('Aborting matchmaking...');
                    onAbort();
                }}
            >
                <span className="flex items-center justify-center gap-2">
                    <X size={20} />
                    CANCEL SEARCH
                </span>
            </Button>
        </div>

      </div>
      
      {/* Decorative ticker */}
      <div className="absolute bottom-8 w-full overflow-hidden opacity-30 pointer-events-none">
        <div className="whitespace-nowrap font-mono text-xs text-ink-primary animate-[marquee_10s_linear_infinite]">
            CONNECTING TO SERVER... CONNECTING TO SERVER... CONNECTING TO SERVER... CONNECTING TO SERVER...
        </div>
      </div>
    </div>
  );
};

export default LobbyQueueing;