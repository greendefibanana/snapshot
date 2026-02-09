/**
 * Button - Clickable button
 * 
 * Reusable across lobby screens.
 * No theme decisions.
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
    readonly children: React.ReactNode;
    readonly onClick?: () => void;
    readonly variant?: ButtonVariant;
    readonly disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    variant = 'primary',
    disabled = false,
}) => {
    return (
        <button
            data-component="button"
            data-variant={variant}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
};

export default Button;
