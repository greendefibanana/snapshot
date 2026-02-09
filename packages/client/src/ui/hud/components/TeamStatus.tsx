/**
 * Team Status Display
 * 
 * Shows 8 player icons (4 per team) with alive/dead state
 * and ultimate ready indicators.
 */

import React, { memo } from 'react';
import './TeamStatus.css';

interface TeamMember {
    id: string;
    name: string;
    isAlive: boolean;
    healthPercent: number;
    ultimateReady: boolean;
    isLocalPlayer: boolean;
}

interface TeamStatusProps {
    teamA: TeamMember[];
    teamB: TeamMember[];
}

const PlayerIcon: React.FC<TeamMember & { team: 'a' | 'b' }> = memo(({
    name,
    isAlive,
    healthPercent,
    ultimateReady,
    isLocalPlayer,
    team,
}) => (
    <div
        className={`player-icon team-${team} ${isAlive ? 'alive' : 'dead'} ${isLocalPlayer ? 'local' : ''}`}
        title={name}
    >
        <div className="player-icon-inner">
            {/* Health ring */}
            <svg className="health-ring" viewBox="0 0 36 36">
                <circle
                    className="health-ring-bg"
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    strokeWidth="3"
                />
                <circle
                    className="health-ring-fill"
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    strokeWidth="3"
                    strokeDasharray={`${healthPercent} 100`}
                    transform="rotate(-90 18 18)"
                />
            </svg>

            {/* Player indicator */}
            <div className="player-dot" />

            {/* Death X */}
            {!isAlive && (
                <div className="death-marker">✕</div>
            )}

            {/* Ultimate ready indicator */}
            {ultimateReady && isAlive && (
                <div className="ult-ready">⚡</div>
            )}
        </div>
    </div>
));

PlayerIcon.displayName = 'PlayerIcon';

export const TeamStatus: React.FC<TeamStatusProps> = memo(({ teamA, teamB }) => (
    <div className="team-status-container">
        <div className="team-row team-a-row">
            {teamA.map(member => (
                <PlayerIcon key={member.id} {...member} team="a" />
            ))}
        </div>
        <div className="team-divider" />
        <div className="team-row team-b-row">
            {teamB.map(member => (
                <PlayerIcon key={member.id} {...member} team="b" />
            ))}
        </div>
    </div>
));

TeamStatus.displayName = 'TeamStatus';
export default TeamStatus;
