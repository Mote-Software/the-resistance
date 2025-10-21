# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"The Resistance" is a browser-based first-person shooter game set in an alternative history where Nazi Germany won WWII. The game features peer-to-peer multiplayer combat in a destroyed London cityscape with realistic 3D graphics using Three.js and WebGL. The game uses PeerJS for WebRTC-based networking with no backend server required.

## Development Commands

### Root Level Commands
- `pnpm run dev` - Start client development server
- `pnpm run build` - Build client for production
- `pnpm run preview` - Preview production build locally

### Client Commands (from client/ directory)
- `pnpm run dev` - Start Vite development server (typically on http://localhost:5173)
- `pnpm run build` - Build client for production using Vite
- `pnpm run preview` - Preview production build locally

## Architecture

### Project Structure
```
├── client/               # Three.js frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── main.ts       # Game engine entry point
│   │   ├── network/      # P2P networking layer
│   │   └── weapons/      # Weapon system
│   └── public/
│       └── assets/       # Models, textures, sounds
├── shared/               # Shared utilities (reserved for future use)
├── agents/               # Project planning documents
└── package.json          # Root package
```

### Client Architecture (client/src/)

#### Core Game Engine (main.ts)
The `Game` class is the main entry point that orchestrates:
- Three.js scene initialization with HDR skybox and realistic lighting
- First-person camera controls with pointer lock and WASD movement
- P2P multiplayer networking via PeerJS
- Weapon system integration and FPS counter
- Game loop handling (rendering, player updates, network synchronization)

#### Networking Layer (network/P2PManager.ts)
Implements **host-guest peer-to-peer architecture** using PeerJS:
- **Room System**: 6-character alphanumeric room codes for matchmaking
- **Host Role**: Listens for connections, manages all player states, broadcasts to guests
- **Guest Role**: Connects to host via room code, sends updates only to host
- **Network Optimization**: Delta compression (only sends updates when position/rotation thresholds exceeded), throttled to 50ms intervals
- **Message Types**: `playerMove`, `playerMoved`, `playerFired`, `playerFiredRemote`, `playerJoined`, `playerLeft`, `currentPlayers`

#### Weapon System (weapons/)
Modular weapon architecture with:
- **WeaponManager.ts**: Orchestrates weapon registration and lifecycle
- **Weapon Class**: Handles FBX model loading, PBR material setup, ADS (aim down sights), recoil, and firing
- **configs/**: Individual weapon configurations (e.g., `FNScar.ts`) defining model paths, textures, and positioning
- **First-Person Positioning**: Camera-relative positioning with smooth ADS transitions and weapon sway

### Key Technologies
- **Frontend**: Three.js (0.158.0), Vite (5.0.0), TypeScript (5.2), PeerJS (1.5.5)
- **Loaders**: three-stdlib (FBXLoader for weapons, TDSLoader for environments, RGBELoader for HDR)
- **Graphics**: PBR materials (MeshStandardMaterial), HDR skybox with ACES Filmic tone mapping, PCF soft shadow mapping (2048x2048)
- **Multiplayer**: PeerJS WebRTC peer-to-peer (no backend server), host-guest architecture
- **Audio**: HTML5 Audio API for weapon fire sounds

### Asset Structure

Assets are stored in `client/public/assets/`:
- `models/weapons/` - FBX weapon models (e.g., fn_scar.fbx)
- `models/` - 3DS environment models (e.g., Town.3ds)
- `textures/weapons/` - PBR texture maps (Normal, Roughness, Metalness)
- `textures/skyboxes/` - HDR environment maps for realistic lighting
- `sounds/` - Weapon fire sounds (e.g., fn_scar_gun.mp3)

## Development Notes

### Multiplayer Architecture
**IMPORTANT**: This game uses peer-to-peer networking with PeerJS, NOT a traditional client-server architecture with Socket.io or Express. There is no backend server.

- **Host-Guest Model**: One player hosts and manages game state, others connect as guests
- **Room Codes**: 6-character alphanumeric codes for joining rooms
- **Network Flow**: Guests send updates to host → host broadcasts to all guests
- **Delta Updates**: Position/rotation only sent when changed >0.05 units or >0.02 radians
- **Throttling**: Network updates throttled to 50ms intervals (max 20 updates/sec)

### Weapon System
- Weapons use PBR materials with Normal, Roughness, and Metalness maps
- First-person positioning is camera-relative in world space (not parented to camera)
- ADS smoothly interpolates between hip fire and scoped positions
- Recoil applies immediate kickback with smooth recovery
- Weapon sway tied to movement with sprint multiplier
- FBX model loading with automatic PBR material setup

### Graphics Features
- **HDR Lighting**: RGBE loader for equirectangular skybox with ACES Filmic tone mapping
- **Shadows**: PCF soft shadow mapping at 2048x2048 resolution, optimized frustum
- **PBR Materials**: Full physically-based rendering pipeline with Normal + Roughness + Metalness
- **Performance**: Pixel ratio capped at 2x, simplified player geometry (capsule with 3-4 segments), sprite-based muzzle flash (no lights)
- **Environment**: 3DS town model with smart texture repetition (roads 20x20, windows 1x1, general 3x3)

### Player Representation
- **Local Player**: Controlled via camera at position (0, 2.5, 5), invisible to self
- **Remote Players**: Capsule body geometry + head mesh, third-person weapon view
- **Visual Effects**: Muzzle flash (sprite with additive blending), head rotation sync

### Performance Optimizations
- Pixel ratio capping (max 2x) for 4K+ displays
- Capsule geometry with minimal segments for player bodies
- Sprite-based muzzle flash instead of point lights (avoids shadow map updates)
- Delta-based network updates with thresholds
- Throttled position updates (50ms intervals)

### Deployment
- **Cloudflare Pages**: CI/CD via GitHub Actions
- **Build Output**: `client/dist/` generated by Vite
- **Static Hosting**: No backend required (fully client-side with peer-to-peer networking)
