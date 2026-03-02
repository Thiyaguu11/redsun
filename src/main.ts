import * as THREE from 'three';
import { Stickman } from './Stickman';
import { GodRealmGame } from './GodRealmGame';
import { FinaleGame } from './FinaleGame';
import { LocalModeGame } from './LocalModeGame';

// We manage global GodRealm, Finale, and Local game instances
let godRealm: GodRealmGame | null = null;
let finaleGame: FinaleGame | null = null;
let localModeGame: LocalModeGame | null = null;

class Game {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    private clock: THREE.Clock;

    private player!: Stickman;
    private moveForward = false;
    private moveBackward = false;
    private moveLeft = false;
    private moveRight = false;
    private enemies: Stickman[] = [];

    private fakeArmy!: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();

    private isPlaying: boolean = false;
    private victoryTriggered: boolean = false;
    private uiHealthBarFill!: HTMLElement;
    private uiCooldownBar!: HTMLElement;
    private combatAudio!: HTMLAudioElement;

    // Screen Shake
    private shakeTime: number = 0;
    private shakeIntensity: number = 0;

    constructor() {
        this.scene = new THREE.Scene();

        // Set up a strong red gradient background (baking sky color)
        this.scene.background = new THREE.Color(0x3a0000); // Dark red
        this.scene.fog = new THREE.FogExp2(0x3a0000, 0.02);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        this.setupLighting();
        this.setupTerrain();
        this.setupPlayer();
        this.setupControls();
        this.setupEnemies();
        this.setupFakeArmy();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.animate();

        // Setup the Main Menu binding instead of auto-starting the intro screen
        this.setupMainMenu();
    }

    private setupMainMenu() {
        const mainMenu = document.getElementById('main-menu-screen');
        const storyBtn = document.getElementById('story-mode-btn');
        const localBtn = document.getElementById('local-mode-btn');

        if (storyBtn && mainMenu) {
            storyBtn.addEventListener('click', () => {
                mainMenu.style.display = 'none';
                this.startStoryMode();
            });
        }

        if (localBtn && mainMenu) {
            localBtn.addEventListener('click', () => {
                mainMenu.style.display = 'none';
                this.startLocalMode();
            });
        }
    }

    private startStoryMode() {
        const mainMenu = document.getElementById('main-menu-screen');
        if (mainMenu) {
            mainMenu.style.display = 'none';
            mainMenu.style.visibility = 'hidden';
            mainMenu.style.opacity = '0';
            mainMenu.style.pointerEvents = 'none';
            mainMenu.style.zIndex = '-9999';
        }

        const introAudio = document.getElementById('intro-audio') as HTMLAudioElement;
        if (introAudio) {
            introAudio.volume = 0.5;
            introAudio.play().catch(e => console.log("Intro audio error:", e));
        }

        const storyImages1 = [
            { url: '/1.jpeg', duration: 5000 },
            { url: '/2.png', duration: 5000 },
            { url: '/3.png', duration: 5000 },
            { url: '/4.png', duration: 5000 },
            { url: '/5.png', duration: 5000 },
            { url: '/dark_realm_intro.png', duration: 15000 }
        ];

        this.playSlideshow(storyImages1, () => {
            if (introAudio) {
                introAudio.pause();
                introAudio.currentTime = 0;
            }

            const introVidContainer = document.getElementById('intro-video-container');
            const introVid = document.getElementById('intro-video') as HTMLVideoElement;

            if (introVidContainer && introVid) {
                this.playVideo(introVid, introVidContainer, () => {
                    document.getElementById('start-popup')!.style.display = 'block';
                });
            }
        });
    }

    private startLocalMode() {
        const mainMenu = document.getElementById('main-menu-screen');
        if (mainMenu) {
            mainMenu.style.display = 'none';
            mainMenu.style.visibility = 'hidden';
            mainMenu.style.opacity = '0';
            mainMenu.style.pointerEvents = 'none';
            mainMenu.style.zIndex = '-9999';
        }

        // Health bar should remain visible for Local Mode
        document.getElementById('health-bar-container')!.style.display = 'block';
        this.renderer.domElement.style.display = 'none';

        if (!localModeGame) {
            localModeGame = new LocalModeGame();
            document.getElementById('app')!.appendChild(localModeGame.getDomElement());

            localModeGame.onDeath = (waveReached: number) => {
                alert(`You reached Wave ${waveReached}`);
                localModeGame!.isPlaying = false;
                localModeGame!.getDomElement().style.display = 'none';

                if (mainMenu) {
                    mainMenu.style.display = 'flex';
                    mainMenu.style.visibility = 'visible';
                    mainMenu.style.opacity = '1';
                    mainMenu.style.pointerEvents = 'auto';
                    mainMenu.style.zIndex = '50';
                }
            };
        }

        localModeGame.reset();
        localModeGame.getDomElement().style.display = 'block';
        localModeGame.isPlaying = true;
    }

