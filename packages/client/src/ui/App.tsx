/**
 * React App Root
 * 
 * Main React component that manages UI state and game canvas.
 * Routes between lobby and in-game views.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { HUD } from './hud/HUD';
import { getGameBridge, type GameToUIEvent } from '../bridge/GameBridge';
import type { LobbyState } from '@snapshot/shared';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ConnectWalletButton } from '../wallet/ConnectWalletButton';
import { LobbyScreen } from './lobby/LobbyScreen';
import { getGameClient, type P2PStatus } from '../networking/GameClient';
import { initializeGame } from '../main';
import { getUsernameForPublicKey, setUsernameForPublicKey, validateUsername } from '../wallet/username';
import { wagerMatchSeed } from '@snapshot/shared';
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { buildInitWagerIx, buildJoinWagerIx, findWagerPda } from '../wallet/wagerProgram';

// =============================================================================
// TYPES
// =============================================================================

type AppState = 'wallet_check' | 'lobby' | 'playing' | 'disconnected';
type MatchContext = { mode: string; ruleset: string };

// ... (keep styles) ...

// =============================================================================
// APP COMPONENT
// =============================================================================

export const App: React.FC = () => {
    const { publicKey, connected, sendTransaction, signTransaction } = useWallet();
    const { connection } = useConnection();
    const { setVisible } = useWalletModal();
    const walletAddress = publicKey?.toBase58() ?? null;
    const [appState, setAppState] = useState<AppState>('wallet_check');
    const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [username, setUsername] = useState<string | null>(null);
    const [pendingUsername, setPendingUsername] = useState('');
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [wagerLock, setWagerLock] = useState<{ matchId: string; wagerAmountSol: number; opponentWallet?: string; lockRole?: 'init' | 'join' } | null>(null);
    const [wagerBalance, setWagerBalance] = useState<number | null>(null);
    const [wagerError, setWagerError] = useState<string | null>(null);
    const [wagerLoading, setWagerLoading] = useState(false);
    const [currentMatchContext, setCurrentMatchContext] = useState<MatchContext | null>(null);
    const [p2pStatus, setP2PStatus] = useState<P2PStatus>({ phase: 'idle' });
    const lastAuthRef = useRef<{ address: string; username: string } | null>(null);

    // Refs
    const canvasRef = useRef<HTMLDivElement>(null);
    const gameInitialized = useRef(false);

    // Singletons
    const bridge = getGameBridge();
    const client = getGameClient();

    // Debug: log state changes
    useEffect(() => {
        console.log('[App] Current state:', appState, 'Connected:', connected);
    }, [appState, connected]);

    useEffect(() => {
        return client.subscribeToP2PStatus((status) => {
            setP2PStatus(status);
        });
    }, [client]);

    // Handle Wallet Connection
    useEffect(() => {
        if (connected && walletAddress) {
            const stored = getUsernameForPublicKey(walletAddress);
            setUsername(stored);
            if (!stored) {
                setPendingUsername('');
                setUsernameError(null);
            }
        } else {
            setUsername(null);
            setPendingUsername('');
            setUsernameError(null);
            lastAuthRef.current = null;
            setAppState('wallet_check');
        }
    }, [connected, walletAddress]);

    useEffect(() => {
        if (connected && walletAddress && username) {
            const last = lastAuthRef.current;
            if (!last || last.address !== walletAddress || last.username !== username) {
                console.log('[App] Wallet connected:', walletAddress, 'as', username);
                client.connect(walletAddress, username);
                lastAuthRef.current = { address: walletAddress, username };
            }
            setAppState('lobby');
            return;
        }
        if (connected && walletAddress && !username) {
            setAppState('wallet_check');
            return;
        }
        setAppState('wallet_check');
    }, [connected, walletAddress, username, client]);

    const handleUsernameSubmit = useCallback(() => {
        if (!walletAddress) return;
        const error = validateUsername(pendingUsername);
        if (error) {
            setUsernameError(error);
            return;
        }
        setUsernameForPublicKey(walletAddress, pendingUsername);
        setUsername(pendingUsername.trim());
        setUsernameError(null);
    }, [walletAddress, pendingUsername]);

    const wagerProgramId = useMemo(() => {
        const raw = import.meta.env.VITE_WAGER_PROGRAM_ID;
        if (!raw) return null;
        try {
            return new PublicKey(raw);
        } catch {
            return null;
        }
    }, []);

    const wagerAuthority = useMemo(() => {
        const raw = import.meta.env.VITE_WAGER_AUTHORITY_PUBKEY;
        if (!raw) return null;
        try {
            return new PublicKey(raw);
        } catch {
            return null;
        }
    }, []);

    const wagerFeeWallet = useMemo(() => {
        const raw = import.meta.env.VITE_WAGER_FEE_WALLET;
        if (!raw) return null;
        try {
            return new PublicKey(raw);
        } catch {
            return null;
        }
    }, []);

    const wagerFeeBps = useMemo(() => {
        const raw = import.meta.env.VITE_WAGER_FEE_BPS;
        const parsed = raw ? Number(raw) : 200;
        return Number.isFinite(parsed) ? parsed : 200;
    }, []);

    const refreshWagerBalance = useCallback(async () => {
        if (!publicKey) {
            setWagerBalance(null);
            return;
        }
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        setWagerBalance(lamports / LAMPORTS_PER_SOL);
    }, [connection, publicKey]);

    const handleLockWager = useCallback(async () => {
        if (!wagerLock) return;
        if (!publicKey || !connected) {
            setVisible(true);
            return;
        }
        if (!wagerProgramId || !wagerAuthority || !wagerFeeWallet) {
            setWagerError('Wager program is not configured.');
            return;
        }
        await refreshWagerBalance();
        let requiredSol = wagerLock.wagerAmountSol;
        if (wagerLock.lockRole === 'init') {
            try {
                const rentLamports = await connection.getMinimumBalanceForRentExemption(173);
                requiredSol += rentLamports / LAMPORTS_PER_SOL;
            } catch {
                // Fallback buffer if rent query fails
                requiredSol += 0.002;
            }
        }
        if (wagerBalance !== null && wagerBalance < requiredSol) {
            setWagerError(`Insufficient SOL balance. Need ~${requiredSol.toFixed(4)} SOL.`);
            return;
        }
        setWagerError(null);
        setWagerLoading(true);
        try {
            const matchSeed = wagerMatchSeed(wagerLock.matchId);
            const opponent = wagerLock.opponentWallet;
            let isInitiator =
                wagerLock.lockRole
                    ? wagerLock.lockRole === 'init'
                    : opponent
                        ? walletAddress !== null && walletAddress.localeCompare(opponent) < 0
                        : true;
            if (isInitiator && wagerProgramId) {
                const wagerPda = findWagerPda(wagerProgramId, matchSeed);
                const existing = await connection.getAccountInfo(wagerPda, 'confirmed');
                if (existing) {
                    isInitiator = false;
                }
            }
            if (!isInitiator && wagerProgramId) {
                const wagerPda = findWagerPda(wagerProgramId, matchSeed);
                let existing = await connection.getAccountInfo(wagerPda, 'confirmed');
                let attempts = 0;
                while (!existing && attempts < 20) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    existing = await connection.getAccountInfo(wagerPda, 'confirmed');
                    attempts += 1;
                }
                if (!existing) {
                    setWagerError('Waiting for opponent to initialize wager. Please try again.');
                    setWagerLoading(false);
                    return;
                }
            }
            const tx = new Transaction();
            if (isInitiator) {
                tx.add(
                    buildInitWagerIx({
                        programId: wagerProgramId,
                        payer: publicKey,
                        player: publicKey,
                        authority: wagerAuthority,
                        feeWallet: wagerFeeWallet,
                        matchSeed,
                        amountLamports: Math.round(wagerLock.wagerAmountSol * LAMPORTS_PER_SOL),
                        feeBps: wagerFeeBps,
                    })
                );
            } else {
                tx.add(
                    buildJoinWagerIx({
                        programId: wagerProgramId,
                        player: publicKey,
                        matchSeed,
                    })
                );
            }
            const latest = await connection.getLatestBlockhash('confirmed');
            tx.feePayer = publicKey;
            tx.recentBlockhash = latest.blockhash;

            try {
                const sim = await connection.simulateTransaction(tx, { sigVerify: false });
                if (sim.value.err) {
                    console.error('Wager simulate error', sim.value.err, sim.value.logs);
                }
            } catch (simError) {
                console.warn('Wager simulate skipped', simError);
            }

            let signature: string;
            if (signTransaction) {
                const signed = await signTransaction(tx);
                const raw = signed.serialize();
                signature = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed' });
                await connection.confirmTransaction(
                    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
                    'confirmed'
                );
            } else {
                signature = await sendTransaction(tx, connection, { skipPreflight: false, preflightCommitment: 'confirmed' });
                await connection.confirmTransaction(
                    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
                    'confirmed'
                );
            }
            bridge.sendToGame({ type: 'wager_locked', matchId: wagerLock.matchId });
            setWagerLock(null);
        } catch (error: any) {
            console.error('Wager lock failed', error);
            const message = typeof error?.message === 'string' ? error.message : 'Wager transaction failed.';
            setWagerError(message);
        } finally {
            setWagerLoading(false);
        }
    }, [wagerLock, publicKey, connected, setVisible, wagerProgramId, wagerAuthority, wagerFeeWallet, refreshWagerBalance, wagerBalance, walletAddress, wagerFeeBps, sendTransaction, connection, bridge]);

    const needsUsername = connected && walletAddress && !username;

    // Subscribe to bridge events
    useEffect(() => {
        const unsubscribe = bridge.subscribeToGame((event: GameToUIEvent) => {
            switch (event.type) {
                case 'connected':
                    // We are connected to server, waiting for lobby state
                    break;
                case 'disconnected':
                    setAppState('disconnected');
                    break;
                case 'lobby_update':
                    setLobbyState(event.state);
                    setCurrentMatchContext({
                        mode: event.state.mode,
                        ruleset: event.state.ruleset,
                    });
                    if (appState !== 'playing') {
                        setAppState('lobby');
                    }
                    break;
                case 'match_start':
                    console.log('[App] Match started! Initializing game...');
                    setAppState('playing');
                    // Initialize Three.js game if not already done
                    if (!gameInitialized.current) {
                        gameInitialized.current = true;
                        // Use a small timeout to ensure canvas is rendered
                        setTimeout(() => {
                            initializeGame(bridge);
                        }, 100);
                    }
                    break;
                case 'wager_lock':
                    setWagerError(null);
                    setWagerLock({
                        matchId: event.matchId,
                        wagerAmountSol: event.wagerAmountSol,
                        opponentWallet: event.opponentWallet,
                        lockRole: event.lockRole,
                    });
                    break;
                case 'state_update':
                    if (event.state && 'isRunning' in event.state && event.state.isRunning === false && appState === 'playing') {
                        setIsPaused(false);
                        setAppState('lobby');
                    }
                    break;
            }
        });

        return () => {
            unsubscribe();
        };
    }, [bridge, appState]);

    // Handle Escape key for pause
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Escape' && appState === 'playing') {
                setIsPaused(prev => !prev);
                if (!isPaused) {
                    document.exitPointerLock();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [appState, isPaused]);

    useEffect(() => {
        if (wagerLock && publicKey) {
            void refreshWagerBalance();
        }
    }, [wagerLock, publicKey, refreshWagerBalance]);

    // =========================================================================
    // GAME HANDLERS
    // =========================================================================

    // Resume game handler
    const handleResume = useCallback(() => {
        setIsPaused(false);
        if (canvasRef.current) {
            canvasRef.current.requestPointerLock();
        }
    }, []);

    // Quit match handler
    const handleQuit = useCallback(() => {
        bridge.sendToGame({ type: 'quit_match' });
        setIsPaused(false);
        setAppState('lobby');
        // Reset game init state if we destroy the renderer (which we should todo properly)
        // gameInitialized.current = false; 
        // Note: initializeGame handles existing renderer cleanup
    }, [bridge]);

    const handleStartTraining = useCallback(() => {
        client.disconnect();
        bridge.resetForLocalMode();
        setCurrentMatchContext({
            mode: 'training',
            ruleset: 'casual',
        });
        bridge.updateState({
            isConnected: false,
            isGameOver: false,
            isDead: false,
            kills: 0,
            deaths: 0,
            assists: 0,
            teamScores: { 1: 0, 2: 0 },
            matchTimeRemaining: 0,
        });
        setAppState('playing');
        bridge.notifyMatchStart();
        if (!gameInitialized.current) {
            gameInitialized.current = true;
            setTimeout(() => {
                initializeGame(bridge);
            }, 100);
        } else {
            setTimeout(() => {
                initializeGame(bridge);
            }, 100);
        }
    }, [bridge, client]);

    const handleCreateP2PRoom = useCallback(async (): Promise<string> => {
        return client.createP2PRoom();
    }, [client]);

    const handleJoinP2PRoom = useCallback(async (code: string): Promise<void> => {
        await client.joinP2PRoom(code);
    }, [client]);

    const handleFallbackServer1v1 = useCallback(() => {
        client.cancelP2P();
        bridge.sendToGame({
            type: 'join_queue',
            mode: '1v1',
            ruleset: 'casual',
        });
    }, [bridge, client]);

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div style={styles.container}>

            {/* 1. Wallet Connection Screen */}
            {appState === 'wallet_check' && (
                <div style={styles.overlay}>
                    <h1 style={styles.welcomeTitle}>SNAPSHOT</h1>
                    {needsUsername ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'min(360px, 90vw)' }}>
                            <p style={{ opacity: 0.8, textAlign: 'center' }}>
                                Choose a username for this wallet
                            </p>
                            <input
                                value={pendingUsername}
                                onChange={(e) => setPendingUsername(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleUsernameSubmit();
                                    }
                                }}
                                placeholder="Enter username"
                                style={{
                                    height: 44,
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    padding: '0 12px',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: 'white',
                                    fontSize: 16,
                                    fontFamily: 'Inter, sans-serif',
                                }}
                            />
                            {usernameError && (
                                <div style={{ color: '#e74c3c', fontSize: 14, textAlign: 'center' }}>
                                    {usernameError}
                                </div>
                            )}
                            <button
                                onClick={handleUsernameSubmit}
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
                                Save Username
                            </button>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <ConnectWalletButton />
                            </div>
                        </div>
                    ) : (
                        <>
                            <p style={{ marginBottom: 30, opacity: 0.7 }}>Connect your wallet to enter the arena</p>
                            <ConnectWalletButton />
                        </>
                    )}
                </div>
            )}

            {/* 2. Lobby Screen */}
            {appState === 'lobby' && (
                <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%' }}>
                    {/* Show LobbyScreen if we have state, otherwise loading */}
                    {lobbyState ? (
                        <LobbyScreen
                            lobbyState={lobbyState}
                            onStartTraining={handleStartTraining}
                            onCreateP2PRoom={handleCreateP2PRoom}
                            onJoinP2PRoom={handleJoinP2PRoom}
                            onFallbackServer1v1={handleFallbackServer1v1}
                            p2pStatus={p2pStatus}
                        />
                    ) : (
                        <div style={styles.overlay}>
                            <h2 style={{ marginBottom: 20 }}>Connecting to Lobby...</h2>
                            <ConnectWalletButton /> {/* Show button to allow disconnect */}
                        </div>
                    )}

                    {/* Overlay Wallet Button in Lobby for visibility/switching */}
                    <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}>
                        <ConnectWalletButton />
                    </div>
                </div>
            )}

            {/* 3. Game Canvas (Playing) */}
            <div
                ref={canvasRef}
                id="game-canvas"
                style={{
                    ...styles.gameCanvas,
                    // Hide canvas when not playing to save resources/avoid z-index issues
                    visibility: appState === 'playing' ? 'visible' : 'hidden'
                }}
            />

            {/* HUD (shown when playing) */}
            {appState === 'playing' && !isPaused && (
                <HUD
                    matchMode={currentMatchContext?.mode}
                    matchRuleset={currentMatchContext?.ruleset}
                />
            )}

            {/* Disconnected Overlay */}
            {appState === 'disconnected' && (
                <div style={styles.overlay}>
                    <p style={{ color: '#e74c3c', fontSize: 24, marginBottom: 20 }}>Disconnected from server</p>
                    <button
                        style={styles.pauseButton}
                        onClick={() => window.location.reload()}
                    >
                        Reconnect
                    </button>
                </div>
            )}

            {/* Pause Menu */}
            {isPaused && appState === 'playing' && (
                <div style={styles.pauseOverlay}>
                    <h2 style={styles.pauseTitle}>PAUSED</h2>
                    <button style={styles.pauseButton} onClick={handleResume}>
                        Resume
                    </button>
                    <button
                        style={{ ...styles.pauseButton, color: '#e74c3c' }}
                        onClick={handleQuit}
                    >
                        Quit Match
                    </button>
                </div>
            )}

            {/* Wager Lock Overlay */}
            {wagerLock && (
                <div style={styles.wagerOverlay}>
                    <div style={styles.wagerModal}>
                        <h3 style={styles.wagerTitle}>Lock Wager</h3>
                        <p style={styles.wagerSubtitle}>Match found. Deposit SOL to escrow to start.</p>
                        <div style={styles.wagerRow}>
                            <span>Wager</span>
                            <strong>{wagerLock.wagerAmountSol} SOL</strong>
                        </div>
                        <div style={styles.wagerRow}>
                            <span>Total Pot</span>
                            <strong>{(wagerLock.wagerAmountSol * 2).toFixed(2)} SOL</strong>
                        </div>
                        <div style={styles.wagerRow}>
                            <span>Balance</span>
                            <strong>{wagerBalance !== null ? `${wagerBalance.toFixed(3)} SOL` : '—'}</strong>
                        </div>
                        {wagerError && <div style={styles.wagerError}>{wagerError}</div>}
                        <button
                            style={styles.wagerButton}
                            onClick={handleLockWager}
                            disabled={wagerLoading}
                        >
                            {wagerLoading ? 'Confirming...' : 'Confirm & Lock Wager'}
                        </button>
                    </div>
                </div>
            )}

            {/* Global Styles */}
            <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
        </div>
    );
};

