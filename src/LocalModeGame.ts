import * as THREE from 'three';
import { Stickman } from './Stickman';

export class LocalModeGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private clock: THREE.Clock;

    private player!: Stickman;
    private moveForward = false;
    private moveBackward = false;
    private moveLeft = false;
    private moveRight = false;
    private enemies: Stickman[] = [];

    private fakeArmy!: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();

    public isPlaying: boolean = false;

    // Wave Mechanics
    private currentWave: number = 0;
    private isSpawningWave: boolean = false;
    private totalEnemiesInWave: number = 0;

    public onDeath?: (waveReached: number) => void;

    // Visuals
    private uiCooldownBar!: HTMLElement;
    private shakeTime: number = 0;
    private shakeIntensity: number = 0;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a0505);
        this.scene.fog = new THREE.FogExp2(0x1a0505, 0.02);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '5';
        this.renderer.domElement.style.display = 'none';

        this.clock = new THREE.Clock();

        this.setupLighting();
        this.setupTerrain();
        this.setupPlayer();
        this.setupControls();

        // Create Circular Cooldown Indicator
        this.uiCooldownBar = document.createElement('div');
        this.uiCooldownBar.style.position = 'absolute';
        this.uiCooldownBar.style.width = '30px';
        this.uiCooldownBar.style.height = '30px';
        this.uiCooldownBar.style.transform = 'translate(-50%, -50%)';
        this.uiCooldownBar.style.display = 'none';

        this.uiCooldownBar.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 30 30" style="transform: rotate(-90deg);">
                <circle cx="15" cy="15" r="12" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" />
                <circle id="local-cd-circle-fill" cx="15" cy="15" r="12" fill="none" stroke="white" stroke-width="4" 
                        stroke-dasharray="75.4" stroke-dashoffset="75.4" style="transition: stroke-dashoffset 0.1s linear, stroke 0.2s;" />
            </svg>
        `;
        document.getElementById('ui-layer')?.appendChild(this.uiCooldownBar);

        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Start animation loop
        this.animate();
    }

    public getDomElement(): HTMLElement {
        return this.renderer.domElement;
    }

    private setupLighting(): void {
        const ambientLight = new THREE.AmbientLight(0xff4444, 0.5);
        this.scene.add(ambientLight);

        const rimLight = new THREE.DirectionalLight(0xff0000, 2);
        rimLight.position.set(0, 10, -10);
        this.scene.add(rimLight);

        const fillLight = new THREE.DirectionalLight(0x222222, 1);
        fillLight.position.set(-10, 5, 10);
        this.scene.add(fillLight);
    }

    private setupTerrain(): void {
        const geometry = new THREE.PlaneGeometry(200, 200, 100, 100);
        geometry.rotateX(-Math.PI / 2);

        const positionAttribute = geometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);

            const distFromCenter = Math.sqrt(x * x + z * z);
            let y = 0;
            if (distFromCenter > 20) {
                y = Math.pow(distFromCenter - 20, 1.2) * 0.15;
                y += Math.sin(x) * 2 + Math.cos(z) * 2;
            } else {
                y = Math.sin(x * 0.5) * 0.5 + Math.cos(z * 0.5) * 0.5;
            }
            positionAttribute.setY(i, y);
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x220000,
            roughness: 0.8,
            flatShading: true
        });

        const floor = new THREE.Mesh(geometry, material);
        this.scene.add(floor);

        // Fake army in background
        const dummyGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
        const dummyMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.fakeArmy = new THREE.InstancedMesh(dummyGeo, dummyMat, 300);

        for (let i = 0; i < 300; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 25 + Math.random() * 20;
            this.dummy.position.set(Math.cos(angle) * radius, 0.75, Math.sin(angle) * radius);
            this.dummy.updateMatrix();
            this.fakeArmy.setMatrixAt(i, this.dummy.matrix);
        }
        this.scene.add(this.fakeArmy);
    }

    private setupPlayer(): void {
        this.player = new Stickman(true);
        this.scene.add(this.player.mesh);
    }

    private setupControls() {
        document.addEventListener('keydown', (event) => {
            if (!this.isPlaying) return;
            switch (event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
            }
        });

        document.addEventListener('mousedown', (event) => {
            if (!this.isPlaying || this.player.isDead) return;
            if (event.button === 0) { // Left click
                this.player.swingSwords();
            } else if (event.button === 2) { // Right click
                if (this.player.heavyCooldown <= 0) {
                    this.player.performHeavyAttack();
                    this.performHeavyAttackLogic();
                }
            }
        });
    }

    private performHeavyAttackLogic() {
        const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
        const playerPos = this.player.mesh.position;

        this.shakeTime = 0.4;
        this.shakeIntensity = 1.0;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isDead) continue;

            const dir = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
            dir.y = 0;
            const distSq = dir.lengthSq();

            if (distSq < 100.0) { // Large radius (10 units)
                if (playerForward.dot(dir.normalize()) > 0.6) {
                    enemy.die();
                }
            }
        }
    }

    private spawnWave() {
        this.isSpawningWave = true;
        this.currentWave++;
        // Wave 1 = 100 enemies. Wave 2 = 150 enemies. etc.
        this.totalEnemiesInWave = 100 + ((this.currentWave - 1) * 50);

        // Batch spawn around the valley rim
        for (let i = 0; i < this.totalEnemiesInWave; i++) {
            const enemy = new Stickman(false);
            const angle = Math.random() * Math.PI * 2;
            const radius = 25 + Math.random() * 10;

            enemy.mesh.position.set(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );

            this.scene.add(enemy.mesh);
            this.enemies.push(enemy);
        }

        console.log(`Local Mode: Started Wave ${this.currentWave} with ${this.totalEnemiesInWave} enemies.`);
        this.isSpawningWave = false;
    }

    private checkWaveCompletion() {
        if (this.isSpawningWave || this.enemies.length === 0) return;

        // If all spawned enemies in the list are dead
        const livingEnemies = this.enemies.filter(e => !e.isDead);
        if (livingEnemies.length === 0) {
            // Cleanup corpses immediately to save massive memory over infinite waves
            for (const enemy of this.enemies) {
                this.scene.remove(enemy.mesh);
            }
            this.enemies = [];

            // Wait 2 seconds, show the CSS wave survived popup, then progress
            this.isSpawningWave = true;

            const popup = document.getElementById('wave-survived-popup');
            const waveText = document.getElementById('wave-survived-text');
            if (popup && waveText) {
                waveText.innerText = `Survived Wave ${this.currentWave}`;
                popup.style.display = 'block';
                popup.style.opacity = '1';

                setTimeout(() => {
                    popup.style.opacity = '0';
                    setTimeout(() => {
                        popup.style.display = 'none';
                        this.spawnWave();
                    }, 500); // Wait for fade out
                }, 2000); // Show popup for 2 seconds
            } else {
                this.spawnWave();
            }
        }
    }

    private update(delta: number) {
        if (!this.isPlaying) return;

        // Player Death
        if (this.player.hp <= 0 && !this.player.isDead) {
            this.player.die();
            setTimeout(() => {
                if (this.onDeath) this.onDeath(this.currentWave);
            }, 3000); // 3 seconds to watch death before popup
            return;
        }

        const hpFill = document.getElementById('health-bar-fill');
        if (hpFill) {
            hpFill.style.width = `${Math.max(0, this.player.hp)}%`;
            hpFill.style.backgroundColor = '#ffffff'; // White health bar as in story mode
        }

        // Animate Player
        this.player.updateAnimation(delta);

        if (this.player.heavyCooldown > 0) {
            this.player.heavyCooldown -= delta;

            this.uiCooldownBar.style.display = 'block';
            const cdPercent = 1.0 - (this.player.heavyCooldown / 5.0);

            const circleFill = document.getElementById('local-cd-circle-fill');
            if (circleFill) {
                const offset = 75.4 - (75.4 * cdPercent);
                circleFill.style.strokeDashoffset = offset.toString();
                circleFill.style.stroke = cdPercent >= 0.98 ? '#00ff00' : 'white';
            }

            const vector = new THREE.Vector3();
            vector.copy(this.player.mesh.position);
            vector.y += 2.5; // Above head
            vector.project(this.camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (vector.y * -.5 + .5) * window.innerHeight;
            this.uiCooldownBar.style.left = `${x}px`;
            this.uiCooldownBar.style.top = `${y}px`;

            if (this.player.heavyCooldown <= 0) {
                setTimeout(() => {
                    if (this.player.heavyCooldown <= 0) this.uiCooldownBar.style.display = 'none';
                }, 500);
            }
        } else {
            if (this.player.heavyCooldown <= -0.5) {
                this.uiCooldownBar.style.display = 'none';
            }
        }

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

            // Keep player inside valley
            const maxRadius = 18;
            const currentRadius = Math.sqrt(this.player.mesh.position.x ** 2 + this.player.mesh.position.z ** 2);
            if (currentRadius > maxRadius) {
                const ratio = maxRadius / currentRadius;
                this.player.mesh.position.x *= ratio;
                this.player.mesh.position.z *= ratio;
            }

            // Rotate player
            if (isMoving && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
                let angle = Math.atan2(direction.x, direction.z);
                if (this.moveBackward) angle += Math.PI;
                if (this.moveLeft) angle += Math.PI / 2;
                if (this.moveRight) angle -= Math.PI / 2;

                const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                this.player.mesh.quaternion.slerp(targetQuat, 0.2);
            }

            // Simple Attack hit detection logic
            if (this.player.isAttacking) {
                const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
                const playerPos = this.player.mesh.position;

                for (const enemy of this.enemies) {
                    if (enemy.isDead) continue;
                    const dir = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
                    dir.y = 0;
                    if (dir.lengthSq() < 9.0) { // 3 units
                        if (playerForward.dot(dir.normalize()) > 0.3) {
                            enemy.die();
                            if (this.shakeTime <= 0) {
                                this.shakeTime = 0.2;
                                this.shakeIntensity = 0.5;
                            }
                        }
                    }
                }
            }
        }

        // Camera follow (with shake)
        const targetCamPos = new THREE.Vector3(
            this.player.mesh.position.x,
            this.player.mesh.position.y + 6,
            this.player.mesh.position.z + 10
        );

        if (this.shakeTime > 0) {
            this.shakeTime -= delta;
            targetCamPos.x += (Math.random() - 0.5) * this.shakeIntensity;
            targetCamPos.y += (Math.random() - 0.5) * this.shakeIntensity;
            targetCamPos.z += (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= 0.9; // fade out shake
        }

        this.camera.position.lerp(targetCamPos, 0.1);
        this.camera.lookAt(this.player.mesh.position);

        // Update enemies identically to story mode
        const speed = 2.5 * delta;
        const playerPos = this.player.mesh.position;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            if (enemy.isDead) {
                enemy.updateAnimation(delta);
                if (enemy.deathProgress > 3.0) { // Remove after 3 seconds of crumbling
                    this.scene.remove(enemy.mesh);
                    this.enemies.splice(i, 1);
                }
                continue;
            }

            // Move towards player
            const dir = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position);
            dir.y = 0;
            const distSq = dir.lengthSq();

            if (distSq > 2.5) { // Stop when close enough to attack
                dir.normalize();
                enemy.mesh.position.addScaledVector(dir, speed);
                // Look at player
                enemy.mesh.lookAt(playerPos.x, enemy.mesh.position.y, playerPos.z);
            } else {
                // Look at player when attacking
                enemy.mesh.lookAt(playerPos.x, enemy.mesh.position.y, playerPos.z);

                // Enemy attack logic
                if (enemy.attackCooldown <= 0 && !this.player.isDead) {
                    enemy.swingSwords();
                    enemy.attackCooldown = 1.0 + Math.random(); // Attack every 1-2 seconds

                    // Deal 1% damage
                    this.player.hp -= 1;

                    if (this.shakeTime <= 0) {
                        this.shakeTime = 0.2;
                        this.shakeIntensity = 0.3;
                    }
                }
            }
            if (enemy.attackCooldown > 0) enemy.attackCooldown -= delta;
        }

        for (const e of this.enemies) {
            e.updateAnimation(delta);
        }

        // Manage Wave Progression
        this.checkWaveCompletion();
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.renderer.domElement.style.display !== 'none') {
            const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
            this.update(delta);
            this.renderer.render(this.scene, this.camera);
        }
    }

    public reset() {
        for (const e of this.enemies) {
            this.scene.remove(e.mesh);
        }
        this.enemies = [];
        this.currentWave = 0;
        this.isSpawningWave = false;

        this.player.rebuild();
        this.player.mesh.position.set(0, 0, 0);

        this.shakeTime = 0;
        this.shakeIntensity = 0;

        // Start wave 1
        this.spawnWave();
    }
}
