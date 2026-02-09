/**
 * SlotPlaceholder - Empty slot indicator
 * 
 * Reusable across lobby screens.
 * No theme decisions.
 */

import React from 'react';

export interface SlotPlaceholderProps {
    readonly slotIndex: number;
    readonly label?: string;
}

export const SlotPlaceholder: React.FC<SlotPlaceholderProps> = ({
    slotIndex,
    label = 'Empty',
}) => {
    return (
        <div
            data-component="slot-placeholder"
            data-slot={slotIndex}
        >
            <span data-label>{label}</span>
        </div>
    );
};

export default SlotPlaceholder;
