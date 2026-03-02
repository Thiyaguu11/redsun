import * as THREE from 'three';

export class AngelStickman {
    public mesh: THREE.Group;

    // Body parts
    private head!: THREE.Mesh;
    private torso!: THREE.Mesh;
    private leftArm!: THREE.Group;
    private rightArm!: THREE.Group;
    private leftLeg!: THREE.Mesh;
    private rightLeg!: THREE.Mesh;

    // Wings
    private leftWing!: THREE.Mesh;
    private rightWing!: THREE.Mesh;

    // Shield
    private shieldMesh!: THREE.Mesh;

    private isPlayer: boolean;

    public isDead: boolean = false;
    public deathProgress: number = 0;
    public hp: number = 100;
    public shieldActive: boolean = false;
    public shieldCooldown: number = 0;

    private brokenParts: { obj: THREE.Object3D, vel: THREE.Vector3, rot: THREE.Vector3 }[] = [];

    // Animation progress
    private flapProgress: number = 0;

    constructor(isPlayer: boolean = false) {
        this.isPlayer = isPlayer;
        this.mesh = new THREE.Group();
        this.buildModel();
    }

    private buildModel() {
        // Player is golden, Enemy is red
        const color = this.isPlayer ? 0xffcc00 : 0xff0000;

        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            roughness: 0.2,
        });

        // Head
        const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
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

        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.2, 1.4, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, material);
        leftArmMesh.position.y = -0.4;
        this.leftArm.add(leftArmMesh);

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

        // Wings
        // Use a flat 3-sided cone to simulate a pointed, sweeping angel wing
        const wingGeo = new THREE.ConeGeometry(0.8, 2.5, 4);
        wingGeo.rotateZ(-Math.PI / 2); // Point it outward along +X
        // Offset geometry so it rotates from the base
        wingGeo.translate(1.25, 0, 0);

        const wingColor = this.isPlayer ? 0xffffff : 0xff0000;
        const wingMat = new THREE.MeshBasicMaterial({ color: wingColor, transparent: true, opacity: 0.9 });

        this.leftWing = new THREE.Mesh(wingGeo, wingMat);
        this.leftWing.position.set(-0.1, 1.3, -0.2);
        this.leftWing.rotation.set(0.3, Math.PI - 0.5, -0.2); // Swept back and angled
        this.mesh.add(this.leftWing);

        this.rightWing = new THREE.Mesh(wingGeo, wingMat);
        this.rightWing.position.set(0.1, 1.3, -0.2);
        this.rightWing.rotation.set(0.3, 0.5, 0.2);
        this.mesh.add(this.rightWing);

        // Shield Bubble (Player only)
        if (this.isPlayer) {
            const shieldGeo = new THREE.SphereGeometry(2.5, 32, 32);
            const shieldMat = new THREE.MeshBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
            this.shieldMesh.position.y = 1.0;
            this.shieldMesh.visible = false;
            this.mesh.add(this.shieldMesh);
        }
    }

    public updateAnimation(delta: number, isMoving: boolean) {
        if (this.isDead) {
            this.deathProgress += delta;
            this.brokenParts.forEach(p => {
                p.vel.y -= 15.0 * delta; // Gravity
                p.obj.position.addScaledVector(p.vel, delta);
                p.obj.rotation.x += p.rot.x * delta;
                p.obj.rotation.y += p.rot.y * delta;
                p.obj.rotation.z += p.rot.z * delta;
            });
            return;
        }

        // Flap wings
        const flapSpeed = isMoving ? 15 : 5;
        this.flapProgress += delta * flapSpeed;
        const flapAngle = Math.sin(this.flapProgress) * 0.5;
        // Flap around the Z axis (up and down) and slightly around Y (forward and back)
        this.leftWing.rotation.z = -0.2 - flapAngle;
        this.leftWing.rotation.y = Math.PI - 0.5 + (flapAngle * 0.5);

        this.rightWing.rotation.z = 0.2 + flapAngle;
        this.rightWing.rotation.y = 0.5 - (flapAngle * 0.5);

        // Bob up and down naturally
        this.mesh.position.y += Math.sin(this.flapProgress) * 0.005;

        // Limbs when moving
        if (isMoving) {
            this.leftLeg.rotation.x = Math.sin(this.flapProgress) * 0.5;
            this.rightLeg.rotation.x = -Math.sin(this.flapProgress) * 0.5;
            this.leftArm.rotation.x = -Math.sin(this.flapProgress) * 0.5;
            this.rightArm.rotation.x = Math.sin(this.flapProgress) * 0.5;
        } else {
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
            this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
            this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
            this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
        }
    }

    public activateShield() {
        if (!this.isPlayer || this.shieldCooldown > 0) return;
        this.shieldActive = true;
        this.shieldMesh.visible = true;
        this.shieldCooldown = 5.0; // 5 seconds reset/cooldown

        // Deactivate after 2 seconds
        setTimeout(() => {
            if (!this.isDead) {
                this.shieldActive = false;
                this.shieldMesh.visible = false;
            }
        }, 2000);
    }

    public die() {
        if (this.isDead) return;
        this.isDead = true;
        if (this.shieldMesh) this.shieldMesh.visible = false;

        // Break apart
        this.brokenParts = [this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.leftWing, this.rightWing].map(p => ({
            obj: p,
            vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8 + 4, (Math.random() - 0.5) * 8),
            rot: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10)
        }));
    }

    public rebuild() {
        this.isDead = false;
        this.deathProgress = 0;
        this.hp = 100;
        this.shieldActive = false;
        this.shieldCooldown = 0;
        if (this.shieldMesh) this.shieldMesh.visible = false;

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

        this.leftWing.position.set(-0.1, 1.3, -0.2);
        this.leftWing.rotation.set(0.3, Math.PI - 0.5, -0.2);
        this.mesh.add(this.leftWing);

        this.rightWing.position.set(0.1, 1.3, -0.2);
        this.rightWing.rotation.set(0.3, 0.5, 0.2);
        this.mesh.add(this.rightWing);

        this.brokenParts = [];
    }
}
