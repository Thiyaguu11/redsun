import * as THREE from 'three';

export class Stickman {
    public mesh: THREE.Group;
    public mixer!: THREE.AnimationMixer;

    // Body parts
    private head!: THREE.Mesh;
    private torso!: THREE.Mesh;
    private leftArm!: THREE.Group;
    private rightArm!: THREE.Group;
    private leftLeg!: THREE.Mesh;
    private rightLeg!: THREE.Mesh;

    private isPlayer: boolean;

    constructor(isPlayer: boolean = false) {
        this.isPlayer = isPlayer;
        this.mesh = new THREE.Group();
        this.buildModel();
    }

    private buildModel() {
        const material = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.8,
        });

        // Head
        const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
        this.head = new THREE.Mesh(headGeo, material);
        this.head.position.y = 1.8;
        this.mesh.add(this.head);

        // Torso
        const torsoGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        this.torso = new THREE.Mesh(torsoGeo, material);
        this.torso.position.y = 1.0;
        this.mesh.add(this.torso);

        // Arms
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);

        // Left Arm Group (for rotation from shoulder)
        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.2, 1.4, 0); // Shoulder
        const leftArmMesh = new THREE.Mesh(armGeo, material);
        leftArmMesh.position.y = -0.4; // Down from shoulder
        this.leftArm.add(leftArmMesh);

        // Right Arm Group
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.2, 1.4, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, material);
        rightArmMesh.position.y = -0.4;
        this.rightArm.add(rightArmMesh);

        this.mesh.add(this.leftArm);
        this.mesh.add(this.rightArm);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.08, 0.05, 1, 8);
        this.leftLeg = new THREE.Mesh(legGeo, material);
        this.leftLeg.position.set(-0.15, 0.5, 0);
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, material);
        this.rightLeg.position.set(0.15, 0.5, 0);
        this.mesh.add(this.rightLeg);

        // Attach Swords
        this.attachSwords();
    }

    private attachSwords() {
        let swordGeo: THREE.BoxGeometry;
        let swordMat: THREE.Material;

        if (this.isPlayer) {
            // Made swords larger for player
            swordGeo = new THREE.BoxGeometry(0.1, 1.8, 0.2);
            swordMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        } else {
            // Smaller swords for enemies (use basic material so it ignores red lighting and stays bright yellow)
            swordGeo = new THREE.BoxGeometry(0.05, 0.8, 0.1);
            swordMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        }

        const leftSword = new THREE.Mesh(swordGeo, swordMat);
        leftSword.position.set(0, -0.8, 0.2);
        leftSword.rotation.x = Math.PI / 2;
        this.leftArm.add(leftSword);

        const rightSword = new THREE.Mesh(swordGeo, swordMat);
        rightSword.position.set(0, -0.8, 0.2);
        rightSword.rotation.x = Math.PI / 2;
        this.rightArm.add(rightSword);

        if (this.isPlayer) {
            // Use a curved ring rather than a thick rectangle to look like a slim sword slash
            const slashGeo = new THREE.RingGeometry(3.5, 4.0, 32, 1, 0, Math.PI / 1.5);
            // Center the arc
            slashGeo.translate(0, -3.5, 0);

            const slashMat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            this.heavySlashMesh = new THREE.Mesh(slashGeo, slashMat);
            // Position slightly in front of the player
            this.heavySlashMesh.position.set(0, 1, -1);
            this.heavySlashMesh.rotation.x = -Math.PI / 2;
            this.heavySlashMesh.visible = false;
            this.mesh.add(this.heavySlashMesh);
        }
    }

    public swingSwords() {
        // Simple rotation animation for arms
        // We'll perform rotation in the main animate loop using a simple state or tween
        // By exposing a property
        (this as any).isSwinging = true;
        (this as any).swingProgress = 0;
    }

    public get isAttacking(): boolean {
        return !!(this as any).isSwinging;
    }

    public updateAnimation(delta: number) {
        if (this.isDead) {
            this.deathProgress += delta;
            this.brokenParts.forEach(p => {
                p.vel.y -= 25.0 * delta; // Add gravity
                p.obj.position.addScaledVector(p.vel, delta);
                p.obj.rotation.x += p.rot.x * delta;
                p.obj.rotation.y += p.rot.y * delta;
                p.obj.rotation.z += p.rot.z * delta;

                // Simple floor collision for parts
                if (p.obj.position.y < 0.1) {
                    p.obj.position.y = 0.1;
                    p.vel.set(0, 0, 0); // Stop moving
                    p.rot.set(0, 0, 0); // Stop rotating
                }
            });
            return;
        }

        if ((this as any).isSwinging) {
            (this as any).swingProgress += delta * 15; // Fast swing speed
            const prog = (this as any).swingProgress;

            // Arc formula: sin(PI * prog) goes 0 -> 1 -> 0
            if (prog > Math.PI) {
                (this as any).isSwinging = false;
                this.leftArm.rotation.x = 0;
                this.rightArm.rotation.x = 0;
            } else {
                const angle = Math.sin(prog);
                this.leftArm.rotation.x = -angle * 2.5; // Swing forward
                this.rightArm.rotation.x = -angle * 2.5;
            }
        }

        // No cape to animate anymore
        // Heavy attack visual integration
        if (this.isPlayer && (this as any).isHeavySwinging) {
            (this as any).heavyProgress += delta * 5; // swing speed
            const prog = (this as any).heavyProgress;
            if (prog > Math.PI) {
                (this as any).isHeavySwinging = false;
                if (this.heavySlashMesh) this.heavySlashMesh.visible = false;
            } else {
                if (this.heavySlashMesh) {
                    this.heavySlashMesh.visible = true;
                    this.heavySlashMesh.rotation.y = -prog * 2; // sweep around
                    this.heavySlashMesh.scale.setScalar(1.0 + Math.sin(prog) * 2.0);
                    (this.heavySlashMesh.material as THREE.Material).opacity = 1.0 - (prog / Math.PI);
                }
            }
        }
    }

    public isDead: boolean = false;
    public deathProgress: number = 0;
    public hp: number = 100;
    public attackCooldown: number = 0;
    public heavyCooldown: number = 0;
    private brokenParts: { obj: THREE.Object3D, vel: THREE.Vector3, rot: THREE.Vector3 }[] = [];
    private heavySlashMesh!: THREE.Mesh;

    public performHeavyAttack() {
        if (this.heavyCooldown > 0) return;
        (this as any).isHeavySwinging = true;
        (this as any).heavyProgress = 0;
        this.heavyCooldown = 5.0; // 5 seconds
    }

    public die() {
        if (this.isDead) return;
        this.isDead = true;
        (this as any).isSwinging = false;

        // Separate body parts and give them initial velocity
        this.brokenParts = [this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].map(p => ({
            obj: p,
            vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8 + 4, (Math.random() - 0.5) * 8),
            rot: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10)
        }));
    }

    public rebuild() {
        this.isDead = false;
        this.deathProgress = 0;
        this.hp = 100;
        this.attackCooldown = 0;
        this.heavyCooldown = 0;

        // Re-attach body parts to their exact original relative positions
        this.head.position.set(0, 1.8, 0);
        this.head.rotation.set(0, 0, 0);
        this.mesh.add(this.head);

        this.torso.position.set(0, 1.0, 0);
        this.torso.rotation.set(0, 0, 0);
        this.mesh.add(this.torso);

        this.leftArm.position.set(-0.2, 1.4, 0);
        this.leftArm.rotation.set(0, 0, 0);
        this.mesh.add(this.leftArm);

        this.rightArm.position.set(0.2, 1.4, 0);
        this.rightArm.rotation.set(0, 0, 0);
        this.mesh.add(this.rightArm);

        this.leftLeg.position.set(-0.15, 0.5, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.mesh.add(this.leftLeg);

        this.rightLeg.position.set(0.15, 0.5, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.mesh.add(this.rightLeg);

        this.brokenParts = [];
    }
}
