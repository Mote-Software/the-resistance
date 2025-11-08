import * as THREE from "three";

export class CollisionManager {
  private scene: THREE.Scene;
  private collisionObjects: THREE.Object3D[] = [];
  private raycaster: THREE.Raycaster;

  // Map boundaries (will be set based on the town size)
  private mapBounds = {
    minX: -50,
    maxX: 50,
    minZ: -50,
    maxZ: 50,
  };

  // Collision detection parameters
  private readonly PLAYER_RADIUS = 0.6; // Player capsule radius (slightly larger to catch thin barriers)
  private readonly COLLISION_DISTANCE = 1.2; // Distance to check for collisions (increased for barrier detection)
  private readonly RAY_DIRECTIONS = 6; // 6 rays around player (60 degree intervals) for better barrier detection

  // Reusable Vector3 objects to avoid garbage collection overhead
  private readonly tempVec1 = new THREE.Vector3();
  private readonly tempVec2 = new THREE.Vector3();
  private readonly tempVec3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.COLLISION_DISTANCE;
  }

  /**
   * Initialize collision objects from the scene
   * This should be called after the town model is loaded
   */
  public initializeCollisionObjects() {
    this.collisionObjects = [];

    // Find the town model group and add all its meshes
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // Only add meshes that are part of the environment (not UI, not weapons)
        // We'll exclude specific objects later
        this.collisionObjects.push(object);
      }
    });

    console.log(`Initialized ${this.collisionObjects.length} collision objects`);

    // Log some object names and materials to help debug barrier issue
    if (this.collisionObjects.length > 0) {
      console.log("Sample collision objects:",
        this.collisionObjects.slice(0, 10).map(obj => {
          const mat = (obj as THREE.Mesh).material;
          const matName = Array.isArray(mat) ? mat[0]?.name : (mat as any)?.name;
          return `${obj.name || "unnamed"} (material: ${matName || "none"})`;
        })
      );

      // Find barrier objects - check both material name and texture
      const barriers = this.collisionObjects.filter(obj => {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        return materials.some((m: any) => {
          const matName = m?.name?.toLowerCase() || '';
          const hasBarrierName = matName.includes('barrier');

          // Check texture map source
          let hasBarrierTexture = false;
          if (m?.map?.image?.src) {
            hasBarrierTexture = m.map.image.src.includes('BARRIER');
          } else if (m?.map?.image?.currentSrc) {
            hasBarrierTexture = m.map.image.currentSrc.includes('BARRIER');
          }

          return hasBarrierName || hasBarrierTexture;
        });
      });

      console.log(`Found ${barriers.length} barrier objects`);
      if (barriers.length > 0) {
        barriers.slice(0, 3).forEach(b => {
          const mesh = b as THREE.Mesh;
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          console.log(`Barrier: ${b.name}, material: ${(mat as any)?.name}, texture: ${(mat as any)?.map?.image?.src || 'none'}`);
        });
      }
    }
  }

  /**
   * Set custom map boundaries
   */
  public setMapBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.mapBounds = { minX, maxX, minZ, maxZ };
    console.log("Map bounds set:", this.mapBounds);
  }

  /**
   * Check if a position is within map boundaries
   */
  private isWithinBounds(position: THREE.Vector3): boolean {
    return (
      position.x >= this.mapBounds.minX &&
      position.x <= this.mapBounds.maxX &&
      position.z >= this.mapBounds.minZ &&
      position.z <= this.mapBounds.maxZ
    );
  }

  /**
   * Check for collisions in a given direction
   * Returns true if there's a collision
   */
  private checkCollisionInDirection(
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ): boolean {
    this.raycaster.set(origin, direction);

    // Check intersections with all collision objects
    // Note: We can't use spatial filtering on object.position because
    // meshes might be far from their parent's origin (e.g., town model children)
    const intersections = this.raycaster.intersectObjects(
      this.collisionObjects,
      false
    );

    // Check if any intersection is within collision distance
    // Early exit on first found intersection for performance
    if (intersections.length > 0 && intersections[0].distance < this.COLLISION_DISTANCE) {
      // Debug: log barrier collisions
      const mesh = intersections[0].object as THREE.Mesh;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const matName = (mat as any)?.name || '';
      if (matName.toLowerCase().includes('barrier')) {
        console.log('Barrier collision detected!', mesh.name, 'distance:', intersections[0].distance);
      }
      return true;
    }
    return false;
  }

  /**
   * Validate a new position and return a corrected position if needed
   * This checks both map boundaries and collisions with objects
   */
  public validateMovement(
    currentPosition: THREE.Vector3,
    newPosition: THREE.Vector3
  ): THREE.Vector3 {
    // Quick check: if positions are the same, skip all collision checks
    const movementDelta = newPosition.distanceTo(currentPosition);
    if (movementDelta < 0.001) {
      return currentPosition.clone();
    }

    const validatedPosition = newPosition.clone();

    // First, check map boundaries
    validatedPosition.x = Math.max(
      this.mapBounds.minX,
      Math.min(this.mapBounds.maxX, validatedPosition.x)
    );
    validatedPosition.z = Math.max(
      this.mapBounds.minZ,
      Math.min(this.mapBounds.maxZ, validatedPosition.z)
    );

    // Calculate movement direction
    const movementDirection = new THREE.Vector3()
      .subVectors(validatedPosition, currentPosition)
      .normalize();

    // If no movement after boundary check, return current position
    if (movementDirection.length() === 0) {
      return currentPosition.clone();
    }

    // Check for collisions using raycasting in multiple directions around the player
    // This creates a cylinder-like collision detection
    const hasCollision = this.checkCollisionsAroundPlayer(
      currentPosition,
      movementDirection
    );

    if (hasCollision) {
      // Try sliding along walls by checking X and Z movement separately
      const slidePosition = this.trySlideMovement(
        currentPosition,
        validatedPosition
      );
      return slidePosition;
    }

    return validatedPosition;
  }

  /**
   * Check for collisions in multiple directions around the player
   * This creates more robust collision detection
   */
  private checkCollisionsAroundPlayer(
    position: THREE.Vector3,
    direction: THREE.Vector3
  ): boolean {
    // IMPORTANT: Check at multiple heights to catch short barriers
    // Player is at y=2.5, but barriers might be shorter (e.g., 1.5 units tall)
    const heightsToCheck = [
      0,      // Ground level - catch low barriers
      -0.75,  // Below player center - catch waist-height barriers
      -1.5,   // Player feet level - catch knee-height barriers
    ];

    for (const heightOffset of heightsToCheck) {
      // Create position at different height
      this.tempVec3.copy(position);
      this.tempVec3.y += heightOffset;

      // First check center ray at this height
      if (this.checkCollisionInDirection(this.tempVec3, direction)) {
        return true;
      }

      // Check radial rays at this height
      const angleStep = (Math.PI * 2) / this.RAY_DIRECTIONS;

      for (let i = 0; i < this.RAY_DIRECTIONS; i++) {
        const angle = i * angleStep;

        // Create a ray origin with radial offset
        this.tempVec1.set(
          Math.cos(angle) * this.PLAYER_RADIUS,
          0,
          Math.sin(angle) * this.PLAYER_RADIUS
        );

        this.tempVec2.copy(this.tempVec3).add(this.tempVec1);

        if (this.checkCollisionInDirection(this.tempVec2, direction)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Try to slide along walls when direct movement is blocked
   * This allows players to slide along walls instead of getting stuck
   */
  private trySlideMovement(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3
  ): THREE.Vector3 {
    // Try moving only in X direction
    const xOnlyPosition = new THREE.Vector3(
      targetPosition.x,
      currentPosition.y,
      currentPosition.z
    );

    const xDirection = new THREE.Vector3()
      .subVectors(xOnlyPosition, currentPosition)
      .normalize();

    if (xDirection.length() > 0 && !this.checkCollisionsAroundPlayer(currentPosition, xDirection)) {
      // Check if the X-only movement is within bounds
      if (this.isWithinBounds(xOnlyPosition)) {
        return xOnlyPosition;
      }
    }

    // Try moving only in Z direction
    const zOnlyPosition = new THREE.Vector3(
      currentPosition.x,
      currentPosition.y,
      targetPosition.z
    );

    const zDirection = new THREE.Vector3()
      .subVectors(zOnlyPosition, currentPosition)
      .normalize();

    if (zDirection.length() > 0 && !this.checkCollisionsAroundPlayer(currentPosition, zDirection)) {
      // Check if the Z-only movement is within bounds
      if (this.isWithinBounds(zOnlyPosition)) {
        return zOnlyPosition;
      }
    }

    // If both fail, don't move
    return currentPosition.clone();
  }

  /**
   * Remove specific objects from collision detection
   * Useful for excluding player meshes
   */
  public excludeFromCollision(object: THREE.Object3D) {
    const index = this.collisionObjects.indexOf(object);
    if (index > -1) {
      this.collisionObjects.splice(index, 1);
    }
  }

  /**
   * Add an object to collision detection
   */
  public addCollisionObject(object: THREE.Object3D) {
    if (!this.collisionObjects.includes(object)) {
      this.collisionObjects.push(object);
    }
  }
}
