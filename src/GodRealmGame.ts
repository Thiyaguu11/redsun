import * as THREE from 'three';
import { AngelStickman } from './AngelStickman';

export class GodRealmGame {
    public isPlaying: boolean = false;
    private victoryTriggered: boolean = false;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private player: AngelStickman;
    private enemies: AngelStickman[] = [];
    private clock: THREE.Clock;

    // Controls
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    private moveUp: boolean = false; // Spacebar

    // Bullets (Light Beams)
    private bullets: { mesh: THREE.Mesh, target: AngelStickman | null, speed: number }[] = [];

    // UI elements
    private uiHealthBarFill!: HTMLElement;

    public onVictory?: () => void;

    constructor() {
        this.scene = new THREE.Scene();
        // Heavenly sky color
        this.scene.background = new THREE.Color(0xddeeff);
        this.scene.fog = new THREE.Fog(0xddeeff, 10, 80);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Setup Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfffaaa, 0.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        this.buildEnvironment();

        this.player = new AngelStickman(true);
        this.player.mesh.position.set(0, 5, 0); // Start floating
        this.scene.add(this.player.mesh);

        this.setupEnemies();
        this.setupControls();

        this.clock = new THREE.Clock();

        // Hide initially until switched to
        this.renderer.domElement.style.display = 'none';

        // We will manually append it from main.ts to switch contexts
        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.animate();
    }

    public getDomElement() {
        return this.renderer.domElement;
    }

    private movingClouds: THREE.Mesh[] = [];

