import * as THREE from "three";
import { FBXLoader } from "three-stdlib";

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
  adsPosition: THREE.Vector3;
  adsRotation: THREE.Euler;
  adsScale: THREE.Vector3;
}

export class Weapon {
  private group: THREE.Group;
  private config: WeaponConfig;
  private isLoaded: boolean = false;
  private isAiming: boolean = false;
  private aimTransition: number = 0; // 0 = hip fire, 1 = ADS
  private aimSpeed: number = 8; // Transition speed
  private muzzleFlash: THREE.PointLight | null = null;
  private muzzleFlashSprites: THREE.Sprite[] = [];
  private muzzleFlashTime: number = 0;
  private recoilOffset: THREE.Vector3 = new THREE.Vector3();
  private recoilRotation: THREE.Euler = new THREE.Euler();
  private recoilRecoverySpeed: number = 10; // How fast recoil recovers
  private fireSound: HTMLAudioElement | null = null;

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

          // Keep exact original FBX material colors with PBR textures
          console.log("Traversing object for meshes...");
          const textureLoader = new THREE.TextureLoader();
          const normalTexture = textureLoader.load(this.config.textures.normal);
          const roughnessTexture = textureLoader.load(
            this.config.textures.roughness
          );
          const metalnessTexture = textureLoader.load(
            this.config.textures.metalness
          );

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              console.log(`Processing mesh: ${child.name}`);
              child.castShadow = true;
              child.receiveShadow = true;

              const originalMat = child.material;

