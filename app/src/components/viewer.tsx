import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

/** One 3D part, reused in Studio windows and the Boxouts page. */
export function PartViewer({
  w = 300, h = 1790, d = 945, color = "#d8b184",
}: { w?: number; h?: number; d?: number; color?: string }) {
  const sx = Math.max(0.4, w / 500);
  const sy = Math.max(0.6, h / 900);
  const sz = Math.max(0.4, d / 500);
  return (
    <div className="sf sf-inset viewer">
      <Canvas camera={{ position: [2.4, 1.8, 2.6], fov: 35 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 8, 3]} intensity={1.1} />
        <mesh scale={[sx, sy, sz]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
        </mesh>
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}
