"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 8;
const ENEMY_SPEED = 2;
const POWERUP_SPEED = 1;

// Game states
enum GameState {
  MENU = 'menu',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'game_over'
}

// Entity types
interface Vector2D {
  x: number;
  y: number;
}

interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  velocity: Vector2D;
  active: boolean;
}

interface Player extends Entity {
  health: number;
  maxHealth: number;
  lastShot: number;
  shootCooldown: number;
  powerUps: PowerUpEffect[];
}

interface Enemy extends Entity {
  health: number;
  maxHealth: number;
  type: 'basic' | 'fast' | 'tank' | 'boss';
  lastShot: number;
  shootCooldown: number;
  points: number;
}

interface Bullet extends Entity {
  damage: number;
  isPlayerBullet: boolean;
}

interface PowerUp extends Entity {
  type: 'rapidFire' | 'shield' | 'multiShot';
  duration: number;
}

interface PowerUpEffect {
  type: 'rapidFire' | 'shield' | 'multiShot';
  duration: number;
  startTime: number;
}

interface Particle extends Entity {
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface GameStats {
  score: number;
  wave: number;
  enemiesKilled: number;
  highScore: number;
}

class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState = GameState.MENU;
  private keys: Set<string> = new Set();
  private lastFrameTime = 0;
  private animationId = 0;

  // Game entities
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private powerUps: PowerUp[] = [];
  private particles: Particle[] = [];

  // Game stats
  private stats: GameStats = {
    score: 0,
    wave: 1,
    enemiesKilled: 0,
    highScore: 0
  };

  // Game timing
  private lastEnemySpawn = 0;
  private enemySpawnRate = 2000;
  private lastPowerUpSpawn = 0;
  private powerUpSpawnRate = 10000;

  // Audio context
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    // Initialize player
    this.player = {
      x: CANVAS_WIDTH / 2 - 25,
      y: CANVAS_HEIGHT - 80,
      width: 50,
      height: 50,
      velocity: { x: 0, y: 0 },
      active: true,
      health: 100,
      maxHealth: 100,
      lastShot: 0,
      shootCooldown: 250,
      powerUps: []
    };