              // Handle array of materials (multi-material mesh)
              if (Array.isArray(originalMat)) {
                console.log(`Mesh has ${originalMat.length} materials`);
                child.material = originalMat.map((mat: any, index: number) => {
                  let color = mat.color ? mat.color.getHex() : 0x83755c;
                  // Darken colors slightly to reduce brightness
                  const colorObj = new THREE.Color(color);
                  colorObj.multiplyScalar(0.8); // Darken by 30%
                  console.log(
                    `Material ${index}: original 0x${color.toString(
                      16
                    )}, darkened to 0x${colorObj.getHex().toString(16)}`
                  );
                  return new THREE.MeshStandardMaterial({
                    color: colorObj,
                    normalMap: normalTexture,
                    roughnessMap: roughnessTexture,
                    metalnessMap: metalnessTexture,
                    roughness: 1.0, // Maximum roughness for completely matte
                    metalness: 0.0, // No metalness at all
                  });
                });
              } else if (originalMat) {
                // Single material
                const mat = originalMat as any;
                let color = mat.color ? mat.color.getHex() : 0x83755c;
                // Darken colors slightly to reduce brightness
                const colorObj = new THREE.Color(color);
                colorObj.multiplyScalar(0.7); // Darken by 30%
                console.log(
                  `Single material: original 0x${color.toString(
                    16
                  )}, darkened to 0x${colorObj.getHex().toString(16)}`
                );
                child.material = new THREE.MeshStandardMaterial({
                  color: colorObj,
                  normalMap: normalTexture,
                  roughnessMap: roughnessTexture,
                  metalnessMap: metalnessTexture,
                  roughness: 1.0, // Maximum roughness for completely matte
                  metalness: 0.0, // No metalness at all
                });
              }
            }
          });

          // Apply transform to the group instead of the object
          this.group.add(object);
          this.group.position.copy(this.config.position);
          this.group.rotation.copy(this.config.rotation);
          this.group.scale.copy(this.config.scale);

          // Create muzzle flash effect
          this.createMuzzleFlash();

          // Load fire sound
          this.loadFireSound();

          this.isLoaded = true;
          console.log(`Weapon ${this.config.name} loaded and positioned`);
          resolve();
        },
        (progress) => {
          console.log(
            `Loading progress: ${this.config.name} - ${
              (progress.loaded / progress.total) * 100
            }%`
          );
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
    const albedoTexture = textureLoader.load(
      this.config.textures.albedo,
      () => {
        console.log(`Loaded albedo texture: ${this.config.textures.albedo}`);
      }
    );
    const normalTexture = textureLoader.load(
      this.config.textures.normal,
      () => {
        console.log(`Loaded normal texture: ${this.config.textures.normal}`);
      }
    );
    const roughnessTexture = textureLoader.load(
      this.config.textures.roughness,
      () => {
        console.log(
          `Loaded roughness texture: ${this.config.textures.roughness}`
        );
      }
    );
    const metalnessTexture = textureLoader.load(
      this.config.textures.metalness,
      () => {
        console.log(
          `Loaded metalness texture: ${this.config.textures.metalness}`
        );
      }
    );
    const aoTexture = textureLoader.load(this.config.textures.ao, () => {
      console.log(`Loaded AO texture: ${this.config.textures.ao}`);
    });

    // Create PBR material matching Blender setup - no albedo map, just base color
    const material = new THREE.MeshStandardMaterial({
      color: 0x83755c, // Tan/beige base color from Blender
      normalMap: normalTexture,
      roughness: 1.0, // Full roughness for completely matte finish
      metalness: 0.0, // No metalness - painted surface
    });

    // Ensure mesh has UV2 for AO map
    if (mesh.geometry.attributes.uv && !mesh.geometry.attributes.uv2) {
      mesh.geometry.setAttribute("uv2", mesh.geometry.attributes.uv);
    }

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

  // ADS control methods
  startAiming(): void {
    this.isAiming = true;
  }

  stopAiming(): void {
    this.isAiming = false;
  }

  getAimTransition(): number {
    return this.aimTransition;
  }

  // Create muzzle flash effect
  private createMuzzleFlash(): void {
    // Create point light for muzzle flash - much brighter and larger range
    this.muzzleFlash = new THREE.PointLight(0xffaa00, 50, 30);
    this.muzzleFlash.position.set(0, 0, -0.8); // Position at barrel end
    this.muzzleFlash.visible = false;
    this.group.add(this.muzzleFlash);

    // Create multiple flash sprites for more realistic effect
    // Sprite 1: Circular flash
    const circleTexture = this.createCircularFlashTexture();
    const circleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: circleTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }));
    circleSprite.scale.set(1.2, 1.2, 1);
    circleSprite.position.set(0, 0, -0.8);
    circleSprite.visible = false;
    circleSprite.renderOrder = 999;
    this.group.add(circleSprite);
    this.muzzleFlashSprites.push(circleSprite);

    // Sprite 2: Star-shaped flash
    const starTexture = this.createStarFlashTexture();
    const starSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }));
    starSprite.scale.set(1.0, 1.0, 1);
    starSprite.position.set(0, 0, -0.8);
    starSprite.visible = false;
    starSprite.renderOrder = 1000;
    this.group.add(starSprite);
    this.muzzleFlashSprites.push(starSprite);

    // Sprite 3: Cross-shaped flash
    const crossTexture = this.createCrossFlashTexture();
    const crossSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: crossTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }));
    crossSprite.scale.set(1.4, 1.4, 1);
    crossSprite.position.set(0, 0, -0.8);
    crossSprite.visible = false;
    crossSprite.renderOrder = 998;
    this.group.add(crossSprite);
    this.muzzleFlashSprites.push(crossSprite);
  }

  private createCircularFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.1, "rgba(255, 255, 200, 1)");
    gradient.addColorStop(0.3, "rgba(255, 200, 100, 0.9)");
    gradient.addColorStop(0.6, "rgba(255, 150, 0, 0.6)");
    gradient.addColorStop(1, "rgba(255, 100, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    return new THREE.CanvasTexture(canvas);
  }

  private createStarFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(255, 255, 255, 0)";
    ctx.fillRect(0, 0, 256, 256);

    // Draw star pattern
    ctx.translate(128, 128);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const gradient = ctx.createLinearGradient(0, 0, Math.cos(angle) * 120, Math.sin(angle) * 120);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(0.3, "rgba(255, 220, 100, 0.8)");
      gradient.addColorStop(0.6, "rgba(255, 150, 0, 0.4)");
      gradient.addColorStop(1, "rgba(255, 100, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 120, angle - 0.2, angle + 0.2);
      ctx.closePath();
      ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
  }

  private createCrossFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(255, 255, 255, 0)";
    ctx.fillRect(0, 0, 256, 256);

    // Draw cross pattern (4 rays)
    ctx.translate(128, 128);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const gradient = ctx.createLinearGradient(0, 0, Math.cos(angle) * 100, Math.sin(angle) * 100);
      gradient.addColorStop(0, "rgba(255, 255, 200, 0.9)");
      gradient.addColorStop(0.4, "rgba(255, 180, 80, 0.6)");
      gradient.addColorStop(1, "rgba(255, 120, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(
        Math.cos(angle) * -10 - 15,
        Math.sin(angle) * -10 - 15,
        100,
        30
      );
    }

    return new THREE.CanvasTexture(canvas);
  }

  private loadFireSound(): void {
    this.fireSound = new Audio('/assets/sounds/fn_scar_gun.mp3');
    this.fireSound.volume = 0.7; // Adjust volume (0.0 to 1.0)
    this.fireSound.preload = 'auto';
  }

  // Fire the weapon
  fire(): void {
    if (!this.isLoaded) return;

    // Trigger muzzle flash light
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = true;
      this.muzzleFlashTime = 0.08;
    }

    // Trigger all muzzle flash sprites with random rotations
    this.muzzleFlashSprites.forEach((sprite, index) => {
      sprite.visible = true;
      sprite.material.rotation = Math.random() * Math.PI * 2;

      // Slight scale variation per sprite
      const baseScale = [1.2, 1.0, 1.4][index];
      const randomScale = baseScale * (1.0 + Math.random() * 0.3);
      sprite.scale.set(randomScale, randomScale, 1);
    });

    // Play fire sound
    if (this.fireSound) {
      // Clone and play to allow rapid fire without cutting off previous sound
      const sound = this.fireSound.cloneNode() as HTMLAudioElement;
      sound.volume = this.fireSound.volume;
      sound.play().catch(err => console.warn('Failed to play fire sound:', err));
    }

    // Apply recoil
    const recoilAmount = this.isAiming ? 0.02 : 0.04; // Less recoil when aiming
    this.recoilOffset.z = recoilAmount; // Push weapon backward (toward player)
    this.recoilOffset.y = recoilAmount * 0.2; // Slight upward movement
    this.recoilRotation.x = 0;
    this.recoilRotation.z = 0;

    console.log("Weapon fired!");
  }

  // Update weapon position to stay relative to camera
  update(
    deltaTime: number,
    camera: THREE.Camera,
    isMoving: boolean = false,
    currentTime: number = 0,
    isSprinting: boolean = false
  ): void {
    if (this.isLoaded) {
      // Update ADS transition
      const targetTransition = this.isAiming ? 1 : 0;
      const transitionSpeed = this.aimSpeed * deltaTime;
      this.aimTransition = THREE.MathUtils.lerp(
        this.aimTransition,
        targetTransition,
        transitionSpeed
      );

      // Interpolate between hip and ADS positions
      const hipPosition = this.config.position.clone();
      const adsPosition = this.config.adsPosition.clone();
      const interpolatedPosition = hipPosition.lerp(
        adsPosition,
        this.aimTransition
      );

      // Interpolate between hip and ADS rotations
      const hipRotation = this.config.rotation.clone();
      const adsRotation = this.config.adsRotation.clone();
      const interpolatedRotation = new THREE.Euler(
        THREE.MathUtils.lerp(hipRotation.x, adsRotation.x, this.aimTransition),
        THREE.MathUtils.lerp(hipRotation.y, adsRotation.y, this.aimTransition),
        THREE.MathUtils.lerp(hipRotation.z, adsRotation.z, this.aimTransition)
      );

      // Interpolate scale
      const hipScale = this.config.scale.clone();
      const adsScale = this.config.adsScale.clone();
      const interpolatedScale = hipScale.lerp(adsScale, this.aimTransition);

      // Update muzzle flash
      if (this.muzzleFlashTime > 0) {
        this.muzzleFlashTime -= deltaTime;
        if (this.muzzleFlashTime <= 0) {
          if (this.muzzleFlash) this.muzzleFlash.visible = false;
          this.muzzleFlashSprites.forEach(sprite => sprite.visible = false);
        }
      }

      // Recover from recoil
      this.recoilOffset.lerp(new THREE.Vector3(0, 0, 0), deltaTime * this.recoilRecoverySpeed);
      this.recoilRotation.x = THREE.MathUtils.lerp(this.recoilRotation.x, 0, deltaTime * this.recoilRecoverySpeed);
      this.recoilRotation.z = THREE.MathUtils.lerp(this.recoilRotation.z, 0, deltaTime * this.recoilRecoverySpeed);

      // Create world position based on camera position + interpolated offset
      const offset = interpolatedPosition.clone();

      // Apply recoil offset
      offset.add(this.recoilOffset);

      // Reduce weapon sway when aiming, increase when sprinting
      const swayMultiplier = 1 - this.aimTransition * 0.7; // 70% reduction when fully aimed
      const sprintMultiplier = isSprinting ? 2.5 : 1; // 2.5x more sway when sprinting
      if (isMoving && swayMultiplier > 0) {
        const swayAmount = 0.01 * swayMultiplier * sprintMultiplier;
        const swaySpeed = isSprinting ? 12 : 8; // Faster sway when sprinting
        offset.x += Math.sin(currentTime * swaySpeed) * swayAmount;
        offset.y += Math.sin(currentTime * swaySpeed * 2) * swayAmount * 0.5;
        offset.z += Math.cos(currentTime * swaySpeed) * swayAmount * 0.3;
      }

      offset.applyQuaternion(camera.quaternion);
      this.group.position.copy(camera.position).add(offset);

      // Apply camera rotation plus interpolated weapon rotation
      this.group.rotation.copy(camera.rotation);
      this.group.rotateY(interpolatedRotation.y);
      this.group.rotateX(interpolatedRotation.x + this.recoilRotation.x);
      this.group.rotateZ(interpolatedRotation.z + this.recoilRotation.z);

      // Apply interpolated scale
      this.group.scale.copy(interpolatedScale);

      // Add subtle rotation sway when moving (reduced when aiming, enhanced when sprinting)
      if (isMoving && swayMultiplier > 0) {
        const rotSway = 0.005 * swayMultiplier * sprintMultiplier;
        const rotSpeed = isSprinting ? 10 : 6; // Faster rotation when sprinting
        this.group.rotateZ(Math.sin(currentTime * rotSpeed) * rotSway);
        this.group.rotateX(Math.cos(currentTime * (rotSpeed * 1.3)) * rotSway * 0.5);

        // Additional roll rotation when sprinting for more dynamic feel
        if (isSprinting) {
          this.group.rotateY(Math.sin(currentTime * rotSpeed * 0.5) * rotSway * 0.3);
        }
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
      console.log(
        `Weapon object children count:`,
        weapon.getObject().children.length
      );
      return true;
    } catch (error) {
      console.error(`Failed to equip weapon ${name}:`, error);
      return false;
    }
  }

  getActiveWeapon(): Weapon | null {
    return this.activeWeapon;
  }

  update(
    deltaTime: number,
    isMoving: boolean = false,
    currentTime: number = 0,
    isSprinting: boolean = false
  ): void {
    if (this.activeWeapon) {
      this.activeWeapon.update(deltaTime, this.camera, isMoving, currentTime, isSprinting);
    }
  }

  // Future: weapon switching, inventory management
  switchToNext(): void {
    // Implementation for cycling through weapons
  }

  switchToPrevious(): void {
    // Implementation for cycling through weapons
  }

  // ADS control methods
  startAiming(): void {
    if (this.activeWeapon) {
      this.activeWeapon.startAiming();
    }
  }

  stopAiming(): void {
    if (this.activeWeapon) {
      this.activeWeapon.stopAiming();
    }
  }

  getAimTransition(): number {
    return this.activeWeapon ? this.activeWeapon.getAimTransition() : 0;
  }

  // Fire the active weapon
  fire(): void {
    if (this.activeWeapon) {
      this.activeWeapon.fire();
    }
  }
}
