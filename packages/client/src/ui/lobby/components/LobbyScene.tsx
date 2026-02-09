import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, useGLTF, ContactShadows, Float } from '@react-three/drei';

function CharacterModel() {
    const { scene } = useGLTF('/models/character.glb');
    return <primitive object={scene} />;
}

import { SpatialLobby } from './SpatialLobby';
import { Player } from '../types';

interface LobbySceneProps {
    phase: string;
    players: Player[];
    selectedMode: string;
    isReady: boolean;
    onReadyChange: (ready: boolean) => void;
    countdownTime: number;
}

function SceneContent({ sceneProps }: { sceneProps: LobbySceneProps }) {
    return (
        <>
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} shadow-mapSize={2048} castShadow />
            <Environment preset="city" />

            <Float
                speed={2}
                rotationIntensity={0.2}
                floatIntensity={0.5}
                floatingRange={[-0.1, 0.1]}
            >
                <CharacterModel />
            </Float>

            <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={10} blur={2.5} far={4} />

            <SpatialLobby {...sceneProps} />

            <OrbitControls
                enableZoom={false}
                enablePan={false}
                minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 2}
                autoRotate
                autoRotateSpeed={0.5}
            />
        </>
    );
}

export default function LobbyScene(props: LobbySceneProps) {
    return (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}>
            <Canvas shadows camera={{ position: [0, 1, 4], fov: 40 }} dpr={[1, 2]}>
                <Suspense fallback={null}>
                    <SceneContent sceneProps={props} />
                </Suspense>
            </Canvas>
        </div>
    );
}

// Preload the model
useGLTF.preload('/models/character.glb');
