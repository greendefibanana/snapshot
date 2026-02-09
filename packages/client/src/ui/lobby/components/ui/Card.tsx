import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'glass';
}

const Card: React.FC<CardProps> = ({ children, className = '', variant = 'default' }) => {
  const baseStyles = "rounded-3xl border-2 border-black/50 overflow-hidden relative";
  
  const variants = {
    default: "bg-ink-surface text-white",
    elevated: "bg-ink-surface text-white shadow-ink-hard border-black transform hover:-translate-y-1 transition-transform duration-200",
    glass: "bg-ink-surface/60 backdrop-blur-md border-white/10 text-white",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
};

export default Card;