export default App;

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        overflow: 'hidden',
        position: 'relative',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 20,
        color: 'white',
        fontFamily: 'Inter, sans-serif',
    },
    welcomeTitle: {
        fontSize: '4rem',
        fontWeight: 800,
        marginBottom: '1rem',
        background: 'linear-gradient(to right, #667eea, #764ba2)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    gameCanvas: {
        width: '100%',
        height: '100%',
        display: 'block',
    },
    pauseOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(5px)',
        zIndex: 50,
    },
    pauseTitle: {
        fontSize: '3rem',
        color: 'white',
        marginBottom: '2rem',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        letterSpacing: '0.1em',
    },
    pauseButton: {
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        color: 'white',
        padding: '12px 32px',
        fontSize: '1.2rem',
        borderRadius: '4px',
        margin: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: 'Inter, sans-serif',
        minWidth: '200px',
    },
    wagerOverlay: {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: '20px',
    },
    wagerModal: {
        width: 'min(520px, 95vw)',
        background: '#0b1120',
        border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: '16px',
        padding: '28px',
        color: 'white',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        fontFamily: 'Inter, sans-serif',
    },
    wagerTitle: {
        fontSize: '24px',
        fontWeight: 700,
        marginBottom: '8px',
        color: '#bbf7d0',
    },
    wagerSubtitle: {
        color: '#86efac',
        marginBottom: '20px',
    },
    wagerRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '10px',
        color: '#e2e8f0',
        fontSize: '16px',
    },
    wagerError: {
        color: '#f87171',
        marginTop: '8px',
        marginBottom: '12px',
    },
    wagerButton: {
        width: '100%',
        padding: '14px 24px',
        fontSize: '16px',
        fontWeight: 700,
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        border: 'none',
        borderRadius: '10px',
        color: '#ffffff',
        cursor: 'pointer',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
    },
};
