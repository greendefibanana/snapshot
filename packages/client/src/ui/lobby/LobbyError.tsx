/**
 * LobbyError Screen
 * 
 * Shown when lobbyState.phase === "error"
 * Displays error message with retry option.
 */

import React from 'react';
import { getGameBridge } from '../../bridge/GameBridge';

// =============================================================================
// TYPES
// =============================================================================

export interface LobbyErrorProps {
    readonly error?: string | undefined;
}

// =============================================================================
// LOBBY ERROR SCREEN
// =============================================================================

export const LobbyError: React.FC<LobbyErrorProps> = ({ error = 'An error occurred' }) => {
    const bridge = getGameBridge();

    const handleRetry = () => {
        console.log('[LobbyError] Retry clicked');
        // Emit leave_queue to reset state
        bridge.sendToGame({ type: 'leave_queue' });
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
        }}>
            {/* Error icon */}
            <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))',
                border: '4px solid #ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '64px',
                marginBottom: '32px',
            }}>
                ⚠️
            </div>

            <h2 style={{
                fontSize: '36px',
                fontWeight: 700,
                color: '#fca5a5',
                marginBottom: '16px',
            }}>
                Error
            </h2>

            <p style={{
                fontSize: '18px',
                color: '#f87171',
                marginBottom: '40px',
                textAlign: 'center',
                maxWidth: '500px',
            }}>
                {error}
            </p>

            <button
                onClick={handleRetry}
                style={{
                    padding: '14px 48px',
                    fontSize: '16px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #7c3aed, #6d28d9)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                RETURN TO LOBBY
            </button>
        </div>
    );
};

export default LobbyError;
