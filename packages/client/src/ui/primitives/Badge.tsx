/**
 * Badge - Displays a label badge
 * 
 * Reusable across lobby screens.
 * No theme decisions.
 */

import React from 'react';

export type BadgeVariant = 'default' | 'wager' | 'access' | 'mode' | 'status';

export interface BadgeProps {
    readonly children: React.ReactNode;
    readonly variant?: BadgeVariant;
    readonly 'data-value'?: string;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    'data-value': dataValue,
}) => {
    return (
        <span
            data-component="badge"
            data-variant={variant}
            data-value={dataValue}
        >
            {children}
        </span>
    );
};

export default Badge;
