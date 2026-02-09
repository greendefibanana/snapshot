/**
 * RoomManager - Match instance management
 * 
 * Manages multiple game rooms (matches) on a single server.
 * Each room is an isolated simulation instance.
 */

import {
    type Tick,
    tick,
    ServerInputQueue,
} from '@snapshot/shared/simulation';

import { TickScheduler, createTickScheduler } from './TickScheduler.js';
import { SimulationLoop, createSimulationLoop, type SimulationConfig } from './SimulationLoop.js';
import { StateBroadcaster, createStateBroadcaster, type ConnectedClient } from './StateBroadcaster.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RoomConfig {
    /** Unique room ID */
    roomId: string;

    /** Maximum players */
    maxPlayers: number;

    /** Match duration in seconds (0 = unlimited) */
    matchDuration: number;

    /** Simulation config overrides */
    simulationConfig?: Partial<SimulationConfig>;
}

export interface RoomState {
    /** Room ID */
    roomId: string;

    /** Current state */
    status: 'waiting' | 'starting' | 'playing' | 'ending' | 'ended';

    /** Connected player IDs */
    players: Set<string>;

    /** Creation timestamp */
    createdAt: number;

    /** Match start timestamp (0 if not started) */
    startedAt: number;

    /** Match end timestamp (0 if not ended) */
    endedAt: number;
}

export interface Room {
    config: RoomConfig;
    state: RoomState;
    tickScheduler: TickScheduler;
    simulationLoop: SimulationLoop;
    stateBroadcaster: StateBroadcaster;
    inputQueue: ServerInputQueue;
}

export interface RoomManagerConfig {
    /** Maximum concurrent rooms */
    maxRooms: number;

    /** Default room config */
    defaultRoomConfig: Partial<RoomConfig>;

    /** Callback when room is created */
    onRoomCreate?: (room: Room) => void;

    /** Callback when room is destroyed */
    onRoomDestroy?: (roomId: string) => void;

    /** Callback when match starts */
    onMatchStart?: (room: Room) => void;

    /** Callback when match ends */
    onMatchEnd?: (room: Room) => void;
}