    private playVideo(videoElement: HTMLVideoElement, containerElement: HTMLElement, onEndedCallback: () => void) {
        containerElement.style.display = 'block';
        videoElement.play().catch(e => {
            console.error("Video play error:", e);
            containerElement.style.display = 'none';
            onEndedCallback();
        });

        videoElement.onended = () => {
            containerElement.style.display = 'none';
            onEndedCallback();
        };
    }

    private setupPlayer(): void {
        this.player = new Stickman(true); // true = isPlayer (has scarf & swords)
        this.player.mesh.position.set(0, 0, 0); // Start in middle of valley
        this.scene.add(this.player.mesh);
    }

    private setupControls(): void {
        this.combatAudio = document.getElementById('combat-audio') as HTMLAudioElement;
        if (this.combatAudio) this.combatAudio.volume = 0.4;

        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                document.getElementById('start-popup')!.style.display = 'none';
                document.getElementById('health-bar-container')!.style.display = 'block';
                this.isPlaying = true;
                if (this.combatAudio) {
                    this.combatAudio.currentTime = 0;
                    this.combatAudio.play().catch(e => console.log("Audio play error", e));
                }
            });
        }

        this.uiHealthBarFill = document.getElementById('health-bar-fill') as HTMLElement;

        // Create Circular Cooldown Indicator dynamically using SVG
        this.uiCooldownBar = document.createElement('div');
        this.uiCooldownBar.style.position = 'absolute';
        this.uiCooldownBar.style.width = '30px';
        this.uiCooldownBar.style.height = '30px';
        this.uiCooldownBar.style.transform = 'translate(-50%, -50%)';
        this.uiCooldownBar.style.display = 'none'; // Hidden initially

        // SVG Circle setup
        this.uiCooldownBar.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 30 30" style="transform: rotate(-90deg);">
                <circle cx="15" cy="15" r="12" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" />
                <circle id="cd-circle-fill" cx="15" cy="15" r="12" fill="none" stroke="white" stroke-width="4" 
                        stroke-dasharray="75.4" stroke-dashoffset="75.4" style="transition: stroke-dashoffset 0.1s linear, stroke 0.2s;" />
            </svg>
        `;
        document.getElementById('ui-layer')?.appendChild(this.uiCooldownBar);

        document.addEventListener('contextmenu', e => e.preventDefault());

        document.addEventListener('keydown', (event) => {
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
            if (!this.isPlaying) return;
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

        // Trigger large screen shake
        this.shakeTime = 0.4;
        this.shakeIntensity = 1.0;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isDead) continue;

            const dir = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
            dir.y = 0;
            const distSq = dir.lengthSq();

            if (distSq < 100.0) { // Large radius (10 units)
                if (playerForward.dot(dir.normalize()) > 0.6) { // Reduced front cone from 0.3 to 0.6 (narrower)
                    enemy.die();
                }
            }
        }
    }

    private setupLighting(): void {
        // Ambient light for the base dark tone
        const ambientLight = new THREE.AmbientLight(0xff4444, 0.5);
        this.scene.add(ambientLight);

        // Simulated Rim Light using directional lights pointing towards the camera/subjects
        const rimLight = new THREE.DirectionalLight(0xff0000, 2);
        rimLight.position.set(0, 10, -10);
        this.scene.add(rimLight);

        const fillLight = new THREE.DirectionalLight(0x222222, 1);
        fillLight.position.set(-10, 5, 10);
        this.scene.add(fillLight);
    }

    private setupTerrain(): void {
        // Small valley surrounded by mountains
        // We use a plane and modify its vertices
        const geometry = new THREE.PlaneGeometry(200, 200, 100, 100);
        geometry.rotateX(-Math.PI / 2);

        const positionAttribute = geometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);

            // Simple procedural valley logic using math
            // Center is valley (low y), edges are mountains (high y)
            const distFromCenter = Math.sqrt(x * x + z * z);
            let y = 0;
            if (distFromCenter > 20) {
                y = Math.pow(distFromCenter - 20, 1.2) * 0.15;
                // Add some noise to mountains
                y += Math.sin(x) * 2 + Math.cos(z) * 2;
            } else {
                // Valley floor noise
                y = Math.sin(x * 0.5) * 0.5 + Math.cos(z * 0.5) * 0.5;
            }
            positionAttribute.setY(i, y);
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x1a0505,
            roughness: 0.9,
            flatShading: true
        });
        const terrain = new THREE.Mesh(geometry, material);
        this.scene.add(terrain);
    }

    private setupFakeArmy(): void {
        const geo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0x050000 }); // Very dark red/black

        // 300 fake enemies
        const count = 300;
        this.fakeArmy = new THREE.InstancedMesh(geo, material, count);

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 60 + Math.random() * 40; // Far away, outside the valley
            this.dummy.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
            this.dummy.lookAt(0, 0.5, 0); // Face center
            this.dummy.updateMatrix();
            this.fakeArmy.setMatrixAt(i, this.dummy.matrix);
        }

        this.scene.add(this.fakeArmy);
    }

    private setupEnemies(): void {
        for (let i = 0; i < 100; i++) { // Increased to 100 enemies for swarm effect
            const enemy = new Stickman(false);
            const angle = Math.random() * Math.PI * 2;
            const radius = 10 + Math.random() * 20; // Spread out more
            enemy.mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

            // Randomize some rotation
            enemy.mesh.rotation.y = Math.random() * Math.PI * 2;

            this.enemies.push(enemy);
            this.scene.add(enemy.mesh);
        }
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private resetGame(): void {
        this.isPlaying = false;
        this.victoryTriggered = false;

        // Stop audio if running
        if (this.combatAudio) {
            this.combatAudio.pause();
            this.combatAudio.currentTime = 0;
        }

        // Reset player completely
        this.player.rebuild();
        this.player.mesh.position.set(0, 0, 0);
        this.player.mesh.rotation.set(0, 0, 0);

        // Remove old enemies
        for (const enemy of this.enemies) {
            this.scene.remove(enemy.mesh);
            (enemy as any).brokenParts.forEach((p: any) => this.scene.remove(p.obj));
        }
        this.enemies = [];

        // Re-setup enemies
        this.setupEnemies();

        // Update UI state
        if (this.uiHealthBarFill) this.uiHealthBarFill.style.width = '100%';
        if (this.uiCooldownBar) {
            this.uiCooldownBar.style.display = 'none';
            const circleFill = document.getElementById('cd-circle-fill');
            if (circleFill) circleFill.style.strokeDashoffset = '75.4'; // Reset dash
        }

        document.getElementById('health-bar-container')!.style.display = 'none';
        document.getElementById('start-popup')!.style.display = 'block';
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        if (!this.isPlaying) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.updatePlayer(delta);
        this.updateEnemies(delta);

        // Victory Condition Check
        if (this.isPlaying && !this.victoryTriggered && !this.player.isDead && this.enemies.length === 0) {
            this.triggerVictory();
        }

        // Update UI
        if (this.uiHealthBarFill) {
            const hpPercent = Math.max(0, this.player.hp);
            this.uiHealthBarFill.style.width = `${hpPercent}%`;
        }

        // Bob fake army
        if (this.fakeArmy) {
            for (let i = 0; i < 300; i++) {
                this.fakeArmy.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                this.dummy.position.y = 0.5 + Math.sin(time * 5.0 + i) * 0.1;
                this.dummy.updateMatrix();
                this.fakeArmy.setMatrixAt(i, this.dummy.matrix);
            }
            this.fakeArmy.instanceMatrix.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    private updatePlayer(delta: number) {
        if (this.player.isDead) {
            this.player.updateAnimation(delta);
            return; // Don't move if dead
        }

        const speed = 6.0 * delta;
        const moveDir = new THREE.Vector3(0, 0, 0);

        if (this.moveForward) moveDir.z -= 1;
        if (this.moveBackward) moveDir.z += 1;
        if (this.moveLeft) moveDir.x -= 1;
        if (this.moveRight) moveDir.x += 1;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            this.player.mesh.position.addScaledVector(moveDir, speed);
            // Look in move direction (smoothly or instantly)
            const targetPos = this.player.mesh.position.clone().add(moveDir);
            this.player.mesh.lookAt(targetPos);
        }

        // Keep player in valley bounds roughly
        const dist = this.player.mesh.position.length();
        if (dist > 18) {
            this.player.mesh.position.multiplyScalar(18 / dist);
        }
        this.player.mesh.position.y = 0;

        if (this.player.heavyCooldown > 0) {
            this.player.heavyCooldown -= delta;

            // Show and update cooldown circle above player
            this.uiCooldownBar.style.display = 'block';
            const cdPercent = 1.0 - (this.player.heavyCooldown / 5.0);

            const circleFill = document.getElementById('cd-circle-fill');
            if (circleFill) {
                // Circumference of r=12 is ~75.4
                const offset = 75.4 - (75.4 * cdPercent);
                circleFill.style.strokeDashoffset = offset.toString();
                // Turn green if fully ready, otherwise white
                circleFill.style.stroke = cdPercent >= 0.98 ? '#00ff00' : 'white';
            }

            // Position above player taking camera projection into account
            const vector = new THREE.Vector3();
            vector.copy(this.player.mesh.position);
            vector.y += 2.5; // Above head
            vector.project(this.camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (vector.y * -.5 + .5) * window.innerHeight;
            this.uiCooldownBar.style.left = `${x}px`;
            this.uiCooldownBar.style.top = `${y}px`;

            // Hide automatically when done
            if (this.player.heavyCooldown <= 0) {
                setTimeout(() => {
                    if (this.player.heavyCooldown <= 0) this.uiCooldownBar.style.display = 'none';
                }, 500); // Leave it green for half a second
            }

        } else {
            // Failsafe hide if not animating out.
            if (this.player.heavyCooldown <= -0.5) {
                this.uiCooldownBar.style.display = 'none';
            }
        }

        this.player.updateAnimation(delta);

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
    }

    private updateEnemies(delta: number) {
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
                    if (this.player.hp <= 0 && !this.player.isDead) {
                        this.player.die();
                        console.log("Player died!");
                        this.uiCooldownBar.style.display = 'none';

                        if (this.combatAudio) {
                            this.combatAudio.pause();
                        }

                        // Wait a bit before showing video so the death animation starts
                        setTimeout(() => {
                            const videoContainer = document.getElementById('death-video-container');
                            const video = document.getElementById('death-video') as HTMLVideoElement;
                            if (videoContainer && video) {
                                videoContainer.style.display = 'block';
                                video.play().catch(e => {
                                    console.error("Video autoplay blocked or failed", e);
                                    // Fallback reset if video fails
                                    videoContainer.style.display = 'none';
                                    this.resetGame();
                                });

                                // Listen for when the video ends
                                video.onended = () => {
                                    videoContainer.style.display = 'none';
                                    this.resetGame();
                                };
                            } else {
                                this.resetGame(); // Fallback
                            }
                        }, 1500); // 1.5 second delay to watch crumbling before video
                    }
                }
            }

            if (enemy.attackCooldown > 0) {
                enemy.attackCooldown -= delta;
            }

            // Check weapon collision (instant kill)
            // Simple distance check: if player is swinging and enemy is close in front
            if (this.player.isAttacking && distSq < 9.0) { // 3 units kill radius
                // Check if player is facing enemy
                const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
                if (playerForward.dot(dir.normalize()) > 0.3) { // roughly in front
                    enemy.die();

                    // Trigger screen shake
                    this.shakeTime = 0.2; // 0.2 seconds
                    this.shakeIntensity = 0.5;
                }
            }

            enemy.updateAnimation(delta);
        }
    }

    private triggerVictory(): void {
        this.victoryTriggered = true;
        this.isPlaying = false;

        if (this.combatAudio) {
            this.combatAudio.pause();
        }

        const videoContainer = document.getElementById('victory-video-container');
        const video = document.getElementById('victory-video') as HTMLVideoElement;

        const changeContainer = document.getElementById('angel-realm-change-video-container');
        const changeVideo = document.getElementById('angel-realm-change-video') as HTMLVideoElement;

        const fightContainer = document.getElementById('angels-fight-video-container');
        const fightVideo = document.getElementById('angels-fight-video') as HTMLVideoElement;

        if (videoContainer && video) {
            this.playVideo(video, videoContainer, () => {
                const storyImages2 = [
                    { url: '/6.png', duration: 5000 },
                    { url: '/7.png', duration: 5000 },
                    { url: '/8.png', duration: 5000 }
                ];

                const introAudio = document.getElementById('intro-audio') as HTMLAudioElement;
                if (introAudio) {
                    introAudio.volume = 0.5;
                    introAudio.currentTime = 0;
                    introAudio.play().catch(e => console.log("Intro audio error:", e));
                }

                this.playSlideshow(storyImages2, () => {
                    if (changeContainer && changeVideo) {
                        this.playVideo(changeVideo, changeContainer, () => {
                            // Play third video
                            if (fightContainer && fightVideo) {
                                this.playVideo(fightVideo, fightContainer, () => {
                                    this.transitionToGodRealm();
                                });
                            } else {
                                this.transitionToGodRealm();
                            }
                        });
                    } else {
                        this.transitionToGodRealm();
                    }
                });
            });
        } else {
            this.transitionToGodRealm();
        }
    }

    private playSlideshow(images: { url: string, duration: number }[], onComplete: () => void) {
        const container = document.getElementById('fullscreen-image-container');
        const imgElement = document.getElementById('fullscreen-image') as HTMLImageElement;
        if (!container || !imgElement || images.length === 0) {
            onComplete();
            return;
        }

        container.style.display = 'block';
        let currentIndex = 0;

        const showNext = () => {
            if (currentIndex >= images.length) {
                container.style.display = 'none';
                onComplete();
                return;
            }
            imgElement.src = images[currentIndex].url;
            const delay = images[currentIndex].duration;
            currentIndex++;
            setTimeout(showNext, delay);
        };

        showNext();
    }

    private transitionToGodRealm(): void {
        // Stop intro audio if it's playing from the transition sequence
        const introAudio = document.getElementById('intro-audio') as HTMLAudioElement;
        if (introAudio) {
            introAudio.pause();
            introAudio.currentTime = 0;
        }

        // Hide Dark Realm UI
        document.getElementById('health-bar-container')!.style.display = 'none';

        // Hide Dark Realm Canvas
        this.renderer.domElement.style.display = 'none';

        // Initialize God Realm
        if (!godRealm) {
            godRealm = new GodRealmGame();
            document.getElementById('app')!.appendChild(godRealm.getDomElement());

            // Handle God Realm Victory -> Transition to Finale
            godRealm.onVictory = () => {
                this.triggerFinaleTransition();
            };

            // Wire up God Realm Start button
            const godStartBtn = document.getElementById('god-start-btn');
            if (godStartBtn) {
                godStartBtn.addEventListener('click', () => {
                    document.getElementById('god-realm-popup')!.style.display = 'none';
                    // We can reuse the health bar container or the one specific to god realm
                    const hpFill = document.getElementById('health-bar-fill');
                    if (hpFill) hpFill.style.backgroundColor = '#ffcc00'; // Make it god-like
                    document.getElementById('health-bar-container')!.style.display = 'block';

                    godRealm!.isPlaying = true;
                });
            }
        }

        // Setup God Realm View
        godRealm.reset();
        godRealm.getDomElement().style.display = 'block';
        document.getElementById('god-realm-popup')!.style.display = 'block';
    }

    private triggerFinaleTransition(): void {
        // Hide God Realm DOM completely
        if (godRealm) {
            godRealm.getDomElement().style.display = 'none';
        }
        document.getElementById('health-bar-container')!.style.display = 'none';

        const saveContainer = document.getElementById('angel-save-video-container');
        const saveVideo = document.getElementById('angel-save-video') as HTMLVideoElement;

        const syncupContainer = document.getElementById('syncup-fail-video-container');
        const syncupVideo = document.getElementById('syncup-fail-video') as HTMLVideoElement;

        const startFinale = () => {
            if (saveContainer) saveContainer.style.display = 'none';
            if (syncupContainer) syncupContainer.style.display = 'none';
            this.transitionToFinale();
        };

        if (saveContainer && saveVideo) {
            this.playVideo(saveVideo, saveContainer, () => {
                if (syncupContainer && syncupVideo) {
                    this.playVideo(syncupVideo, syncupContainer, () => {
                        startFinale();
                    });
                } else {
                    startFinale();
                }
            });
        } else {
            startFinale();
        }
    }

    private transitionToFinale(): void {
        // Hide existing contexts
        this.renderer.domElement.style.display = 'none';
        if (godRealm) godRealm.getDomElement().style.display = 'none';

        if (!finaleGame) {
            finaleGame = new FinaleGame();
            document.getElementById('app')!.appendChild(finaleGame.getDomElement());

            const finaleStartBtn = document.getElementById('finale-start-btn');
            if (finaleStartBtn) {
                finaleStartBtn.addEventListener('click', () => {
                    document.getElementById('finale-popup')!.style.display = 'none';
                    // The health bar isn't explicitly requested for Finale player, 
                    // but we can turn it on if needed. Left off for now for purity.

                    finaleGame!.isPlaying = true;
                });
            }
        }

        finaleGame.reset();
        finaleGame.getDomElement().style.display = 'block';
        document.getElementById('finale-popup')!.style.display = 'block';
    }
}

// Start game
new Game();
