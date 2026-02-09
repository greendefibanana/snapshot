import React from 'react';
import { LucideIcon } from 'lucide-react';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'accent' | 'danger' | 'outline' | 'ghost' | 'glass';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'default', 
  size = 'md', 
  icon: Icon,
  className = ''
}) => {
  const baseStyles = "inline-flex items-center justify-center font-black uppercase tracking-wider rounded-full transition-all duration-200 select-none border";
  
  const variants = {
    default: "bg-ink-surface text-white border-white/10",
    primary: "bg-ink-primary text-black border-black shadow-sm",
    secondary: "bg-ink-secondary text-white border-white/20 shadow-sm",
    accent: "bg-ink-accent text-black border-black shadow-sm",
    danger: "bg-ink-danger text-white border-white/20 shadow-sm",
    outline: "bg-transparent text-white border-white/20",
    ghost: "bg-white/10 text-white/60 border-transparent hover:bg-white/20",
    glass: "bg-black/40 text-white border-white/10 backdrop-blur-md",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-3 py-1 text-xs gap-1.5",
    lg: "px-4 py-2 text-sm gap-2",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {Icon && <Icon size={size === 'sm' ? 10 : size === 'md' ? 12 : 16} strokeWidth={3} />}
      <span>{children}</span>
    </div>
  );
};

export default Badge;