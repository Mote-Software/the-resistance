import * as THREE from 'three';
import { WeaponConfig } from '../WeaponManager';

export const LeeEnfieldConfig: WeaponConfig = {
  name: 'lee_enfield_mk1',
  modelPath: '/assets/models/weapons/lee_enfield_mk1.FBX',
  textures: {
    albedo: '/assets/textures/weapons/lee_enfield_mk1_Albedo.png',
    normal: '/assets/textures/weapons/lee_enfield_mk1_Normal.png',
    roughness: '/assets/textures/weapons/lee_enfield_mk1_Roughness.png',
    metalness: '/assets/textures/weapons/lee_enfield_mk1_Metalness.png',
    ao: '/assets/textures/weapons/lee_enfield_mk1_AO.png',
  },
  // First-person weapon positioning (relative to camera)  
  position: new THREE.Vector3(0.4, -0.85, -1.5), // Right, tiny bit lower, forward
  rotation: new THREE.Euler(0, Math.PI, 0), // Rotate 180° to face forward
  scale: new THREE.Vector3(0.035, 0.035, 0.035), // Larger scale to see more detail
};