import React, { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { getUsernameForPublicKey } from './username';

export const ConnectWalletButton: React.FC = () => {
    const { publicKey, connected, connecting, disconnecting, disconnect } = useWallet();
    const { setVisible } = useWalletModal();
    const walletAddress = publicKey?.toBase58() ?? null;
    const username = useMemo(() => getUsernameForPublicKey(walletAddress), [walletAddress]);

    // Debug logging for connection state changes
    useEffect(() => {
        console.log('[Wallet] Connection state:', {
            connected,
            connecting,
            disconnecting,
            address: walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null,
        });
    }, [connected, connecting, disconnecting, walletAddress]);

    const handleConnect = () => {
        console.log('[Wallet] Connect button clicked');
        setVisible(true);
    };

    const handleDisconnect = () => {
        console.log('[Wallet] Disconnect button clicked');
        disconnect();
    };

    // Show loading state
    if (connecting || disconnecting) {
        return (
            <button
                disabled
                style={{
                    background: '#95a5a6',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '16px',
                    padding: '0 24px',
                    height: '48px',
                    cursor: 'not-allowed',
                    opacity: 0.7
                }}
            >
                {connecting ? 'Connecting...' : 'Disconnecting...'}
            </button>
        );
    }

    if (connected && walletAddress) {
        return (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ color: 'white', fontFamily: 'Inter, sans-serif' }}>
                    {username ?? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                </span>
                <button
                    onClick={handleDisconnect}
                    style={{
                        background: '#e74c3c',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '14px',
                        padding: '8px 16px',
                        cursor: 'pointer'
                    }}
                >
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={handleConnect}
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 600,
                fontSize: '16px',
                padding: '0 24px',
                height: '48px',
                cursor: 'pointer'
            }}
        >
            Connect Wallet
        </button>
    );
};