    this.loadHighScore();
    this.initializeAudio();
    this.setupEventListeners();
    this.gameLoop(0);
  }

  private loadHighScore() {
    const saved = localStorage.getItem('spaceShooterHighScore');
    if (saved) {
      this.stats.highScore = parseInt(saved);
    }
  }

  private saveHighScore() {
    if (this.stats.score > this.stats.highScore) {
      this.stats.highScore = this.stats.score;
      localStorage.setItem('spaceShooterHighScore', this.stats.highScore.toString());
    }
  }

  private async initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // In a real game, you'd load actual audio files here
      console.log('Audio initialized');
    } catch (error) {
      console.log('Audio not available:', error);
    }
  }

  private playSound(type: string, volume = 0.5) {
    if (!this.audioContext) return;
    
    // Create simple beep sounds using oscillators
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    switch (type) {
      case 'shoot':
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1);
        break;
      case 'explosion':
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);
        break;
      case 'powerup':
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
        break;
      case 'hit':
        oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.15);
        break;
    }
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  private setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.gameState === GameState.MENU) {
          this.startGame();
        } else if (this.gameState === GameState.GAME_OVER) {
          this.restartGame();
        }
      }
      
      if (e.code === 'KeyP' && this.gameState === GameState.PLAYING) {
        this.gameState = GameState.PAUSED;
      } else if (e.code === 'KeyP' && this.gameState === GameState.PAUSED) {
        this.gameState = GameState.PLAYING;
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  private startGame() {
    this.gameState = GameState.PLAYING;
    this.resetGame();
  }

  private restartGame() {
    this.resetGame();
    this.gameState = GameState.PLAYING;
  }

  private resetGame() {
    // Reset player
    this.player.x = CANVAS_WIDTH / 2 - 25;
    this.player.y = CANVAS_HEIGHT - 80;
    this.player.health = this.player.maxHealth;
    this.player.powerUps = [];
    
    // Clear all entities
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.particles = [];
    
    // Reset stats
    this.stats.score = 0;
    this.stats.wave = 1;
    this.stats.enemiesKilled = 0;
    
    // Reset timers
    this.lastEnemySpawn = 0;
    this.lastPowerUpSpawn = 0;
    this.enemySpawnRate = 2000;
  }

  private gameLoop = (currentTime: number) => {
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    this.update(deltaTime);
    this.render();

    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  private update(deltaTime: number) {
    if (this.gameState !== GameState.PLAYING) return;

    this.updateInput();
    this.updatePlayer(deltaTime);
    this.updateEnemies(deltaTime);
    this.updateBullets(deltaTime);
    this.updatePowerUps(deltaTime);
    this.updateParticles(deltaTime);
    this.updateCollisions();
    this.spawnEnemies(deltaTime);
    this.spawnPowerUps(deltaTime);
    this.updateWave();
    
    // Check game over
    if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  private updateInput() {
    const speed = PLAYER_SPEED;
    
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.player.y = Math.max(0, this.player.y - speed);
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.player.y = Math.min(CANVAS_HEIGHT - this.player.height, this.player.y + speed);
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.player.x = Math.max(0, this.player.x - speed);
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.player.x = Math.min(CANVAS_WIDTH - this.player.width, this.player.x + speed);
    }
    
    if (this.keys.has('Space')) {
      this.playerShoot();
    }
  }

  private playerShoot() {
    const currentTime = Date.now();
    let cooldown = this.player.shootCooldown;
    
    // Check for rapid fire power-up
    const rapidFire = this.player.powerUps.find(p => p.type === 'rapidFire');
    if (rapidFire && currentTime - rapidFire.startTime < rapidFire.duration) {
      cooldown = this.player.shootCooldown / 3;
    }
    
    if (currentTime - this.player.lastShot > cooldown) {
      const multiShot = this.player.powerUps.find(p => p.type === 'multiShot');
      const hasMultiShot = multiShot && currentTime - multiShot.startTime < multiShot.duration;
      
      if (hasMultiShot) {
        // Multi-shot: 3 bullets
        for (let i = -1; i <= 1; i++) {
          this.createBullet(
            this.player.x + this.player.width / 2 - 2,
            this.player.y,
            { x: i * 2, y: -BULLET_SPEED },
            10,
            true
          );
        }
      } else {
        // Single bullet
        this.createBullet(
          this.player.x + this.player.width / 2 - 2,
          this.player.y,
          { x: 0, y: -BULLET_SPEED },
          10,
          true
        );
      }
      
      this.player.lastShot = currentTime;
      this.playSound('shoot', 0.3);
    }
  }

  private createBullet(x: number, y: number, velocity: Vector2D, damage: number, isPlayerBullet: boolean) {
    this.bullets.push({
      x,
      y,
      width: 4,
      height: 8,
      velocity,
      active: true,
      damage,
      isPlayerBullet
    });
  }

  private updatePlayer(deltaTime: number) {
    // Update power-ups
    const currentTime = Date.now();
    this.player.powerUps = this.player.powerUps.filter(powerUp => {
      return currentTime - powerUp.startTime < powerUp.duration;
    });
  }

  private spawnEnemies(deltaTime: number) {
    const currentTime = Date.now();
    if (currentTime - this.lastEnemySpawn > this.enemySpawnRate) {
      this.createEnemy();
      this.lastEnemySpawn = currentTime;
    }
  }

  private createEnemy() {
    const types: Enemy['type'][] = ['basic', 'fast', 'tank'];
    if (this.stats.wave >= 5) types.push('boss');
    
    const type = types[Math.floor(Math.random() * types.length)];
    const x = Math.random() * (CANVAS_WIDTH - 50);
    
    let enemy: Enemy;
    
    switch (type) {
      case 'fast':
        enemy = {
          x,
          y: -50,
          width: 35,
          height: 35,
          velocity: { x: 0, y: ENEMY_SPEED * 2 },
          active: true,
          health: 1,
          maxHealth: 1,
          type: 'fast',
          lastShot: 0,
          shootCooldown: 1500,
          points: 15
        };
        break;
      case 'tank':
        enemy = {
          x,
          y: -50,
          width: 60,
          height: 60,
          velocity: { x: 0, y: ENEMY_SPEED * 0.5 },
          active: true,
          health: 3,
          maxHealth: 3,
          type: 'tank',
          lastShot: 0,
          shootCooldown: 2000,
          points: 30
        };
        break;
      case 'boss':
        enemy = {
          x,
          y: -100,
          width: 100,
          height: 80,
          velocity: { x: 0, y: ENEMY_SPEED * 0.3 },
          active: true,
          health: 10,
          maxHealth: 10,
          type: 'boss',
          lastShot: 0,
          shootCooldown: 800,
          points: 100
        };
        break;
      default:
        enemy = {
          x,
          y: -50,
          width: 40,
          height: 40,
          velocity: { x: 0, y: ENEMY_SPEED },
          active: true,
          health: 1,
          maxHealth: 1,
          type: 'basic',
          lastShot: 0,
          shootCooldown: 2500,
          points: 10
        };
    }
    
    this.enemies.push(enemy);
  }

  private updateEnemies(deltaTime: number) {
    const currentTime = Date.now();
    
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;
      
      // Move enemy
      enemy.x += enemy.velocity.x;
      enemy.y += enemy.velocity.y;
      
      // Remove enemies that go off-screen
      if (enemy.y > CANVAS_HEIGHT + enemy.height) {
        enemy.active = false;
      }
      
      // Enemy shooting
      if (currentTime - enemy.lastShot > enemy.shootCooldown) {
        this.createBullet(
          enemy.x + enemy.width / 2 - 2,
          enemy.y + enemy.height,
          { x: 0, y: BULLET_SPEED * 0.5 },
          15,
          false
        );
        enemy.lastShot = currentTime;
      }
    });
    
    // Remove inactive enemies
    this.enemies = this.enemies.filter(enemy => enemy.active);
  }

  private updateBullets(deltaTime: number) {
    this.bullets.forEach(bullet => {
      if (!bullet.active) return;
      
      bullet.x += bullet.velocity.x;
      bullet.y += bullet.velocity.y;
      
      // Remove bullets that go off-screen
      if (bullet.y < -bullet.height || bullet.y > CANVAS_HEIGHT + bullet.height ||
          bullet.x < -bullet.width || bullet.x > CANVAS_WIDTH + bullet.width) {
        bullet.active = false;
      }
    });
    
    // Remove inactive bullets
    this.bullets = this.bullets.filter(bullet => bullet.active);
  }

  private spawnPowerUps(deltaTime: number) {
    const currentTime = Date.now();
    if (currentTime - this.lastPowerUpSpawn > this.powerUpSpawnRate && Math.random() < 0.1) {
      this.createPowerUp();
      this.lastPowerUpSpawn = currentTime;
    }
  }

  private createPowerUp() {
    const types: PowerUp['type'][] = ['rapidFire', 'shield', 'multiShot'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = Math.random() * (CANVAS_WIDTH - 30);
    
    let duration: number;
    switch (type) {
      case 'rapidFire':
        duration = 10000;
        break;
      case 'shield':
        duration = 8000;
        break;
      case 'multiShot':
        duration = 15000;
        break;
    }
    
    this.powerUps.push({
      x,
      y: -30,
      width: 30,
      height: 30,
      velocity: { x: 0, y: POWERUP_SPEED },
      active: true,
      type,
      duration
    });
  }

  private updatePowerUps(deltaTime: number) {
    this.powerUps.forEach(powerUp => {
      if (!powerUp.active) return;
      
      powerUp.x += powerUp.velocity.x;
      powerUp.y += powerUp.velocity.y;
      
      // Remove power-ups that go off-screen
      if (powerUp.y > CANVAS_HEIGHT + powerUp.height) {
        powerUp.active = false;
      }
    });
    
    // Remove inactive power-ups
    this.powerUps = this.powerUps.filter(powerUp => powerUp.active);
  }

  private updateParticles(deltaTime: number) {
    this.particles.forEach(particle => {
      if (!particle.active) return;
      
      particle.x += particle.velocity.x;
      particle.y += particle.velocity.y;
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        particle.active = false;
      }
    });
    
    // Remove inactive particles
    this.particles = this.particles.filter(particle => particle.active);
  }

  private updateCollisions() {
    // Player bullets vs enemies
    this.bullets.forEach(bullet => {
      if (!bullet.isPlayerBullet || !bullet.active) return;
      
      this.enemies.forEach(enemy => {
        if (!enemy.active) return;
        
        if (this.checkCollision(bullet, enemy)) {
          bullet.active = false;
          enemy.health -= bullet.damage;
          
          this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'hit');
          this.playSound('hit', 0.4);
          
          if (enemy.health <= 0) {
            enemy.active = false;
            this.stats.score += enemy.points;
            this.stats.enemiesKilled++;
            this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'explosion');
            this.playSound('explosion', 0.6);
          }
        }
      });
    });
    
    // Enemy bullets vs player
    this.bullets.forEach(bullet => {
      if (bullet.isPlayerBullet || !bullet.active) return;
      
      // Check shield power-up
      const currentTime = Date.now();
      const shield = this.player.powerUps.find(p => p.type === 'shield');
      const hasShield = shield && currentTime - shield.startTime < shield.duration;
      
      if (!hasShield && this.checkCollision(bullet, this.player)) {
        bullet.active = false;
        this.player.health = Math.max(0, this.player.health - bullet.damage);
        this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 'hit');
        this.playSound('hit', 0.5);
      }
    });
    
    // Player vs enemies (collision damage)
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;
      
      const currentTime = Date.now();
      const shield = this.player.powerUps.find(p => p.type === 'shield');
      const hasShield = shield && currentTime - shield.startTime < shield.duration;
      
      if (!hasShield && this.checkCollision(this.player, enemy)) {
        enemy.active = false;
        this.player.health = Math.max(0, this.player.health - 20);
        this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'explosion');
        this.playSound('explosion', 0.6);
      }
    });
    
    // Player vs power-ups
    this.powerUps.forEach(powerUp => {
      if (!powerUp.active) return;
      
      if (this.checkCollision(this.player, powerUp)) {
        powerUp.active = false;
        this.collectPowerUp(powerUp);
        this.playSound('powerup', 0.5);
      }
    });
  }

  private checkCollision(a: Entity, b: Entity): boolean {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }

  private collectPowerUp(powerUp: PowerUp) {
    const currentTime = Date.now();
    
    // Remove existing power-up of same type
    this.player.powerUps = this.player.powerUps.filter(p => p.type !== powerUp.type);
    
    // Add new power-up
    this.player.powerUps.push({
      type: powerUp.type,
      duration: powerUp.duration,
      startTime: currentTime
    });
  }

  private createExplosion(x: number, y: number, type: 'hit' | 'explosion') {
    const particleCount = type === 'explosion' ? 15 : 8;
    const colors = type === 'explosion' ? ['#ff4444', '#ff8844', '#ffaa44'] : ['#ffffff', '#ffff44'];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 2 + Math.random() * 3;
      const life = 300 + Math.random() * 200;
      
      this.particles.push({
        x,
        y,
        width: 3,
        height: 3,
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed
        },
        active: true,
        life,
        maxLife: life,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 3
      });
    }
  }

  private updateWave() {
    const enemiesPerWave = 10;
    if (this.stats.enemiesKilled >= this.stats.wave * enemiesPerWave) {
      this.stats.wave++;
      this.enemySpawnRate = Math.max(500, this.enemySpawnRate - 100);
    }
  }

  private gameOver() {
    this.gameState = GameState.GAME_OVER;
    this.saveHighScore();
  }

  private render() {
    // Clear canvas
    this.ctx.fillStyle = '#000011';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw stars background
    this.drawStars();
    
    if (this.gameState === GameState.MENU) {
      this.drawMenu();
    } else if (this.gameState === GameState.PLAYING || this.gameState === GameState.PAUSED) {
      this.drawGame();
      if (this.gameState === GameState.PAUSED) {
        this.drawPauseOverlay();
      }
    } else if (this.gameState === GameState.GAME_OVER) {
      this.drawGame();
      this.drawGameOverOverlay();
    }
  }

  private drawStars() {
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 100; i++) {
      const x = (i * 97) % CANVAS_WIDTH;
      const y = (i * 73) % CANVAS_HEIGHT;
      const size = (i % 3) + 1;
      this.ctx.fillRect(x, y, size, size);
    }
  }

  private drawGame() {
    // Draw particles
    this.particles.forEach(particle => {
      if (!particle.active) return;
      
      const alpha = particle.life / particle.maxLife;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      this.ctx.restore();
    });
    
    // Draw player
    if (this.player.active) {
      // Check for shield effect
      const currentTime = Date.now();
      const shield = this.player.powerUps.find(p => p.type === 'shield');
      const hasShield = shield && currentTime - shield.startTime < shield.duration;
      
      if (hasShield) {
        this.ctx.strokeStyle = '#44aaff';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(this.player.x - 5, this.player.y - 5, this.player.width + 10, this.player.height + 10);
      }
      
      this.ctx.fillStyle = '#44ff44';
      this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
      
      // Draw player details
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(this.player.x + 20, this.player.y + 10, 10, 30);
      this.ctx.fillRect(this.player.x + 10, this.player.y + 20, 30, 10);
    }
    
    // Draw enemies
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;
      
      let color = '#ff4444';
      switch (enemy.type) {
        case 'fast':
          color = '#ff8844';
          break;
        case 'tank':
          color = '#8844ff';
          break;
        case 'boss':
          color = '#ff44ff';
          break;
      }
      
      this.ctx.fillStyle = color;
      this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      
      // Health bar for enemies with >1 HP
      if (enemy.maxHealth > 1) {
        const barWidth = enemy.width;
        const barHeight = 4;
        const healthPercent = enemy.health / enemy.maxHealth;
        
        this.ctx.fillStyle = '#333333';
        this.ctx.fillRect(enemy.x, enemy.y - 8, barWidth, barHeight);
        
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillRect(enemy.x, enemy.y - 8, barWidth * healthPercent, barHeight);
      }
    });
    
    // Draw bullets
    this.bullets.forEach(bullet => {
      if (!bullet.active) return;
      
      this.ctx.fillStyle = bullet.isPlayerBullet ? '#ffff44' : '#ff8844';
      this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });
    
    // Draw power-ups
    this.powerUps.forEach(powerUp => {
      if (!powerUp.active) return;
      
      let color = '#44ff44';
      switch (powerUp.type) {
        case 'rapidFire':
          color = '#ff4444';
          break;
        case 'shield':
          color = '#4444ff';
          break;
        case 'multiShot':
          color = '#ff44ff';
          break;
      }
      
      this.ctx.fillStyle = color;
      this.ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height);
      
      // Draw power-up symbol
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '16px Arial';
      this.ctx.textAlign = 'center';
      let symbol = 'P';
      switch (powerUp.type) {
        case 'rapidFire':
          symbol = 'R';
          break;
        case 'shield':
          symbol = 'S';
          break;
        case 'multiShot':
          symbol = 'M';
          break;
      }
      this.ctx.fillText(symbol, powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2 + 6);
    });
    
    this.drawHUD();
  }

  private drawHUD() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '20px Arial';
    this.ctx.textAlign = 'left';
    
    // Score
    this.ctx.fillText(`Score: ${this.stats.score}`, 20, 30);
    
    // Wave
    this.ctx.fillText(`Wave: ${this.stats.wave}`, 20, 60);
    
    // High Score
    this.ctx.fillText(`High Score: ${this.stats.highScore}`, 20, 90);
    
    // Health bar
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthPercent = this.player.health / this.player.maxHealth;
    
    this.ctx.fillStyle = '#333333';
    this.ctx.fillRect(CANVAS_WIDTH - healthBarWidth - 20, 20, healthBarWidth, healthBarHeight);
    
    this.ctx.fillStyle = this.player.health > 30 ? '#44ff44' : '#ff4444';
    this.ctx.fillRect(CANVAS_WIDTH - healthBarWidth - 20, 20, healthBarWidth * healthPercent, healthBarHeight);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Health: ${this.player.health}/${this.player.maxHealth}`, 
                     CANVAS_WIDTH - healthBarWidth / 2 - 20, 35);
    
    // Active power-ups
    let yOffset = 60;
    const currentTime = Date.now();
    this.player.powerUps.forEach(powerUp => {
      const timeLeft = Math.max(0, powerUp.duration - (currentTime - powerUp.startTime));
      if (timeLeft > 0) {
        const seconds = Math.ceil(timeLeft / 1000);
        let name = '';
        let color = '#ffffff';
        
        switch (powerUp.type) {
          case 'rapidFire':
            name = 'Rapid Fire';
            color = '#ff4444';
            break;
          case 'shield':
            name = 'Shield';
            color = '#4444ff';
            break;
          case 'multiShot':
            name = 'Multi Shot';
            color = '#ff44ff';
            break;
        }
        
        this.ctx.fillStyle = color;
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${name}: ${seconds}s`, CANVAS_WIDTH - 20, yOffset);
        yOffset += 25;
      }
    });
  }

  private drawMenu() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('SPACE DEFENDER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
    
    this.ctx.font = '24px Arial';
    this.ctx.fillText('Press SPACE to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    
    this.ctx.font = '18px Arial';
    this.ctx.fillText('Controls:', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    this.ctx.fillText('WASD - Move  •  SPACE - Shoot  •  P - Pause', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 85);
    
    this.ctx.fillText('Power-ups:', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 120);
    this.ctx.fillStyle = '#ff4444';
    this.ctx.fillText('R - Rapid Fire  •  ', CANVAS_WIDTH / 2 - 80, CANVAS_HEIGHT / 2 + 145);
    this.ctx.fillStyle = '#4444ff';
    this.ctx.fillText('S - Shield  •  ', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 145);
    this.ctx.fillStyle = '#ff44ff';
    this.ctx.fillText('M - Multi Shot', CANVAS_WIDTH / 2 + 70, CANVAS_HEIGHT / 2 + 145);
    
    if (this.stats.highScore > 0) {
      this.ctx.fillStyle = '#ffff44';
      this.ctx.font = '20px Arial';
      this.ctx.fillText(`High Score: ${this.stats.highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 180);
    }
  }

  private drawPauseOverlay() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '36px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    
    this.ctx.font = '18px Arial';
    this.ctx.fillText('Press P to Resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
  }

  private drawGameOverOverlay() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    this.ctx.fillStyle = '#ff4444';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px Arial';
    this.ctx.fillText(`Final Score: ${this.stats.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
    this.ctx.fillText(`Wave Reached: ${this.stats.wave}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    
    if (this.stats.score === this.stats.highScore) {
      this.ctx.fillStyle = '#ffff44';
      this.ctx.fillText('NEW HIGH SCORE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
    }
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '18px Arial';
    this.ctx.fillText('Press SPACE to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 120);
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    document.removeEventListener('keydown', () => {});
    document.removeEventListener('keyup', () => {});
  }
}

const SpaceGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    gameEngineRef.current = new GameEngine(canvas);

    return () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="border-2 border-gray-700 rounded-lg bg-black"
        tabIndex={0}
      />
    </div>
  );
};

export default SpaceGame;