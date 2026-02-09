/**
 * Zone Control Bar
 * 
 * Splatoon-inspired zone progress indicator showing
 * team control percentages.
 */

import React, { memo } from 'react';
import { useGameState } from '../../../bridge';
import './ZoneBar.css';

interface ZoneProgress {
    teamA: number;  // 0-100
    teamB: number;  // 0-100
    contested: boolean;
}

// Temporary selector until zone state is added to UIGameState
const useZoneProgress = (): ZoneProgress => {
    const teamScores = useGameState(s => s.teamScores);
    const total = (teamScores[1] ?? 0) + (teamScores[2] ?? 0);

    return {
        teamA: total > 0 ? ((teamScores[1] ?? 0) / total) * 100 : 50,
        teamB: total > 0 ? ((teamScores[2] ?? 0) / total) * 100 : 50,
        contested: Math.abs((teamScores[1] ?? 0) - (teamScores[2] ?? 0)) < 10,
    };
};

export const ZoneBar: React.FC = memo(() => {
    const { teamA, teamB, contested } = useZoneProgress();

    return (
        <div className="zone-bar-container">
            <div className="zone-bar">
                <div
                    className="zone-team-a"
                    style={{ width: `${teamA}%` }}
                >
                    <span className="zone-label">{Math.round(teamA)}%</span>
                </div>

                {contested && (
                    <div className="zone-contested">
                        <div className="zone-contested-pulse" />
                    </div>
                )}

                <div
                    className="zone-team-b"
                    style={{ width: `${teamB}%` }}
                >
                    <span className="zone-label">{Math.round(teamB)}%</span>
                </div>
            </div>

            <div className="zone-icons">
                <div className="zone-icon team-a">🔷</div>
                <div className="zone-icon team-b">🔶</div>
            </div>
        </div>
    );
});

ZoneBar.displayName = 'ZoneBar';
export default ZoneBar;
