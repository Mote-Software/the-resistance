import * as THREE from "three";
import { RGBELoader, TDSLoader } from "three-stdlib";
import { WeaponManager } from "./weapons/WeaponManager";
import { FNScarConfig } from "./weapons/configs/FNScar";
import { P2PManager } from "./network/P2PManager";
import { CollisionManager } from "./CollisionManager";

class Game {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private p2pManager!: P2PManager;
  private yaw: number = 0;
  private pitch: number = 0;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private weaponManager!: WeaponManager;
  private isMoving: boolean = false;
  private isSprinting: boolean = false;
  private lastWKeyPressTime: number = 0;
  private doubleTapDelay: number = 300; // ms for double-tap detection
  private otherPlayers: Map<string, THREE.Group> = new Map();
  private gameStarted: boolean = false;
  private lastNetworkUpdate: number = 0;
  private networkUpdateInterval: number = 50; // Send updates every 50ms (20 times per second)
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private lastRotation: { x: number; y: number } = { x: 0, y: 0 };
  private positionThreshold: number = 0.05; // Send if moved more than 0.05 units (reduced)
  private rotationThreshold: number = 0.02; // Send if rotated more than 0.02 radians (reduced)
  private collisionManager!: CollisionManager;

  constructor() {
    this.init();
    this.createScene();
    this.setupWeapons();
    this.setupLobby();
    this.animate();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap pixel ratio at 2 for performance while maintaining quality
    // devicePixelRatio of 3+ (like some 4K displays) is overkill
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x87ceeb); // Sky blue

    // Enable shadows for realistic lighting
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows

    // Enable HDR tone mapping with balanced exposure
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.45; // Slightly lower to balance sky brightness
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.appendChild(this.renderer.domElement);

