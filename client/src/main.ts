import * as THREE from 'three';
import { io } from 'socket.io-client';

class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private socket: any;
  private yaw: number = 0;
  private pitch: number = 0;

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
    document.body.appendChild(this.renderer.domElement);
  }

  private createScene() {
    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    this.scene.add(directionalLight);

    // Create a simple ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Add some basic buildings/cover
    for (let i = 0; i < 10; i++) {
      const buildingGeometry = new THREE.BoxGeometry(
        Math.random() * 3 + 1,
        Math.random() * 5 + 2,
        Math.random() * 3 + 1
      );
      const buildingMaterial = new THREE.MeshLambertMaterial({ 
        color: new THREE.Color().setHSL(0, 0, Math.random() * 0.3 + 0.3) 
      });
      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      
      building.position.x = (Math.random() - 0.5) * 50;
      building.position.z = (Math.random() - 0.5) * 50;
      building.position.y = buildingGeometry.parameters.height / 2;
      
      this.scene.add(building);
    }

    // Position camera
    this.camera.position.set(0, 1.8, 5);
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
    this.handleMovement = () => {
      const speed = 0.1;
      const direction = new THREE.Vector3();
      
      if (keys['KeyW']) direction.z -= speed;
      if (keys['KeyS']) direction.z += speed;
      if (keys['KeyA']) direction.x -= speed;
      if (keys['KeyD']) direction.x += speed;
      
      if (direction.length() > 0) {
        direction.applyQuaternion(this.camera.quaternion);
        direction.y = 0; // Keep movement on ground level
        this.camera.position.add(direction);
      }
    };
  }

  private handleMovement() {
    // Movement handling is set up in setupControls
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    
    this.handleMovement();
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