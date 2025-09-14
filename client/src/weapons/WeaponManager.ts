import * as THREE from 'three';
import { FBXLoader } from 'three-stdlib';

export interface WeaponConfig {
  name: string;
  modelPath: string;
  textures: {
    albedo: string;
    normal: string;
    roughness: string;
    metalness: string;
    ao: string;
  };
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class Weapon {
  private group: THREE.Group;
  private config: WeaponConfig;
  private isLoaded: boolean = false;

  constructor(config: WeaponConfig) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = config.name;
  }

  async load(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Loading weapon model: ${this.config.modelPath}`);
      const loader = new FBXLoader();
      
      loader.load(
        this.config.modelPath,
        (object) => {
          console.log(`Successfully loaded ${this.config.name} model`);
          
          // Clear any existing children
          this.group.clear();
          
          // Apply PBR materials to all meshes
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              console.log(`Setting up PBR material for mesh: ${child.name}`);
              this.setupPBRMaterial(child);
            }
          });
          
          // Apply transform to the group instead of the object
          this.group.add(object);
          this.group.position.copy(this.config.position);
          this.group.rotation.copy(this.config.rotation);
          this.group.scale.copy(this.config.scale);
          this.isLoaded = true;
          console.log(`Weapon ${this.config.name} loaded and positioned`);
          resolve();
        },
        (progress) => {
          console.log(`Loading progress: ${this.config.name} - ${(progress.loaded / progress.total * 100)}%`);
        },
        (error) => {
          console.error(`Failed to load weapon ${this.config.name}:`, error);
          reject(error);
        }
      );
    });
  }

  private setupPBRMaterial(mesh: THREE.Mesh): void {
    const textureLoader = new THREE.TextureLoader();
    
    console.log(`Loading textures for ${this.config.name}`);
    
    // Load all PBR textures
    const albedoTexture = textureLoader.load(this.config.textures.albedo, () => {
      console.log(`Loaded albedo texture: ${this.config.textures.albedo}`);
    });
    const normalTexture = textureLoader.load(this.config.textures.normal, () => {
      console.log(`Loaded normal texture: ${this.config.textures.normal}`);
    });
    const roughnessTexture = textureLoader.load(this.config.textures.roughness, () => {
      console.log(`Loaded roughness texture: ${this.config.textures.roughness}`);
    });
    const metalnessTexture = textureLoader.load(this.config.textures.metalness, () => {
      console.log(`Loaded metalness texture: ${this.config.textures.metalness}`);
    });
    const aoTexture = textureLoader.load(this.config.textures.ao, () => {
      console.log(`Loaded AO texture: ${this.config.textures.ao}`);
    });
    
    // Create PBR material
    const material = new THREE.MeshStandardMaterial({
      map: albedoTexture,
      normalMap: normalTexture,
      roughnessMap: roughnessTexture,
      metalnessMap: metalnessTexture,
      aoMap: aoTexture,
    });
    
    mesh.material = material;
    mesh.castShadow = true;
    console.log(`Applied PBR material to mesh: ${mesh.name}`);
  }

  getObject(): THREE.Group {
    return this.group;
  }

  isReady(): boolean {
    return this.isLoaded;
  }

  // Animation methods for future use
  setPosition(position: THREE.Vector3): void {
    this.group.position.copy(position);
  }

  setRotation(rotation: THREE.Euler): void {
    this.group.rotation.copy(rotation);
  }

  // Update weapon position to stay relative to camera
  update(deltaTime: number, camera: THREE.Camera, isMoving: boolean = false, currentTime: number = 0): void {
    if (this.isLoaded) {
      // Create a world position based on camera position + local offset
      const offset = new THREE.Vector3();
      offset.copy(this.config.position);
      
      // Add weapon sway when moving
      if (isMoving) {
        const swayAmount = 0.01;
        const swaySpeed = 8;
        offset.x += Math.sin(currentTime * swaySpeed) * swayAmount;
        offset.y += Math.sin(currentTime * swaySpeed * 2) * swayAmount * 0.5;
        offset.z += Math.cos(currentTime * swaySpeed) * swayAmount * 0.3;
      }
      
      offset.applyQuaternion(camera.quaternion);
      this.group.position.copy(camera.position).add(offset);
      
      // Apply camera rotation plus weapon's local rotation
      this.group.rotation.copy(camera.rotation);
      this.group.rotateY(this.config.rotation.y);
      this.group.rotateX(this.config.rotation.x);
      this.group.rotateZ(this.config.rotation.z);
      
      // Add subtle rotation sway when moving
      if (isMoving) {
        const rotSway = 0.005;
        this.group.rotateZ(Math.sin(currentTime * 6) * rotSway);
        this.group.rotateX(Math.cos(currentTime * 8) * rotSway * 0.5);
      }
    }
  }
}

export class WeaponManager {
  private weapons: Map<string, Weapon> = new Map();
  private activeWeapon: Weapon | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  registerWeapon(config: WeaponConfig): void {
    const weapon = new Weapon(config);
    this.weapons.set(config.name, weapon);
  }

  async equipWeapon(name: string): Promise<boolean> {
    console.log(`Attempting to equip weapon: ${name}`);
    const weapon = this.weapons.get(name);
    if (!weapon) {
      console.warn(`Weapon ${name} not found`);
      return false;
    }

    // Unequip current weapon
    if (this.activeWeapon) {
      console.log(`Unequipping current weapon`);
      this.camera.remove(this.activeWeapon.getObject());
    }

    // Load and equip new weapon
    try {
      if (!weapon.isReady()) {
        console.log(`Loading weapon ${name}...`);
        await weapon.load();
      }

      // Attach weapon to scene but update its position relative to camera
      console.log(`Adding weapon ${name} to scene`);
      this.scene.add(weapon.getObject());
      this.activeWeapon = weapon;
      
      // Debug: Log weapon position and add wireframe
      const weaponObj = weapon.getObject();
      console.log(`Weapon position:`, weaponObj.position);
      console.log(`Weapon rotation:`, weaponObj.rotation);
      console.log(`Weapon scale:`, weaponObj.scale);
      console.log(`Camera position:`, this.camera.position);
      
      // Debug helpers removed - weapon is working
      
      console.log(`Successfully equipped weapon: ${name}`);
      console.log(`Weapon object children count:`, weapon.getObject().children.length);
      return true;
    } catch (error) {
      console.error(`Failed to equip weapon ${name}:`, error);
      return false;
    }
  }

  getActiveWeapon(): Weapon | null {
    return this.activeWeapon;
  }

  update(deltaTime: number, isMoving: boolean = false, currentTime: number = 0): void {
    if (this.activeWeapon) {
      this.activeWeapon.update(deltaTime, this.camera, isMoving, currentTime);
    }
  }

  // Future: weapon switching, inventory management
  switchToNext(): void {
    // Implementation for cycling through weapons
  }

  switchToPrevious(): void {
    // Implementation for cycling through weapons
  }
}