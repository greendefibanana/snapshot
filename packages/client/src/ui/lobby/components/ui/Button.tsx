import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading,
  className = '',
  ...props 
}) => {
  const baseStyles = "font-black uppercase tracking-wider transform transition-all active:translate-y-1 active:shadow-none border-2 border-black rounded-lg relative overflow-hidden group";
  
  const variants = {
    primary: "bg-ink-primary text-black shadow-ink-hard hover:bg-[#b3e600]",
    secondary: "bg-ink-secondary text-white shadow-ink-hard hover:bg-[#5e00d6]",
    danger: "bg-ink-danger text-white shadow-ink-hard hover:bg-[#d60047]",
    ghost: "bg-transparent text-white border-2 border-white/20 hover:border-white/50 hover:bg-white/5 shadow-none",
  };

  const sizes = {
    sm: "px-3 py-1 text-xs shadow-[2px_2px_0px_0px_#000]",
    md: "px-6 py-3 text-sm shadow-ink-hard",
    lg: "px-8 py-4 text-xl shadow-ink-hard-lg",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading}
      {...props}
    >
      {/* Diagonal shine effect */}
      <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 group-hover:animate-[shimmer_1s_infinite]" />
      
      <span className="relative flex items-center gap-2 justify-center">
        {isLoading ? (
          <span className="animate-spin mr-2">C</span> 
        ) : null}
        {children}
      </span>
    </button>
  );
};

export default Button;