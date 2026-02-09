import React from 'react';
import { CircleDashed, LucideIcon } from 'lucide-react';

interface SlotPlaceholderProps {
  label?: string;
  icon?: LucideIcon;
  className?: string;
  animate?: boolean;
}

const SlotPlaceholder: React.FC<SlotPlaceholderProps> = ({
  label = "Empty Slot",
  icon: Icon = CircleDashed,
  className = '',
  animate = false
}) => {
  return (
    <div className={`
        h-full w-full rounded-3xl border-4 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 bg-ink-surface/20 
        ${animate ? 'animate-pulse' : ''} 
        ${className}
    `}>
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
            <Icon className={`text-white/20 w-10 h-10 ${animate ? 'animate-spin-slow' : ''}`} />
        </div>
        <span className="text-white/20 font-black uppercase tracking-widest text-sm">{label}</span>
    </div>
  );
};

export default SlotPlaceholder;