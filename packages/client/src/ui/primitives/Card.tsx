/**
 * Card - Container card
 * 
 * Reusable across lobby screens.
 * No theme decisions.
 */

import React from 'react';

export type CardVariant = 'default' | 'elevated' | 'outlined';

export interface CardProps {
    readonly children: React.ReactNode;
    readonly variant?: CardVariant;
    readonly onClick?: () => void;
    readonly selected?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    variant = 'default',
    onClick,
    selected = false,
}) => {
    return (
        <div
            data-component="card"
            data-variant={variant}
            data-selected={selected}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {children}
        </div>
    );
};

export default Card;
