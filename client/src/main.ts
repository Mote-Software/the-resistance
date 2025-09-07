import * as THREE from 'three';
import { io } from 'socket.io-client';
import { RGBELoader } from 'three-stdlib';

class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private socket: any;
  private yaw: number = 0;
  private pitch: number = 0;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;

  constructor() {
    this.init();
    this.createScene();
    this.connectToServer();
    this.animate();
    this.setupControls();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87CEEB); // Sky blue
    
    // Enable shadows for realistic lighting
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
    
    // Enable HDR tone mapping with balanced exposure
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.45; // Slightly lower to balance sky brightness
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    document.body.appendChild(this.renderer.domElement);
  }

  private createScene() {
    // Add skybox first
    this.createSkybox();

    // Add ambient lighting (much brighter for ground visibility)
    const ambientLight = new THREE.AmbientLight(0x808080, 1.5); // Much brighter ambient to illuminate ground
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

    // Create a bright concrete ground plane (urban wartime setting)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xaaaaaa }); // Much brighter gray concrete
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Add some basic buildings/cover
    for (let i = 0; i < 10; i++) {
      const buildingGeometry = new THREE.BoxGeometry(
        Math.random() * 3 + 1,
        Math.random() * 5 + 2,
        Math.random() * 3 + 1
      );
      const buildingMaterial = new THREE.MeshLambertMaterial({ 
        color: new THREE.Color().setHSL(0, 0, Math.random() * 0.4 + 0.6) // Much brighter, less brown
      });
      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      
      building.position.x = (Math.random() - 0.5) * 50;
      building.position.z = (Math.random() - 0.5) * 50;
      building.position.y = buildingGeometry.parameters.height / 2;
      
      // Enable shadows for buildings
      building.castShadow = true;
      building.receiveShadow = true;
      
      this.scene.add(building);
    }

    // Position camera
    this.camera.position.set(0, 1.8, 5);
  }

  private createSkybox() {
    // Create skybox geometry - large sphere that surrounds the scene
    const skyboxGeometry = new THREE.SphereGeometry(500, 32, 32);
    
    // Create material first
    const skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide // Render on inside of sphere
    });
    
    // Load HDR skybox using proper HDR loader
    const hdrLoader = new RGBELoader();
    hdrLoader.load(
      '/skybox.hdr',
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
        
        console.log('Loaded and processed HDR environment map');
      },
      undefined,
      (error) => {
        // Fallback: create procedural gradient skybox
        console.log('HDR load failed, using procedural skybox:', error);
        
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;
        
        // Create sunset gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#87CEEB');    // Sky blue at top
        gradient.addColorStop(0.3, '#FFA07A');  // Light salmon
        gradient.addColorStop(0.6, '#FF6347');  // Tomato/orange
        gradient.addColorStop(0.8, '#FF4500');  // Orange red
        gradient.addColorStop(1, '#2F1B14');    // Dark brown at bottom
        
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

  private connectToServer() {
    this.socket = io('http://localhost:3001');
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }

  private setupControls() {
    // Request pointer lock on click
    document.addEventListener('click', () => {
      document.body.requestPointerLock();
    });

    // Handle mouse look when pointer is locked
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === document.body) {
        const sensitivity = 0.002;
        
        // Update yaw and pitch angles
        this.yaw -= event.movementX * sensitivity;
        this.pitch -= event.movementY * sensitivity;
        
        // Clamp pitch to prevent over-rotation
        this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        
        // Apply rotation using quaternion to avoid gimbal lock
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      }
    });

    // Basic WASD movement
    const keys: { [key: string]: boolean } = {};
    
    document.addEventListener('keydown', (event) => {
      keys[event.code] = true;
    });

    document.addEventListener('keyup', (event) => {
      keys[event.code] = false;
    });

    // Handle movement in animation loop
    this.handleMovement = (deltaTime: number) => {
      const speed = 5.0; // units per second
      const direction = new THREE.Vector3();
      
      if (keys['KeyW']) direction.z -= speed * deltaTime;
      if (keys['KeyS']) direction.z += speed * deltaTime;
      if (keys['KeyA']) direction.x -= speed * deltaTime;
      if (keys['KeyD']) direction.x += speed * deltaTime;
      
      if (direction.length() > 0) {
        direction.applyQuaternion(this.camera.quaternion);
        direction.y = 0; // Keep movement on ground level
        this.camera.position.add(direction);
      }
    };
  }

  private handleMovement(deltaTime: number) {
    // Movement handling is set up in setupControls
  }

  private updateFPS(currentTime: number) {
    this.frameCount++;
    
    // Update FPS every second
    if (currentTime - this.fpsUpdateTime >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (currentTime - this.fpsUpdateTime));
      const fpsElement = document.getElementById('fps');
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
    const deltaTime = this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    this.updateFPS(currentTime);
    this.handleMovement(deltaTime);
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
window.addEventListener('resize', () => game.onWindowResize());