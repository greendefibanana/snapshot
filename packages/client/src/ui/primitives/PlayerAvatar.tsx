/**
 * PlayerAvatar - Displays player avatar
 * 
 * Reusable across lobby screens.
 * No theme decisions.
 */

import React from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface PlayerAvatarProps {
    readonly playerId: string;
    readonly displayName: string;
    readonly size?: AvatarSize;
    readonly isLocal?: boolean;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
    playerId,
    displayName,
    size = 'md',
    isLocal = false,
}) => {
    // Generate initials from display name
    const initials = displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    return (
        <div
            data-component="player-avatar"
            data-size={size}
            data-local={isLocal}
            data-player-id={playerId}
            title={displayName}
        >
            <span data-initials>{initials}</span>
        </div>
    );
};

export default PlayerAvatar;