    // Initialize collision manager
    this.collisionManager = new CollisionManager(this.scene, this.camera);
  }

  private createScene() {
    // Add skybox first
    this.createSkybox();

    // Add ambient lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Darker ambient light
    this.scene.add(ambientLight);

    // Configure sun light to match sunset position (low angle, warm color)
    const sunLight = new THREE.DirectionalLight(0xffa500, 2.0); // Warm orange sunset color
    sunLight.position.set(50, 15, 30); // Flipped direction - low angle from opposite horizon
    sunLight.castShadow = true;

    // Configure shadow properties for better quality
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;

    this.scene.add(sunLight);

    // Load town model instead of procedural buildings
    this.loadTownModel();

    // Position camera
    this.camera.position.set(0, 2.5, 5);
  }

  private loadTownModel() {
    console.log("Loading town model...");

    const loader = new TDSLoader();
    // Set resource path so it knows where to find textures
    loader.setResourcePath("/assets/textures/environment/");

    loader.load(
      "/assets/models/environment/Town.3ds",
      (object) => {
        console.log("Town model loaded successfully");

        // Convert materials and scale textures
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];

            materials.forEach((mat: any, index: number) => {
              if (mat) {
                const matName = mat.name ? mat.name.toLowerCase() : "";
                const isWindow = matName.includes("window");

                // Convert to MeshStandardMaterial for better control
                const newMat = new THREE.MeshStandardMaterial({
                  map: mat.map || null,
                  color: mat.color || 0xffffff,
                  roughness: isWindow ? 0.1 : 0.95, // Perfectly smooth for windows, rough for others
                  metalness: isWindow ? 0.8 : 0.0, // Very metallic for windows
                  name: mat.name,
                });

                if (newMat.map) {
                  // Don't repeat doors and windows
                  if (matName.includes("door") || isWindow) {
                    newMat.map.repeat.set(1, 1); // No repetition
                  } else if (
                    matName.includes("floor") ||
                    matName.includes("ground") ||
                    matName.includes("road") ||
                    matName.includes("street")
                  ) {
                    newMat.map.repeat.set(20, 20); // High repetition for floor/ground textures
                  } else {
                    newMat.map.repeat.set(3, 3); // Repeat other textures
                  }
                  newMat.map.wrapS = THREE.RepeatWrapping;
                  newMat.map.wrapT = THREE.RepeatWrapping;
                }

                // Replace material
                if (Array.isArray(child.material)) {
                  child.material[index] = newMat;
                } else {
                  child.material = newMat;
                }
              }
            });

            // Enable shadows for all meshes
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Scale and position the town
        object.scale.set(0.1, 0.1, 0.1);
        object.position.y = 0;

        // Rotate to fix orientation
        object.rotation.x = -Math.PI / 2;

        this.scene.add(object);
        console.log("Town model added to scene");

        // Initialize collision detection after model is loaded
        // Wait a frame to ensure everything is properly added to the scene
        setTimeout(() => {
          this.collisionManager.initializeCollisionObjects();

          // Set map boundaries based on town size (scaled 0.1x)
          // The town model is very large, so we set wider boundaries
          this.collisionManager.setMapBounds(-225, 225, -225, 225);

          // Exclude weapon from collision if already loaded
          if (this.weaponManager) {
            const weapon = this.weaponManager.getActiveWeapon();
            if (weapon) {
              weapon.getObject().traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  this.collisionManager.excludeFromCollision(child);
                }
              });
              console.log("Weapon excluded from collision (post-init)");
            }
          }

          console.log("Collision system initialized");
        }, 100);
      },
      (progress) => {
        console.log(
          `Loading progress: ${(
            (progress.loaded / progress.total) *
            100
          ).toFixed(2)}%`
        );
      },
      (error) => {
        console.error("Failed to load town model:", error);
      }
    );
  }

  private async setupWeapons() {
    // Initialize weapon manager
    this.weaponManager = new WeaponManager(this.scene, this.camera);

    // Register available weapons
    this.weaponManager.registerWeapon(FNScarConfig);

    // Equip default weapon
    try {
      await this.weaponManager.equipWeapon("fn_scar");
      console.log("FN SCAR equipped successfully");

      // Exclude weapon model from collision detection
      const weapon = this.weaponManager.getActiveWeapon();
      if (weapon && this.collisionManager) {
        weapon.getObject().traverse((child) => {
          if (child instanceof THREE.Mesh) {
            this.collisionManager.excludeFromCollision(child);
          }
        });
        console.log("Weapon excluded from collision detection");
      }
    } catch (error) {
      console.error("Failed to equip weapon:", error);
    }
  }

  private createSkybox() {
    // Create skybox geometry - large sphere that surrounds the scene
    const skyboxGeometry = new THREE.SphereGeometry(500, 32, 32);

    // Create material first
    const skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide, // Render on inside of sphere
    });

    // Load HDR skybox using proper HDR loader
    const hdrLoader = new RGBELoader();
    hdrLoader.load(
      "/assets/textures/skyboxes/skybox.hdr",
      (texture) => {
        // Properly configure HDR texture
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.needsUpdate = true;

        // Generate mipmaps for better quality
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;

        // Use the processed environment map
        this.scene.environment = envMap;
        this.scene.background = envMap;

        // Clean up
        pmremGenerator.dispose();
        texture.dispose();

        console.log("Loaded and processed HDR environment map");
      },
      undefined,
      (error) => {
        // Fallback: create procedural gradient skybox
        console.log("HDR load failed, using procedural skybox:", error);

        const canvas = document.createElement("canvas");
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext("2d")!;

        // Create sunset gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, "#87CEEB"); // Sky blue at top
        gradient.addColorStop(0.3, "#FFA07A"); // Light salmon
        gradient.addColorStop(0.6, "#FF6347"); // Tomato/orange
        gradient.addColorStop(0.8, "#FF4500"); // Orange red
        gradient.addColorStop(1, "#2F1B14"); // Dark brown at bottom

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Create texture from canvas
        const fallbackTexture = new THREE.CanvasTexture(canvas);
        fallbackTexture.mapping = THREE.EquirectangularReflectionMapping;

        skyboxMaterial.map = fallbackTexture;
        skyboxMaterial.needsUpdate = true;

        // Create skybox mesh only for fallback
        const skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
        this.scene.add(skyboxMesh);
      }
    );

    // Remove the sky blue clear color since we have a skybox now
    this.renderer.setClearColor(0x000000, 0);
  }

  private setupLobby() {
    const lobbyMenu = document.getElementById("lobbyMenu")!;
    const hostView = document.getElementById("hostView")!;
    const joinView = document.getElementById("joinView")!;
    const createRoomBtn = document.getElementById("createRoomBtn")!;
    const joinRoomBtn = document.getElementById("joinRoomBtn")!;
    const startGameBtn = document.getElementById("startGameBtn")!;
    const joinSubmitBtn = document.getElementById("joinSubmitBtn")!;
    const backBtn = document.getElementById("backBtn")!;
    const roomCodeDisplay = document.getElementById("roomCodeDisplay")!;
    const roomCodeInput = document.getElementById(
      "roomCodeInput"
    ) as HTMLInputElement;

    // Create room button
    createRoomBtn.addEventListener("click", async () => {
      lobbyMenu.classList.add("hidden");
      hostView.classList.remove("hidden");

      this.p2pManager = new P2PManager();

      try {
        const roomCode = await this.p2pManager.createRoom();
        roomCodeDisplay.textContent = roomCode;
        console.log("Room created:", roomCode);

        this.setupP2PCallbacks();
      } catch (error) {
        console.error("Failed to create room:", error);
        alert("Failed to create room. Please try again.");
        hostView.classList.add("hidden");
        lobbyMenu.classList.remove("hidden");
      }
    });

    // Join room button
    joinRoomBtn.addEventListener("click", () => {
      lobbyMenu.classList.add("hidden");
      joinView.classList.remove("hidden");
    });

    // Submit join button
    joinSubmitBtn.addEventListener("click", async () => {
      const roomCode = roomCodeInput.value.trim().toUpperCase();
      if (!roomCode || roomCode.length !== 6) {
        alert("Please enter a valid 6-character room code");
        return;
      }

      this.p2pManager = new P2PManager();

      try {
        await this.p2pManager.joinRoom(roomCode);
        console.log("Joined room:", roomCode);

        this.setupP2PCallbacks();
        this.startGame();
      } catch (error) {
        console.error("Failed to join room:", error);
        alert("Failed to join room. Please check the code and try again.");
      }
    });

    // Back button
    backBtn.addEventListener("click", () => {
      joinView.classList.add("hidden");
      lobbyMenu.classList.remove("hidden");
      roomCodeInput.value = "";
    });

    // Start game button (host only)
    startGameBtn.addEventListener("click", () => {
      this.startGame();
    });
  }

  private setupP2PCallbacks() {
    // Player joined
    this.p2pManager.onPlayerJoined = (playerId, data) => {
      console.log("Player joined:", playerId);
      this.addOtherPlayer(playerId, data.position);
    };

    // Player left
    this.p2pManager.onPlayerLeft = (playerId) => {
      console.log("Player left:", playerId);
      this.removeOtherPlayer(playerId);
    };

    // Player moved
    this.p2pManager.onPlayerMoved = (playerId, data) => {
      this.updateOtherPlayer(playerId, data.position, data.rotation);
    };

    // Player fired
    this.p2pManager.onPlayerFired = (playerId, _position) => {
      const playerMesh = this.otherPlayers.get(playerId);
      if (playerMesh) {
        this.triggerRemotePlayerFire(playerMesh);
      }
    };

    // Connection established
    this.p2pManager.onConnected = () => {
      console.log("P2P connection established");
    };

    // Error
    this.p2pManager.onError = (error) => {
      console.error("P2P error:", error);
      alert(`Connection error: ${error}`);
    };
  }

  private startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;

    // Hide lobby
    const lobby = document.getElementById("lobby")!;
    lobby.classList.add("hidden");

    // Initialize last position/rotation for delta checking
    this.lastPosition.copy(this.camera.position);
    this.lastRotation = { x: this.pitch, y: this.yaw };

    // Setup controls
    this.setupControls();

    console.log("Game started!");
  }

  private shouldSendNetworkUpdate(): boolean {
    const now = Date.now();

    // Check time threshold
    if (now - this.lastNetworkUpdate < this.networkUpdateInterval) {
      return false;
    }

    // Check if position or rotation changed significantly
    const positionDelta = this.camera.position.distanceTo(this.lastPosition);
    const rotationDelta =
      Math.abs(this.pitch - this.lastRotation.x) +
      Math.abs(this.yaw - this.lastRotation.y);

    return (
      positionDelta > this.positionThreshold ||
      rotationDelta > this.rotationThreshold
    );
  }

  private sendNetworkUpdate() {
    if (!this.p2pManager) return;

    this.p2pManager.sendPlayerMove(
      {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      {
        y: this.yaw,
        x: this.pitch,
      }
    );

    // Update last sent values
    this.lastPosition.copy(this.camera.position);
    this.lastRotation = { x: this.pitch, y: this.yaw };
    this.lastNetworkUpdate = Date.now();
  }

  private async addOtherPlayer(id: string, position: any) {
    // Create player body (reduced geometry complexity)
    const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1.0, 3, 6); // Reduced from 4, 8
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.8,
      metalness: 0.0,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = -0.25;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;

    // Create player head (reduced geometry complexity)
    const headGeometry = new THREE.CapsuleGeometry(0.3, 0.3, 3, 6); // Reduced from 4, 8
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.8,
      metalness: 0.0,
    });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.position.y = 0.6;
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;

    // Create container for player
    const playerMesh = new THREE.Group();
    playerMesh.add(bodyMesh);
    playerMesh.add(headMesh);

    // Store head reference for rotation
    (playerMesh as any).head = headMesh;

    // Add muzzle flash to weapon
    this.addMuzzleFlashToPlayer(playerMesh);

    // Position at ground level (capsule center, camera is at y=2.5)
    playerMesh.position.set(position.x, 1.75, position.z);

    // Load weapon for the other player
    const weaponManager = new WeaponManager(this.scene, this.camera);
    weaponManager.registerWeapon(FNScarConfig);
    try {
      await weaponManager.equipWeapon("fn_scar");
      const weapon = weaponManager.getActiveWeapon();
      if (weapon) {
        const weaponModel = weapon.getObject();
        // Position weapon relative to player body (third-person view)
        weaponModel.position.set(0.5, -0.5, -0.9);
        weaponModel.rotation.set(0, 0, 0);
        weaponModel.scale.set(0.003, 0.003, 0.003);

        // Remove from scene since WeaponManager added it there
        this.scene.remove(weaponModel);

        // Add to head so weapon rotates with look direction
        headMesh.add(weaponModel);
      }
    } catch (error) {
      console.error("Failed to load weapon for other player:", error);
    }

    this.otherPlayers.set(id, playerMesh);
    this.scene.add(playerMesh);

    // Exclude player meshes from collision detection
    if (this.collisionManager) {
      playerMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.collisionManager.excludeFromCollision(child);
        }
      });
    }
  }

  private addMuzzleFlashToPlayer(playerMesh: THREE.Group) {
    const head = (playerMesh as any).head;
    if (!head) return;

    // Skip point light for performance - they cause massive lag from shadow updates
    // Just use sprite which is much lighter

    // Create muzzle flash sprite only
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.3, "rgba(255, 200, 100, 0.8)");
    gradient.addColorStop(1, "rgba(255, 100, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const flashSprite = new THREE.Sprite(spriteMaterial);
    flashSprite.scale.set(0.6, 0.6, 1); // Match your weapon flash size
    flashSprite.position.set(0.5, -0.25, -2); // Adjusted to weapon barrel position
    flashSprite.visible = false;
    flashSprite.renderOrder = 999;
    head.add(flashSprite);

    // Store references (no muzzleFlash light)
    (playerMesh as any).muzzleFlash = null;
    (playerMesh as any).muzzleFlashSprite = flashSprite;
    (playerMesh as any).muzzleFlashTime = 0;

    // Load gunshot sound
    const fireSound = new Audio("/assets/sounds/fn_scar_gun.mp3");
    fireSound.volume = 0.3; // Quieter for other players
    fireSound.preload = "auto";
    (playerMesh as any).fireSound = fireSound;
  }

  private triggerRemotePlayerFire(playerMesh: THREE.Group) {
    const flashSprite = (playerMesh as any).muzzleFlashSprite;
    const fireSound = (playerMesh as any).fireSound;

    // Show muzzle flash sprite only (no light for performance)
    if (flashSprite) {
      flashSprite.visible = true;
      (playerMesh as any).muzzleFlashTime = 0.05;

      // Random rotation and scale
      flashSprite.material.rotation = Math.random() * Math.PI * 2;
      const randomScale = 0.5 + Math.random() * 0.2;
      flashSprite.scale.set(randomScale, randomScale, 1);
    }

    // Play sound with distance-based volume
    if (fireSound) {
      // Calculate distance from camera to other player
      const distance = this.camera.position.distanceTo(playerMesh.position);

      // Calculate volume based on distance (inverse square law)
      // Max volume at close range, fades to 0 at maxDistance
      const maxDistance = 50; // Distance at which sound is inaudible
      const minDistance = 5; // Distance at which sound is at max volume

      let volume = 0;
      if (distance < minDistance) {
        volume = 0.7; // Max volume for close range
      } else if (distance < maxDistance) {
        // Linear falloff (could also use inverse square: 1 / (distance * distance))
        volume =
          0.7 * (1 - (distance - minDistance) / (maxDistance - minDistance));
      }

      const sound = fireSound.cloneNode() as HTMLAudioElement;
      sound.volume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
      sound
        .play()
        .catch((err) => console.warn("Failed to play remote fire sound:", err));
    }
  }

  private removeOtherPlayer(id: string) {
    const playerMesh = this.otherPlayers.get(id);
    if (playerMesh) {
      this.scene.remove(playerMesh);
      // Dispose of all geometries and materials in the group
      playerMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.otherPlayers.delete(id);
    }
  }

  private updateOtherPlayer(id: string, position: any, rotation: any) {
    const playerMesh = this.otherPlayers.get(id);
    if (playerMesh) {
      playerMesh.position.set(position.x, 1.75, position.z);
      if (rotation) {
        // Rotate body based on yaw
        playerMesh.rotation.y = rotation.y;

        // Rotate head based on pitch
        const head = (playerMesh as any).head;
        if (head && rotation.x !== undefined) {
          head.rotation.x = rotation.x;
        }
      }
    }
  }

  private updateOtherPlayerEffects(deltaTime: number) {
    this.otherPlayers.forEach((playerMesh) => {
      // Update muzzle flash (sprite only, no light)
      if ((playerMesh as any).muzzleFlashTime > 0) {
        (playerMesh as any).muzzleFlashTime -= deltaTime;
        if ((playerMesh as any).muzzleFlashTime <= 0) {
          const flashSprite = (playerMesh as any).muzzleFlashSprite;
          if (flashSprite) flashSprite.visible = false;
        }
      }
    });
  }

  private setupControls() {
    // Request pointer lock on click
    document.addEventListener("click", () => {
      // Request pointer lock if not already locked
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
      } else {
        // If already locked, fire weapon
        this.weaponManager.fire();

        // Broadcast fire event to other players
        if (this.p2pManager) {
          this.p2pManager.sendPlayerFired({
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
          });
        }
      }
    });

    // Handle mouse look when pointer is locked
    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement === document.body) {
        const sensitivity = 0.002;

        // Update yaw and pitch angles
        this.yaw -= event.movementX * sensitivity;
        this.pitch -= event.movementY * sensitivity;

        // Clamp pitch to prevent over-rotation
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

        // Apply rotation using quaternion to avoid gimbal lock
        this.camera.quaternion.setFromEuler(
          new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
        );

        // Broadcast rotation to other players (throttled with delta check)
        if (this.shouldSendNetworkUpdate()) {
          this.sendNetworkUpdate();
        }
      }
    });

    // Basic WASD movement
    const keys: { [key: string]: boolean } = {};

    document.addEventListener("keydown", (event) => {
      const wasPressed = keys[event.code];
      keys[event.code] = true;

      // Double-tap W detection for sprinting
      if (event.code === "KeyW" && !wasPressed) {
        const currentTime = Date.now();
        if (currentTime - this.lastWKeyPressTime < this.doubleTapDelay) {
          this.isSprinting = true;
        }
        this.lastWKeyPressTime = currentTime;
      }

      // Handle ADS (Aim Down Sights) with Shift key
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.weaponManager.startAiming();
      }
    });

    document.addEventListener("keyup", (event) => {
      keys[event.code] = false;

      // Stop sprinting when W is released
      if (event.code === "KeyW") {
        this.isSprinting = false;
      }

      // Stop ADS when Shift is released
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        this.weaponManager.stopAiming();
      }
    });

    // Handle movement in animation loop
    this.handleMovement = (deltaTime: number) => {
      const baseSpeed = 7.0; // Increased base speed from 5.0
      const sprintMultiplier = 1.6; // Sprint is 60% faster
      const speed = this.isSprinting ? baseSpeed * sprintMultiplier : baseSpeed;
      const direction = new THREE.Vector3();

      if (keys["KeyW"]) direction.z -= speed * deltaTime;
      if (keys["KeyS"]) direction.z += speed * deltaTime;
      if (keys["KeyA"]) direction.x -= speed * deltaTime;
      if (keys["KeyD"]) direction.x += speed * deltaTime;

      // Track if player is moving for weapon sway
      this.isMoving = direction.length() > 0;

      if (this.isMoving) {
        direction.applyQuaternion(this.camera.quaternion);
        direction.y = 0; // Keep movement on ground level

        // Calculate new position with collision detection
        const currentPosition = this.camera.position.clone();
        const newPosition = currentPosition.clone().add(direction);

        // Validate movement through collision manager
        if (this.collisionManager) {
          const validatedPosition = this.collisionManager.validateMovement(
            currentPosition,
            newPosition
          );
          this.camera.position.copy(validatedPosition);
        } else {
          // Fallback if collision manager not initialized yet
          this.camera.position.add(direction);
        }

        // Broadcast position to other players (throttled with delta check)
        if (this.shouldSendNetworkUpdate()) {
          this.sendNetworkUpdate();
        }
      }
    };
  }

  private handleMovement(_deltaTime: number) {
    // Movement handling is set up in setupControls
  }

  private updateFPS(currentTime: number) {
    this.frameCount++;

    // Update FPS every second
    if (currentTime - this.fpsUpdateTime >= 1000) {
      const fps = Math.round(
        (this.frameCount * 1000) / (currentTime - this.fpsUpdateTime)
      );
      const fpsElement = document.getElementById("fps");
      if (fpsElement) {
        fpsElement.textContent = `FPS: ${fps}`;
      }
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }
  }

  private animate(currentTime: number = 0) {
    requestAnimationFrame((time) => this.animate(time));

    // Calculate delta time in seconds
    const deltaTime =
      this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.updateFPS(currentTime);
    this.handleMovement(deltaTime);

    // Update weapon system
    if (this.weaponManager) {
      this.weaponManager.update(
        deltaTime,
        this.isMoving,
        currentTime * 0.001,
        this.isSprinting
      );
    }

    // Update other player effects (muzzle flash)
    this.updateOtherPlayerEffects(deltaTime);

    this.renderer.render(this.scene, this.camera);
  }

  // Handle window resize
  public onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Initialize the game
const game = new Game();

// Handle window resize
window.addEventListener("resize", () => game.onWindowResize());