    private buildEnvironment() {
        // Soft, fluffy cloud material
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            transparent: true,
            opacity: 0.65,
            flatShading: false
        });

        // Massive sea of clouds to hide the bottom
        // Increased segment count for smoother, rounder clouds rather than rocky low-poly
        const cloudGeo = new THREE.SphereGeometry(1, 16, 16);
        for (let i = 0; i < 300; i++) {
            const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
            const sizeX = Math.random() * 15 + 10;
            const sizeY = Math.random() * 5 + 3;
            const sizeZ = Math.random() * 15 + 10;
            cloud.scale.set(sizeX, sizeY, sizeZ);

            // Scatter widely
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 150;
            cloud.position.set(
                Math.cos(angle) * radius,
                -5 - (Math.random() * 4), // Below the play area
                Math.sin(angle) * radius
            );
            this.scene.add(cloud);
        }

        // Floating ambient clouds in the play area
        for (let i = 0; i < 40; i++) {
            const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
            const size = Math.random() * 6 + 3;
            cloud.scale.set(size, size * 0.5, size);

            cloud.position.set(
                (Math.random() - 0.5) * 150,
                Math.random() * 20 - 5,
                (Math.random() - 0.5) * 150
            );
            this.scene.add(cloud);
            this.movingClouds.push(cloud);
        }

        // Floating Stairs
        const stairGeo = new THREE.BoxGeometry(4, 0.5, 2);
        const stairMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, metalness: 0.5, roughness: 0.2 });
        for (let i = 0; i < 15; i++) {
            const stair = new THREE.Mesh(stairGeo, stairMat);
            stair.position.set(
                0,
                i * 1.5,
                -10 - (i * 3)
            );
            this.scene.add(stair);
        }
    }

    private setupEnemies() {
        for (let i = 0; i < 50; i++) { // 50 celestial enemies
            const enemy = new AngelStickman(false);
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 20 + 15;

            enemy.mesh.position.set(
                Math.cos(angle) * radius,
                Math.random() * 10 + 2, // Floating in air
                Math.sin(angle) * radius
            );
            enemy.mesh.rotation.y = Math.random() * Math.PI * 2;
            this.enemies.push(enemy);
            this.scene.add(enemy.mesh);
        }
    }

    private setupControls() {
        // God Realm specific UI
        this.uiHealthBarFill = document.getElementById('health-bar-fill') as HTMLElement;

        // Note: Start/Enter button logic is handled in main.ts to transition cleanly.

        document.addEventListener('keydown', (e) => {
            if (!this.isPlaying) return;
            switch (e.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'Space': this.moveUp = true; break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'Space': this.moveUp = false; break;
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!this.isPlaying || this.player.isDead) return;
            if (e.button === 0) { // Left click - Light Beam
                this.shootLightBeam();
            } else if (e.button === 2) { // Right click - Shield Bubble
                this.player.activateShield();
            }
        });
    }

    private shootLightBeam() {
        // Find nearest living enemy for auto-lock
        let nearest: AngelStickman | null = null;
        let minDist = Infinity;
        const playerPos = this.player.mesh.position;

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;
            const d = enemy.mesh.position.distanceToSquared(playerPos);
            if (d < minDist) {
                minDist = d;
                nearest = enemy;
            }
        }

        // Create glowing bullet
        const geo = new THREE.SphereGeometry(0.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const bullet = new THREE.Mesh(geo, mat);
        bullet.position.copy(playerPos);
        bullet.position.y += 1.5; // Shoot from chest

        this.scene.add(bullet);
        this.bullets.push({ mesh: bullet, target: nearest, speed: 40 });
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public update(delta: number) {
        if (!this.isPlaying) return;

        // Player movement
        let isMoving = false;
        if (!this.player.isDead) {
            const speed = 10 * delta;
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            direction.y = 0;
            direction.normalize();

            const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();

            if (this.moveForward) { this.player.mesh.position.addScaledVector(direction, speed); isMoving = true; }
            if (this.moveBackward) { this.player.mesh.position.addScaledVector(direction, -speed); isMoving = true; }
            if (this.moveLeft) { this.player.mesh.position.addScaledVector(right, speed); isMoving = true; }
            if (this.moveRight) { this.player.mesh.position.addScaledVector(right, -speed); isMoving = true; }

            // Flight mechanics
            if (this.moveUp) {
                this.player.mesh.position.y += speed;
                isMoving = true;
            } else {
                // Gravity / Descend
                if (this.player.mesh.position.y > 0) {
                    this.player.mesh.position.y -= speed * 0.5;
                }
            }

            // Floor boundary
            if (this.player.mesh.position.y < 0) this.player.mesh.position.y = 0;

            // X/Z Boundaries to keep player in the cloud arena
            const bound = 48;
            this.player.mesh.position.x = Math.max(-bound, Math.min(bound, this.player.mesh.position.x));
            this.player.mesh.position.z = Math.max(-bound, Math.min(bound, this.player.mesh.position.z));

            // Face movement direction
            if (isMoving && !this.moveUp) {
                const lookTarget = new THREE.Vector3().copy(this.player.mesh.position).add(
                    direction.multiplyScalar(this.moveForward ? 1 : 0).add(direction.clone().multiplyScalar(this.moveBackward ? -1 : 0))
                );
                this.player.mesh.lookAt(lookTarget.x, this.player.mesh.position.y, lookTarget.z);
            }

            if (this.player.shieldCooldown > 0 && !this.player.shieldActive) {
                this.player.shieldCooldown -= delta;
            }
        }

        // Move clouds explicitly
        for (const cloud of this.movingClouds) {
            cloud.position.x -= 2 * delta; // move left
            if (cloud.position.x < -100) {
                cloud.position.x = 100; // wrap around
            }
        }

        this.player.updateAnimation(delta, isMoving);

        // Camera follow
        const targetCamPos = new THREE.Vector3(
            this.player.mesh.position.x,
            this.player.mesh.position.y + 5,
            this.player.mesh.position.z + 15
        );
        this.camera.position.lerp(targetCamPos, 0.1);
        this.camera.lookAt(this.player.mesh.position);

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];

            if (!b.target || b.target.isDead) {
                // Just move straightforward if target lost
                b.mesh.position.z -= b.speed * delta;
            } else {
                // Homing
                const dir = new THREE.Vector3().subVectors(b.target.mesh.position, b.mesh.position).normalize();
                b.mesh.position.addScaledVector(dir, b.speed * delta);

                // Hit detection
                if (b.mesh.position.distanceToSquared(b.target.mesh.position) < 4.0) {
                    b.target.die();
                    this.scene.remove(b.mesh);
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            // Remove if it goes too far
            if (b.mesh.position.distanceToSquared(this.player.mesh.position) > 10000) {
                this.scene.remove(b.mesh);
                this.bullets.splice(i, 1);
            }
        }

        // Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isDead) {
                enemy.updateAnimation(delta, false);
                if (enemy.deathProgress > 3.0) {
                    this.scene.remove(enemy.mesh);
                    this.enemies.splice(i, 1);
                }
                continue;
            }

            const dir = new THREE.Vector3().subVectors(this.player.mesh.position, enemy.mesh.position);
            const distSq = dir.lengthSq();

            if (distSq > 4) {
                dir.normalize();
                enemy.mesh.position.addScaledVector(dir, 5 * delta); // Flight speed
                enemy.mesh.lookAt(this.player.mesh.position);
                enemy.updateAnimation(delta, true);
            } else {
                enemy.updateAnimation(delta, false);
                // Attack player
                if (!this.player.isDead && !this.player.shieldActive) {
                    this.player.hp -= 20 * delta; // Constant damage while touching
                    if (this.player.hp <= 0) {
                        this.player.die();
                        this.triggerGodDeath();
                    }
                }
            }
        }

        // Check Victory
        if (!this.victoryTriggered && !this.player.isDead && this.enemies.length === 0) {
            this.triggerGodVictory();
        }

        // Update UI
        if (this.uiHealthBarFill) {
            this.uiHealthBarFill.style.width = `${Math.max(0, this.player.hp)}%`;
        }
    }

    private animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.renderer.domElement.style.display !== 'none') {
            const delta = this.clock.getDelta();
            this.update(delta);
            this.renderer.render(this.scene, this.camera);
        }
    }

    private triggerGodDeath() {
        this.isPlaying = false;
        setTimeout(() => {
            const container = document.getElementById('player-angel-died-video-container');
            const video = document.getElementById('player-angel-died-video') as HTMLVideoElement;
            if (container && video) {
                container.style.display = 'block';
                video.play().catch(() => {
                    container.style.display = 'none';
                    this.reset();
                    document.getElementById('god-realm-popup')!.style.display = 'block';
                });
                video.onended = () => {
                    container.style.display = 'none';
                    this.reset();
                    document.getElementById('god-realm-popup')!.style.display = 'block';
                };
            } else {
                this.reset();
                document.getElementById('god-realm-popup')!.style.display = 'block';
            }
        }, 1500); // Wait for crumble
    }

    private triggerGodVictory() {
        this.victoryTriggered = true;
        this.isPlaying = false;

        setTimeout(() => {
            const container = document.getElementById('player-defeat-angels-video-container');
            const video = document.getElementById('player-defeat-angels-video') as HTMLVideoElement;
            if (container && video) {
                container.style.display = 'block';
                video.play().catch(() => {
                    container.style.display = 'none';
                    if (this.onVictory) this.onVictory();
                });
                video.onended = () => {
                    container.style.display = 'none';
                    if (this.onVictory) this.onVictory();
                };
            } else {
                if (this.onVictory) this.onVictory();
            }
        }, 1000);
    }

    // API for main.ts orchestrator
    public reset() {
        this.player.rebuild();
        this.player.mesh.position.set(0, 5, 0);

        // Remove existing enemies
        for (const enemy of this.enemies) {
            this.scene.remove(enemy.mesh);
        }
        this.enemies = [];
        this.setupEnemies();

        // Clean bullets
        for (const b of this.bullets) {
            this.scene.remove(b.mesh);
        }
        this.bullets = [];

        if (this.uiHealthBarFill) this.uiHealthBarFill.style.width = '100%';
    }

    public getPlayerHP(): number {
        return this.player.hp;
    }

    public getEnemyCount(): number {
        return this.enemies.filter(e => !e.isDead).length;
    }
}
