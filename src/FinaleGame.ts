import * as THREE from 'three';
import { Stickman } from './Stickman';
import { AngelStickman } from './AngelStickman';

export class FinaleGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private clock: THREE.Clock;

    private player!: Stickman;
    private companion!: AngelStickman;

    private groundEnemies: Stickman[] = [];
    private airEnemies: AngelStickman[] = [];

    // Light beam projectiles fired by the companion
    private bullets: { mesh: THREE.Mesh, target: AngelStickman | Stickman | null, speed: number }[] = [];

    private moveForward = false;
    private moveBackward = false;
    private moveLeft = false;
    private moveRight = false;

    // Survival mechanics
    public isPlaying: boolean = false;
    private survivalTimer: number = 0;
    private readonly MAX_SURVIVAL_TIME = 20.0;
    private isOver: boolean = false;

    // Visuals
    private companionShootTimer: number = 0;
    private shakeTime: number = 0;
    private shakeIntensity: number = 0;

    private playVideo(videoElement: HTMLVideoElement, containerElement: HTMLElement, onEndedCallback: () => void) {
        containerElement.style.display = 'block';

        let hasEnded = false;
        const complete = () => {
            if (hasEnded) return;
            hasEnded = true;
            containerElement.style.display = 'none';
            onEndedCallback();
        };

        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.error("Video play error:", e);
                complete();
            });
        } else {
            videoElement.play().catch(e => complete());
        }

        setTimeout(() => {
            if (!hasEnded && videoElement.paused) {
                console.error("Video autoplay was blocked or hung. Skipping.");
                complete();
            }
        }, 2500);

        videoElement.onended = () => {
            complete();
        };
    }

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a0505); // Very dark reddish black
        this.scene.fog = new THREE.FogExp2(0x1a0505, 0.005); // Less dense fog for 8x larger map

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '5';
        this.renderer.domElement.style.display = 'none';

        this.clock = new THREE.Clock();

        this.setupLighting();
        this.setupTerrain();
        this.setupCharacters();
        this.setupControls();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Spawn interval
        setInterval(() => {
            if (this.isPlaying && !this.isOver) {
                this.spawnEnemyWave();
            }
        }, 2000);

        this.animate();
    }

    public getDomElement(): HTMLElement {
        return this.renderer.domElement;
    }

    private setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xff5555, 0.4);
        this.scene.add(ambientLight);

        const rimLight = new THREE.DirectionalLight(0xff0000, 2);
        rimLight.position.set(0, 50, -50);
        this.scene.add(rimLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(-50, 50, 50);
        this.scene.add(fillLight);
    }

    private setupTerrain() {
        // 8x larger map -> roughly 1600x1600
        const geometry = new THREE.PlaneGeometry(1600, 1600, 200, 200);
        geometry.rotateX(-Math.PI / 2);

        const positionAttribute = geometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);

            const dist = Math.sqrt(x * x + z * z);
            let y = 0;
            if (dist > 150) {
                y = Math.pow(dist - 150, 1.1) * 0.2;
                y += Math.sin(x * 0.1) * 5 + Math.cos(z * 0.1) * 5;
            } else {
                y = Math.sin(x * 0.2) * 1 + Math.cos(z * 0.2) * 1;
            }
            positionAttribute.setY(i, y);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x330000,
            roughness: 0.9,
            flatShading: true
        });
        const floor = new THREE.Mesh(geometry, material);
        this.scene.add(floor);

        // Setup massive fake background horde
        const dummyGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 4);
        const dummyMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const fakeHorde = new THREE.InstancedMesh(dummyGeo, dummyMat, 500);
        const dummyObj = new THREE.Object3D();
        for (let i = 0; i < 500; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 160 + Math.random() * 50;
            dummyObj.position.set(Math.cos(angle) * r, 15 + Math.random() * 10, Math.sin(angle) * r);
            dummyObj.rotation.set(0, angle + Math.PI, 0);
            dummyObj.updateMatrix();
            fakeHorde.setMatrixAt(i, dummyObj.matrix);
        }
        this.scene.add(fakeHorde);
    }

    private setupCharacters() {
        // Player (Dark Warrior)
        this.player = new Stickman(true);
        this.player.mesh.position.set(-5, 0, 10);
        this.scene.add(this.player.mesh);

        // AI Companion (Celestial Angel)
        this.companion = new AngelStickman(true);
        this.companion.mesh.position.set(0, 10, 0); // Hovering in center
        this.scene.add(this.companion.mesh);
    }

    private setupControls() {
        document.addEventListener('keydown', (e) => {
            if (!this.isPlaying || this.isOver) return;
            switch (e.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!this.isPlaying || this.isOver || this.player.isDead) return;
            if (e.button === 0) { // Left click Light Attack
                this.player.swingSwords();
                this.performLightAttackLogic();
            } else if (e.button === 2) { // Right click Heavy Attack
                if (this.player.heavyCooldown <= 0) {
                    this.player.performHeavyAttack();
                    this.performHeavyAttackLogic();
                }
            }
        });
    }

    private performLightAttackLogic() {
        const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
        const playerPos = this.player.mesh.position;

        // Light attack only hits ground enemies, slightly larger radius and wider cone
        for (let i = this.groundEnemies.length - 1; i >= 0; i--) {
            const enemy = this.groundEnemies[i];
            if (enemy.isDead) continue;

            const dir = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
            dir.y = 0;
            if (dir.lengthSq() < 64.0) { // 8 units radius
                if (playerForward.dot(dir.normalize()) > -0.5) { // 240 degree cone
                    enemy.die();
                    if (this.shakeTime <= 0) { // Slight shake
                        this.shakeTime = 0.1;
                        this.shakeIntensity = 0.3;
                    }
                }
            }
        }
    }

    private performHeavyAttackLogic() {
        const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
        const playerPos = this.player.mesh.position;

        this.shakeTime = 0.4;
        this.shakeIntensity = 1.0;

        // Kill ground enemies in massive radius
        for (let i = this.groundEnemies.length - 1; i >= 0; i--) {
            const enemy = this.groundEnemies[i];
            if (enemy.isDead) continue;

            const dir = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
            dir.y = 0;
            if (dir.lengthSq() < 625.0) { // 25 units radius
                if (playerForward.dot(dir.normalize()) > -0.5) { // 240 degree cone
                    enemy.die();
                }
            }
        }

        // Kill air enemies in massive radius
        for (let i = this.airEnemies.length - 1; i >= 0; i--) {
            const angel = this.airEnemies[i];
            if (angel.isDead) continue;

            const dir = new THREE.Vector3().subVectors(angel.mesh.position, playerPos);
            dir.y = 0; // Ignore height difference for cone check
            if (dir.lengthSq() < 625.0) { // 25 units radius
                if (playerForward.dot(dir.normalize()) > -0.5) {
                    angel.die();
                }
            }
        }
    }

    private spawnEnemyWave() {
        // Spawn 5 ground stickmen
        for (let i = 0; i < 5; i++) {
            const enemy = new Stickman(false);
            const angle = Math.random() * Math.PI * 2;
            const r = 60 + Math.random() * 20;
            enemy.mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
            this.scene.add(enemy.mesh);
            this.groundEnemies.push(enemy);
        }

        // Spawn 3 flying angels
        for (let i = 0; i < 3; i++) {
            const angel = new AngelStickman(false);
            const angle = Math.random() * Math.PI * 2;
            const r = 60 + Math.random() * 20;
            angel.mesh.position.set(Math.cos(angle) * r, 15 + Math.random() * 10, Math.sin(angle) * r);
            this.scene.add(angel.mesh);
            this.airEnemies.push(angel);
        }
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public update(delta: number) {
        if (!this.isPlaying) return;

        if (this.isOver) {
            this.companion.updateAnimation(delta, false);
            this.player.updateAnimation(delta);
            this.updateCamera(delta);
            return;
        }

        this.survivalTimer += delta;

        // Companion logic
        this.companion.updateAnimation(delta, true);

        // Companion auto-shield
        if (this.companion.shieldCooldown <= 0) {
            this.companion.activateShield();
            // Extend shield scale visually to show it protects player too
            const shieldMesh = (this.companion as any).shieldMesh;
            if (shieldMesh) {
                shieldMesh.scale.set(3, 3, 3);
            }
        } else {
            this.companion.shieldCooldown -= delta;
        }

        // Companion auto-shoot
        this.companionShootTimer += delta;
        if (this.companionShootTimer > 0.3) { // Rapid fire
            this.companionShootTimer = 0;
            this.companionShootBeam();
        }

        // Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.target || b.target.isDead) { // Target died before bullet arrived
                this.scene.remove(b.mesh);
                this.bullets.splice(i, 1);
                continue;
            }

            const dir = new THREE.Vector3().subVectors(b.target.mesh.position, b.mesh.position);
            const dist = dir.length();

            if (dist < 2.0) { // Hit
                b.target.isDead = true;
                if (b.target instanceof Stickman) {
                    b.target.die();
                }
                this.scene.remove(b.mesh);
                this.bullets.splice(i, 1);

                // Light screen shake on hit
                if (this.shakeTime <= 0) {
                    this.shakeTime = 0.1;
                    this.shakeIntensity = 0.2;
                }
            } else {
                dir.normalize();
                b.mesh.position.addScaledVector(dir, b.speed * delta);
            }
        }

        // Player Movement
        this.player.updateAnimation(delta);
        if (this.player.heavyCooldown > 0) this.player.heavyCooldown -= delta;

        let isMoving = false;
        const speed = 12 * delta;
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();

        const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();

        if (this.moveForward) { this.player.mesh.position.addScaledVector(direction, speed); isMoving = true; }
        if (this.moveBackward) { this.player.mesh.position.addScaledVector(direction, -speed); isMoving = true; }
        if (this.moveLeft) { this.player.mesh.position.addScaledVector(right, speed); isMoving = true; }
        if (this.moveRight) { this.player.mesh.position.addScaledVector(right, -speed); isMoving = true; }

        // Player boundary check
        const pp = this.player.mesh.position;
        const rSq = pp.x * pp.x + pp.z * pp.z;
        if (rSq > 150 * 150) {
            const mult = 150 / Math.sqrt(rSq);
            pp.x *= mult;
            pp.z *= mult;
        }

        // Rotate player towards movement
        if (isMoving && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
            let angle = Math.atan2(direction.x, direction.z);
            if (this.moveBackward) angle += Math.PI;
            if (this.moveLeft) angle += Math.PI / 2;
            if (this.moveRight) angle -= Math.PI / 2;

            const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            this.player.mesh.quaternion.slerp(targetQuat, 0.2);
        }

        // Target closest of Player or Companion
        const compPos = this.companion.mesh.position;
        const playerPos = this.player.mesh.position;

        // Update Ground Enemies
        for (const enemy of this.groundEnemies) {
            enemy.updateAnimation(delta);
            if (enemy.isDead) continue;

            // Determine nearest target
            const distToComp = enemy.mesh.position.distanceToSquared(compPos);
            const distToPlayer = enemy.mesh.position.distanceToSquared(playerPos);

            // Bias slightly towards player if they are close, otherwise companion
            const targetPos = (distToPlayer < distToComp) ? playerPos : compPos;
            const isTargetingCompanion = (targetPos === compPos);

            const dir = new THREE.Vector3().subVectors(targetPos, enemy.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist > 2) {
                dir.normalize();
                enemy.mesh.position.addScaledVector(dir, 8 * delta);
                enemy.mesh.rotation.y = Math.atan2(dir.x, dir.z);
            } else {
                if (isTargetingCompanion) {
                    if (!this.companion.shieldActive) {
                        this.companion.hp -= 2 * delta; // Drain companion health
                    }
                }
                // Enemies don't actually damage player in Finale, only distract/swarm
                if (!enemy.isAttacking) enemy.swingSwords();
            }
        }

        // Update Air Enemies
        for (const angel of this.airEnemies) {
            angel.updateAnimation(delta, true);
            if (angel.isDead) continue;

            const distToComp = angel.mesh.position.distanceToSquared(compPos);
            const distToPlayer = angel.mesh.position.distanceToSquared(playerPos);

            const targetPos = (distToPlayer < distToComp) ? playerPos : compPos;
            const isTargetingCompanion = (targetPos === compPos);

            const dir = new THREE.Vector3().subVectors(targetPos, angel.mesh.position);
            const dist = dir.length();
            if (dist > 3) {
                dir.normalize();
                angel.mesh.position.addScaledVector(dir, 12 * delta);
                angel.mesh.rotation.y = Math.atan2(dir.x, dir.z);
            } else {
                if (isTargetingCompanion) {
                    if (!this.companion.shieldActive) {
                        this.companion.hp -= 3 * delta; // Drain companion health heavily
                    }
                }
            }
        }

        // Companion Health forced drain exactly scaling to 20 seconds
        this.companion.hp = 100 * (1.0 - (this.survivalTimer / this.MAX_SURVIVAL_TIME));

        // Survival ending trigger
        if (this.survivalTimer >= this.MAX_SURVIVAL_TIME && !this.isOver) {
            this.triggerEnding();
        }

        this.updateCamera(delta);
    }

    private companionShootBeam() {
        let nearest: any = null;
        let minDist = Infinity;
        const compPos = this.companion.mesh.position;

        // Interleave check
        for (const e of this.airEnemies) {
            if (e.isDead) continue;
            const d = e.mesh.position.distanceToSquared(compPos);
            if (d < minDist) { minDist = d; nearest = e; }
        }
        for (const e of this.groundEnemies) {
            if (e.isDead) continue;
            const d = e.mesh.position.distanceToSquared(compPos);
            if (d < minDist) { minDist = d; nearest = e; }
        }

        if (nearest) {
            const geo = new THREE.SphereGeometry(0.5, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const bullet = new THREE.Mesh(geo, mat);
            bullet.position.copy(compPos);
            this.scene.add(bullet);
            this.bullets.push({ mesh: bullet, target: nearest, speed: 60 });
        }
    }

    private updateCamera(delta: number) {
        // Camera follows the player much closer now, lower to the ground
        const p1 = this.player.mesh.position;

        // Orbit behind player, lower angle to see the action better
        const targetCamPos = new THREE.Vector3(p1.x, p1.y + 5, p1.z - 12);
        this.camera.position.lerp(targetCamPos, 5 * delta);
        this.camera.lookAt(p1.x, p1.y + 2, p1.z + 5);

        // Screen Shake
        if (this.shakeTime > 0) {
            this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
            this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeTime -= delta;
        }
    }

    private triggerEnding() {
        this.isOver = true;
        this.companion.isDead = true;
        this.companion.hp = 0;

        setTimeout(() => {
            if (this.renderer.domElement) this.renderer.domElement.style.display = 'none';

            const powerupContainer = document.getElementById('powerup-video-container');
            const powerupVideo = document.getElementById('powerup-video') as HTMLVideoElement;
            const rampage1Container = document.getElementById('rampage-1-video-container');
            const rampage1Video = document.getElementById('rampage-1-video') as HTMLVideoElement;
            const rampage2Container = document.getElementById('rampage-2-video-container');
            const rampage2Video = document.getElementById('rampage-2-video') as HTMLVideoElement;
            const explosionContainer = document.getElementById('explosion-video-container');
            const explosionVideo = document.getElementById('explosion-video') as HTMLVideoElement;
            const finaleContainer = document.getElementById('finale-video-container');
            const finaleVideo = document.getElementById('finale-video') as HTMLVideoElement;
            const powerdownContainer = document.getElementById('powerdown-video-container');
            const powerdownVideo = document.getElementById('powerdown-video') as HTMLVideoElement;
            const theEndContainer = document.getElementById('the-end-video-container');
            const theEndVideo = document.getElementById('the-end-video') as HTMLVideoElement;

            const playNext = (container: HTMLElement | null, video: HTMLVideoElement | null, nextCallback: () => void) => {
                if (container && video) {
                    this.playVideo(video, container, nextCallback);
                } else {
                    nextCallback();
                }
            };

            playNext(powerupContainer, powerupVideo, () => {
                playNext(rampage1Container, rampage1Video, () => {
                    playNext(rampage2Container, rampage2Video, () => {
                        playNext(explosionContainer, explosionVideo, () => {
                            playNext(finaleContainer, finaleVideo, () => {
                                playNext(powerdownContainer, powerdownVideo, () => {
                                    playNext(theEndContainer, theEndVideo, () => {
                                        // Show ending popup
                                        const endingPopup = document.getElementById('ending-popup');
                                        const endingOkayBtn = document.getElementById('ending-okay-btn');
                                        if (endingPopup) endingPopup.style.display = 'block';

                                        if (endingOkayBtn) {
                                            endingOkayBtn.addEventListener('click', () => {
                                                window.location.reload();
                                            });
                                        } else {
                                            // Fallback
                                            window.location.reload();
                                        }
                                    });
                                });
                            });
                        });
                    });
                });
            });
        }, 500);
    }

    private animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.renderer.domElement.style.display !== 'none') {
            const delta = this.clock.getDelta();
            this.update(delta);
            this.renderer.render(this.scene, this.camera);
        }
    }

    public reset() {
        this.isOver = false;
        this.survivalTimer = 0;
        this.companion.hp = 100;
        this.companion.isDead = false;
        this.companionShootTimer = 0;

        // Cleanup enemies
        for (const e of this.groundEnemies) this.scene.remove(e.mesh);
        for (const e of this.airEnemies) this.scene.remove(e.mesh);
        this.groundEnemies = [];
        this.airEnemies = [];

        for (const b of this.bullets) this.scene.remove(b.mesh);
        this.bullets = [];

        this.player.rebuild();
        this.player.mesh.position.set(-5, 0, 10);
        this.companion.mesh.position.set(0, 10, 0);
    }
}