// =============================================================================
// ROOM MANAGER
// =============================================================================

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private playerRoomMap: Map<string, string> = new Map();
    private config: RoomManagerConfig;
    private nextRoomId = 1;

    constructor(config: Partial<RoomManagerConfig> = {}) {
        this.config = {
            maxRooms: config.maxRooms ?? 100,
            defaultRoomConfig: config.defaultRoomConfig ?? {
                maxPlayers: 8,
                matchDuration: 600, // 10 minutes
            },
            onRoomCreate: config.onRoomCreate,
            onRoomDestroy: config.onRoomDestroy,
            onMatchStart: config.onMatchStart,
            onMatchEnd: config.onMatchEnd,
        };
    }

    /**
     * Create a new room.
     */
    createRoom(config: Partial<RoomConfig> = {}): Room | null {
        if (this.rooms.size >= this.config.maxRooms) {
            console.warn('RoomManager: Max rooms reached');
            return null;
        }

        const roomId = config.roomId ?? `room_${this.nextRoomId++}`;

        const roomConfig: RoomConfig = {
            roomId,
            maxPlayers: config.maxPlayers ?? this.config.defaultRoomConfig.maxPlayers ?? 8,
            matchDuration: config.matchDuration ?? this.config.defaultRoomConfig.matchDuration ?? 600,
            simulationConfig: config.simulationConfig,
        };

        // Create subsystems
        const inputQueue = new ServerInputQueue();
        const simulationLoop = createSimulationLoop(inputQueue, roomConfig.simulationConfig);
        const stateBroadcaster = createStateBroadcaster();

        const tickScheduler = createTickScheduler({
            onTick: (currentTick, deltaMs) => {
                this.onRoomTick(roomId, currentTick, deltaMs);
            },
            onTicksSkipped: (count) => {
                console.warn(`Room ${roomId}: Skipped ${count} ticks`);
            },
        });

        const room: Room = {
            config: roomConfig,
            state: {
                roomId,
                status: 'waiting',
                players: new Set(),
                createdAt: Date.now(),
                startedAt: 0,
                endedAt: 0,
            },
            tickScheduler,
            simulationLoop,
            stateBroadcaster,
            inputQueue,
        };

        this.rooms.set(roomId, room);

        console.log(`RoomManager: Created room ${roomId}`);
        this.config.onRoomCreate?.(room);

        return room;
    }

    /**
     * Destroy a room.
     */
    destroyRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Stop simulation
        room.tickScheduler.stop();
        room.simulationLoop.destroy();

        // Remove player mappings
        for (const playerId of room.state.players) {
            this.playerRoomMap.delete(playerId);
        }

        this.rooms.delete(roomId);

        console.log(`RoomManager: Destroyed room ${roomId}`);
        this.config.onRoomDestroy?.(roomId);
    }

    /**
     * Get a room by ID.
     */
    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    /**
     * Get the room a player is in.
     */
    getPlayerRoom(playerId: string): Room | undefined {
        const roomId = this.playerRoomMap.get(playerId);
        if (!roomId) return undefined;
        return this.rooms.get(roomId);
    }

    /**
     * Add a player to a room.
     */
    joinRoom(roomId: string, playerId: string, client: ConnectedClient): boolean {
        const room = this.rooms.get(roomId);
        if (!room) {
            console.warn(`RoomManager: Room ${roomId} not found`);
            return false;
        }

        if (room.state.players.size >= room.config.maxPlayers) {
            console.warn(`RoomManager: Room ${roomId} is full`);
            return false;
        }

        if (room.state.status === 'ending' || room.state.status === 'ended') {
            console.warn(`RoomManager: Room ${roomId} is ending`);
            return false;
        }

        // Remove from current room if in one
        const currentRoom = this.playerRoomMap.get(playerId);
        if (currentRoom) {
            this.leaveRoom(currentRoom, playerId);
        }

        // Add to new room
        room.state.players.add(playerId);
        this.playerRoomMap.set(playerId, roomId);

        // Create entity
        const spawnPos = this.getSpawnPosition(room);
        room.simulationLoop.createPlayerEntity(playerId, spawnPos);

        // Add to broadcaster
        room.stateBroadcaster.addClient(client);

        console.log(`RoomManager: Player ${playerId} joined room ${roomId}`);

        // Check if room should start
        this.checkStartCondition(room);

        return true;
    }

    /**
     * Remove a player from a room.
     */
    leaveRoom(roomId: string, playerId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.state.players.delete(playerId);
        this.playerRoomMap.delete(playerId);

        // Remove entity
        const entity = room.simulationLoop.getEntityByPlayerId(playerId);
        if (entity) {
            room.simulationLoop.removeEntity(entity.id);
        }

        // Remove from broadcaster
        room.stateBroadcaster.removeClient(playerId);

        // Remove from input queue
        room.inputQueue.removePlayer(playerId);

        console.log(`RoomManager: Player ${playerId} left room ${roomId}`);

        // Check if room should be destroyed
        if (room.state.players.size === 0 && room.state.status !== 'waiting') {
            this.destroyRoom(roomId);
        }
    }

    /**
     * Start a match in a room.
     */
    startMatch(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        if (room.state.status !== 'waiting' && room.state.status !== 'starting') {
            console.warn(`RoomManager: Cannot start room ${roomId} - status is ${room.state.status}`);
            return;
        }

        room.state.status = 'playing';
        room.state.startedAt = Date.now();

        // Start tick scheduler
        room.tickScheduler.start();

        console.log(`RoomManager: Match started in room ${roomId}`);
        this.config.onMatchStart?.(room);
    }

    /**
     * End a match in a room.
     */
    endMatch(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.state.status = 'ending';
        room.tickScheduler.stop();

        room.state.status = 'ended';
        room.state.endedAt = Date.now();

        console.log(`RoomManager: Match ended in room ${roomId}`);
        this.config.onMatchEnd?.(room);
    }

    /**
     * Handle a room tick.
     */
    private onRoomTick(roomId: string, currentTick: Tick, deltaMs: number): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Run simulation
        room.simulationLoop.tick(currentTick);

        // Create and broadcast snapshot
        const snapshot = room.simulationLoop.createSnapshot();
        room.stateBroadcaster.processSnapshot(snapshot);

        // Check match duration
        if (room.config.matchDuration > 0 && room.state.startedAt > 0) {
            const elapsed = (Date.now() - room.state.startedAt) / 1000;
            if (elapsed >= room.config.matchDuration) {
                this.endMatch(roomId);
            }
        }
    }

    /**
     * Check if room should auto-start.
     */
    private checkStartCondition(room: Room): void {
        // Auto-start when we have at least 2 players
        if (room.state.status === 'waiting' && room.state.players.size >= 2) {
            room.state.status = 'starting';

            // Delay start by a few seconds
            setTimeout(() => {
                if (room.state.status === 'starting') {
                    this.startMatch(room.config.roomId);
                }
            }, 3000);
        }
    }

    /**
     * Get spawn position for a player.
     */
    private getSpawnPosition(room: Room): { x: number; y: number; z: number } {
        const playerCount = room.state.players.size;
        const angle = (playerCount / 8) * Math.PI * 2;
        const radius = 5;

        return {
            x: Math.cos(angle) * radius,
            y: 0,
            z: Math.sin(angle) * radius,
        };
    }

    /**
     * Get all room IDs.
     */
    getRoomIds(): string[] {
        return Array.from(this.rooms.keys());
    }

    /**
     * Get room count.
     */
    get roomCount(): number {
        return this.rooms.size;
    }

    /**
     * Get total player count across all rooms.
     */
    get totalPlayerCount(): number {
        return this.playerRoomMap.size;
    }

    /**
     * Find a room with available slots.
     */
    findAvailableRoom(): Room | undefined {
        for (const room of this.rooms.values()) {
            if (
                room.state.status === 'waiting' &&
                room.state.players.size < room.config.maxPlayers
            ) {
                return room;
            }
        }
        return undefined;
    }

    /**
     * Find or create an available room.
     */
    findOrCreateRoom(): Room | null {
        const existing = this.findAvailableRoom();
        if (existing) return existing;
        return this.createRoom();
    }

    /**
     * Get room statistics.
     */
    getStats(): {
        roomCount: number;
        totalPlayers: number;
        activeMatches: number;
        waitingRooms: number;
    } {
        let activeMatches = 0;
        let waitingRooms = 0;

        for (const room of this.rooms.values()) {
            if (room.state.status === 'playing') activeMatches++;
            if (room.state.status === 'waiting') waitingRooms++;
        }

        return {
            roomCount: this.rooms.size,
            totalPlayers: this.playerRoomMap.size,
            activeMatches,
            waitingRooms,
        };
    }

    /**
     * Shutdown all rooms.
     */
    shutdown(): void {
        for (const roomId of this.rooms.keys()) {
            this.destroyRoom(roomId);
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createRoomManager(config?: Partial<RoomManagerConfig>): RoomManager {
    return new RoomManager(config);
}
