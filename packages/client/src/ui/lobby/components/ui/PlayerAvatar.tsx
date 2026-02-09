import React from 'react';
import { Zap, Check } from 'lucide-react';

interface PlayerAvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isReady?: boolean;
  statusIcon?: 'zap' | 'check';
  className?: string;
}

const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  src,
  alt,
  size = 'md',
  isReady = false,
  statusIcon,
  className = ''
}) => {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const statusSizeClasses = {
    sm: "p-0.5",
    md: "p-1",
    lg: "p-2",
    xl: "p-2"
  };

  return (
    <div className={`relative shrink-0 ${sizeClasses[size]} ${className}`}>
        {/* Background Splat/Glow for ready state */}
        {isReady && (
            <div className="absolute inset-0 bg-black rounded-full transform scale-110" />
        )}
        
        {/* Image */}
        <img 
            src={src} 
            alt={alt} 
            className={`
                w-full h-full object-cover rounded-full relative z-10 transition-all duration-300
                ${isReady ? 'border-2 border-white' : 'border-2 border-white/20 grayscale'}
            `}
        />
        
        {/* Status Indicator */}
        {isReady && statusIcon && (
            <div className={`
                absolute -bottom-1 -right-1 bg-ink-primary text-black rounded-full border-2 border-black z-20 flex items-center justify-center
                ${statusSizeClasses[size]}
            `}>
                {statusIcon === 'zap' && <Zap size={size === 'sm' ? 8 : 12} fill="black" />}
                {statusIcon === 'check' && <Check size={size === 'lg' ? 20 : 12} strokeWidth={4} />}
            </div>
        )}
    </div>
  );
};

export default PlayerAvatar;