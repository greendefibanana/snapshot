// @ts-nocheck
// Legacy 3D spatial lobby - not used with AAA Lobby
import type React from 'react';
import { Container, Text, Root } from '@react-three/uikit';
import { Sword, Trophy } from '@react-three/uikit-lucide';
import { Player } from '../types';

interface SpatialLobbyProps {
    phase: string;
    players: Player[];
    selectedMode: string;
    isReady: boolean;
    onReadyChange: (ready: boolean) => void;
    countdownTime?: number;
}

const colors = {
    primary: '#CCFF00', // Acid Lime
    secondary: '#7000FF', // Electric Violet
    accent: '#00FFFF', // Cyan
    danger: '#FF0055', // Hot Pink
    bg: '#0A0A10', // Dark
    surface: '#181820',
};

export function SpatialLobby({ phase, players, selectedMode, isReady, onReadyChange, countdownTime }: SpatialLobbyProps) {
    return (
        <Root>
            {/* Main Mode Panel (Left Floating) */}
            <Container
                position={[-1.2, 0.5, 0.5]}
                rotation={[0, 0.3, 0]}
                transformTranslateZ={100}
                flexDirection="column"
                backgroundColor={colors.primary}
                borderRadius={32}
                padding={24}
                borderColor="white"
                borderWidth={4}
                width={350}
                height={200}
                alignItems="center"
                justifyContent="center"
            >
                <Container flexDirection="row" alignItems="center" gap={12}>
                    <Sword color="black" width={48} height={48} />
                    <Text color="black" fontSize={32} fontWeight="bold">
                        Regular Battle
                    </Text>
                </Container>
                <Text color="black" fontSize={16} marginTop={12} opacity={0.8}>
                    Hop into a Turf War battle.
                </Text>
            </Container>

            {/* Mode Details / Stage Panel (Right Floating) */}
            <Container
                position={[1.2, 0.2, 0.5]}
                rotation={[0, -0.3, 0]}
                flexDirection="column"
                backgroundColor={colors.bg}
                borderColor={colors.surface}
                borderWidth={2}
                borderRadius={20}
                width={300}
                padding={16}
                opacity={0.9}
            >
                <Container flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={12}>
                    <Text color="white" fontSize={14} opacity={0.6}>Mode</Text>
                    <Container backgroundColor={colors.surface} paddingX={8} paddingY={4} borderRadius={4}>
                        <Text color="white" fontSize={12}>Rules</Text>
                    </Container>
                </Container>

                <Text color={colors.primary} fontSize={28} fontWeight="900" fontStyle="italic">
                    {selectedMode}
                </Text>

                <Container marginTop={16} gap={8}>
                    <Text color="white" fontSize={14} opacity={0.6}>Stage</Text>
                    <Container flexDirection="row" gap={8} alignItems="center">
                        <Container width={40} height={40} backgroundColor={colors.surface} borderRadius={8} />
                        <Text color="white" fontSize={16}>Neon Underpass</Text>
                    </Container>
                    <Container flexDirection="row" gap={8} alignItems="center">
                        <Container width={40} height={40} backgroundColor={colors.surface} borderRadius={8} />
                        <Text color="white" fontSize={16}>Wahoo World</Text>
                    </Container>
                </Container>
            </Container>

            {/* Player List (Top Right) */}
            <Container
                position={[1.5, 1.5, 0]}
                rotation={[0, -0.4, 0]}
                flexDirection="column"
                gap={8}
            >
                {players.map((p, i) => (
                    <Container
                        key={p.id}
                        backgroundColor={p.ready ? colors.primary : colors.surface}
                        padding={8}
                        borderRadius={8}
                        flexDirection="row"
                        alignItems="center"
                        gap={8}
                        width={200}
                    >
                        <Container
                            width={32}
                            height={32}
                            borderRadius={16}
                            backgroundColor="white"
                            borderWidth={2}
                            borderColor={p.ready ? "black" : "transparent"}
                        />
                        <Text color={p.ready ? "black" : "white"} fontSize={14} fontWeight="bold">
                            {p.name}
                        </Text>
                    </Container>
                ))}
            </Container>

            {/* Ready Button (Bottom Center) */}
            <Container
                position={[0, -0.8, 1]}
                alignItems="center"
            >
                <Container
                    backgroundColor={isReady ? colors.danger : colors.primary}
                    paddingX={48}
                    paddingY={16}
                    borderRadius={999}
                    onClick={() => onReadyChange(!isReady)}
                    cursor="pointer"
                    borderWidth={4}
                    borderColor="white"
                    hover={{ scale: 1.1 }}
                >
                    <Text
                        color={isReady ? "white" : "black"}
                        fontSize={24}
                        fontWeight="bold"
                    >
                        {isReady ? "CANCEL" : "READY UP!"}
                    </Text>
                </Container>

                {phase === 'countdown' && (
                    <Text
                        color="white"
                        fontSize={48}
                        marginTop={20}
                        fontWeight="black"
                    >
                        {countdownTime}
                    </Text>
                )}
            </Container>

            {/* HUD / Currency (Top Right Screen-ish) */}
            <Container
                position={[1.8, 2.2, 0]}
                rotation={[0, -0.2, 0]}
                backgroundColor="black"
                padding={8}
                borderRadius={8}
                flexDirection="row"
                gap={12}
                opacity={0.8}
            >
                <Container flexDirection="row" gap={4} alignItems="center">
                    <Trophy color={colors.primary} width={16} height={16} />
                    <Text color="white" fontSize={14} fontWeight="bold">0004350</Text>
                </Container>
            </Container>

        </Root>
    )
}
