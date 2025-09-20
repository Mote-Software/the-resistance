# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"The Resistance" is a browser-based first-person shooter game set in an alternative history where Nazi Germany won WWII. The game features multiplayer combat in a destroyed London cityscape with realistic 3D graphics using Three.js and WebGL.

## Development Commands

### Root Level Commands
- `pnpm run dev` - Start both client and server in development mode
- `pnpm run build` - Build both client and server for production
- `pnpm run dev:client` - Start only the client development server
- `pnpm run dev:server` - Start only the server in development mode
- `pnpm run build:client` - Build only the client
- `pnpm run build:server` - Build only the server

### Client Commands (from client/ directory)
- `pnpm run dev` - Start Vite development server (typically on http://localhost:5173)
- `pnpm run build` - Build client for production using Vite
- `pnpm run preview` - Preview production build locally

### Server Commands (from server/ directory)
- `pnpm run dev` - Start server with tsx watch for hot reloading (typically on http://localhost:3001)
- `pnpm run start` - Start production server from dist/
- `pnpm run build` - Compile TypeScript to dist/

## Architecture

### Project Structure
```
├── client/          # Three.js frontend (Vite + TypeScript)
├── server/          # Express.js backend with Socket.io
├── agents/          # Project planning documents
└── package.json     # Root package for running both services
```

### Client Architecture (client/src/)
- **main.ts** - Main game entry point with Game class that handles:
  - Three.js scene initialization with HDR skybox and realistic lighting
  - First-person camera controls with mouse look and WASD movement
  - Socket.io client connection to multiplayer server
  - Weapon system integration and FPS counter
- **weapons/** - Weapon system with modular configuration:
  - `WeaponManager.ts` - Handles weapon loading, PBR materials, and first-person positioning
  - `configs/` - Individual weapon configurations (e.g., LeeEnfield.ts)

### Server Architecture (server/src/)
- **index.ts** - Express server with Socket.io for real-time multiplayer:
  - CORS configuration for Vite development server
  - Player connection/disconnection handling
  - Team assignment system (resistance vs nazi)
  - Movement synchronization between players

### Key Technologies
- **Frontend**: Three.js, Vite, TypeScript, Socket.io-client, three-stdlib (FBX loader, RGBE loader)
- **Backend**: Express, Socket.io, TypeScript, tsx for development
- **Graphics**: PBR materials, HDR lighting, shadow mapping, real-time rendering
- **Multiplayer**: WebSocket-based real-time communication

## Asset Structure

Assets are stored in `client/public/assets/`:
- `models/weapons/` - FBX weapon models
- `textures/weapons/` - PBR texture maps (Albedo, Normal, Roughness, Metalness, AO)
- `textures/skyboxes/` - HDR environment maps

## Development Notes

### Weapon System
- Weapons use PBR (Physically Based Rendering) materials with full texture sets
- First-person positioning with realistic camera-relative transforms
- Weapon sway animation when moving for immersion
- FBX model loading with automatic material setup

### Graphics Features
- HDR skybox with tone mapping (ACES Filmic)
- Real-time shadows with PCF soft shadow mapping
- Procedural building generation for urban environment
- Camera controls with pointer lock for FPS gameplay

### Multiplayer
- Socket.io for real-time player synchronization
- Team-based gameplay with resistance vs nazi factions
- Player movement broadcasting to other clients
- Health check endpoint at /health

### Performance
- FPS counter display for monitoring performance
- Time-based movement for frame-rate independent motion
- Shadow map optimization with 2048x2048 resolution