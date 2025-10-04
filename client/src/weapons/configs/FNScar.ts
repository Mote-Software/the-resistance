import * as THREE from "three";
import { WeaponConfig } from "../WeaponManager";

export const FNScarConfig: WeaponConfig = {
  name: "fn_scar",
  modelPath: "/assets/models/weapons/fn_scar.fbx",
  textures: {
    albedo: "/assets/textures/weapons/Metal036_1K_Color.jpg",
    normal: "/assets/textures/weapons/Metal036_1K_Normal.jpg",
    roughness: "/assets/textures/weapons/Metal036_1K_Roughness.jpg",
    metalness: "/assets/textures/weapons/Metal036_1K_Metalness.jpg",
    ao: "/assets/textures/weapons/Metal036_1K_Displacement.jpg",
  },
  // Hip fire positioning (relative to camera)
  position: new THREE.Vector3(0.4, -0.95, -2.0), // Right, lower, further back
  rotation: new THREE.Euler(0, 0, 0), // No rotation - facing forward
  scale: new THREE.Vector3(0.006, 0.006, 0.006), // Medium scale
  // ADS positioning (relative to camera)
  adsPosition: new THREE.Vector3(0.007, -0.99, -1.55), // Further back for ADS
  adsRotation: new THREE.Euler(0, 0, 0), // No rotation
  adsScale: new THREE.Vector3(0.007, 0.007, 0.007), // Slightly larger for ADS
};
