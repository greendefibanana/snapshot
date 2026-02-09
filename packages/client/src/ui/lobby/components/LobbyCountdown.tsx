import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface LobbyCountdownProps {
  countdownSec: number;
  mode: string;
}

const LobbyCountdown: React.FC<LobbyCountdownProps> = ({ countdownSec, mode }) => {
  const [scale, setScale] = useState(1);

  // Trigger pulse effect on number change
  useEffect(() => {
    setScale(1.5);
    const timer = setTimeout(() => setScale(1), 300);
    return () => clearTimeout(timer);
  }, [countdownSec]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full overflow-hidden bg-ink-bg">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-ink-primary flex items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 bg-black transition-opacity duration-300 ${countdownSec % 2 === 0 ? 'opacity-10' : 'opacity-0'}`} />
        {/* Rotating sunburst */}
        <div className="absolute w-[200vh] h-[200vh] bg-[conic-gradient(from_0deg,transparent_0_deg,black_20deg,transparent_40deg)] opacity-20 animate-[spin_4s_linear_infinite]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        
        {/* Top Text */}
        <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter text-black transform -skew-x-12 mb-8 drop-shadow-lg">
            {countdownSec > 0 ? 'Battle Starts In' : 'GO GO GO!'}
        </h2>

        {/* Countdown Number */}
        <div className="relative">
            {/* Shadow duplicate for depth */}
            <div 
                className="absolute top-4 left-4 text-[20rem] leading-none font-black italic text-black opacity-50 blur-sm transform -skew-x-12 select-none"
                style={{ transform: `skewX(-12deg) scale(${scale})` }}
            >
                {countdownSec > 0 ? countdownSec : 'GO'}
            </div>
            
            {/* Main Number */}
            <div 
                className="text-[20rem] leading-none font-black italic text-white drop-shadow-[8px_8px_0_#000] transform -skew-x-12 transition-transform duration-200 select-none"
                style={{ transform: `skewX(-12deg) scale(${scale})` }}
            >
                {countdownSec > 0 ? countdownSec : 'GO'}
            </div>
        </div>

        {/* Mode Indicator */}
        <div className="mt-12 bg-black px-12 py-4 transform skew-x-12 border-4 border-white shadow-xl">
            <div className="transform -skew-x-12 flex items-center gap-4">
                <Play size={32} className="text-ink-primary fill-ink-primary" />
                <span className="text-3xl font-black uppercase tracking-widest text-white">
                    {mode}
                </span>
            </div>
        </div>

      </div>

      {/* Decorative Text Strip */}
      <div className="absolute bottom-0 left-0 right-0 bg-black h-16 flex items-center overflow-hidden border-t-4 border-white">
        <div className="whitespace-nowrap flex gap-8 animate-[marquee_2s_linear_infinite]">
            {Array(20).fill('GET READY').map((text, i) => (
                <span key={i} className="text-2xl font-black italic text-ink-primary opacity-50">{text}</span>
            ))}
        </div>
      </div>

    </div>
  );
};

export default LobbyCountdown;