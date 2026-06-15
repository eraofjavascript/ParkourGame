import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';

export const level2Config = {
  levelNumber: 2,
  playerSpeed: 95,
  airControl: 18,
  gravity: 25,
  ballLimit: 3,
  useBalls: true,
  mapScale: { x: 4.5, y: 4.5, z: 4.5 },
  mapPosition: { x: 0, y: -13, z: 0 },
  hdrPath: './skybox/skybox.hdr',
  playerLookAt: { rotationY: 0, rotationX: 0 },
  starMechanics: { star1Time: 180, star2Time: 90, deathLimit: 5 },
  missions: [
    { description: 'Complete under 3min', target: '180s', type: 'time' },
    { description: 'Complete under 1.5min', target: '90s', type: 'time' },
    { description: 'Die less than 5 times', target: '<5 deaths', type: 'deaths' }
  ],
  bestTimeTarget: 75
};

function createCheckpointLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = 'bold 54px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let g = 24; g >= 4; g -= 4) {
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = g;
    ctx.fillStyle = `rgba(0, 255, 136, ${0.15 + (24 - g) * 0.035})`;
    ctx.fillText('CHECKPOINT', 256, 48);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00ff88';
  ctx.fillText('CHECKPOINT', 256, 48);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.5, 1.05, 1);
  return sprite;
}

export function loadLevel(scene, worldOctree, onProgress) {
  return new Promise((resolve, reject) => {
    let gltfLoaded = false;
    let hdrLoaded = false;

    const checkComplete = () => {
      if (gltfLoaded && hdrLoaded) resolve({ completionPlatform, checkpoints, killBricks });
    };

    // ── GLB ──────────────────────────────────────────────────────────────────
    const gltfLoader = new GLTFLoader().setPath('./models/gltf/');
    gltfLoader.load('level-2.glb',
      (gltf) => {
        gltf.scene.scale.set(level2Config.mapScale.x, level2Config.mapScale.y, level2Config.mapScale.z);
        gltf.scene.position.set(level2Config.mapPosition.x, level2Config.mapPosition.y, level2Config.mapPosition.z);
        scene.add(gltf.scene);
        worldOctree.fromGraphNode(gltf.scene);
        gltf.scene.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = new THREE.MeshStandardMaterial({
              map: child.material.map || null,
              color: child.material.color,
              roughness: 0.015,
              metalness: 0.6,
            });
            if (child.material.map) child.material.map.anisotropy = 4;
          }
        });
        const helper = new OctreeHelper(worldOctree);
        helper.visible = false;
        scene.add(helper);
        gltfLoaded = true;
        if (onProgress) onProgress(0.5);
        checkComplete();
      },
      (xhr) => { if (onProgress && xhr.lengthComputable) onProgress((xhr.loaded / xhr.total) * 0.5); },
      (error) => reject(error)
    );

    // ── Completion Platform ───────────────────────────────────────────────────
    const platformGeo = new THREE.BoxGeometry(3.55, 0.3, 3.55);
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const cx = cv.getContext('2d');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      cx.fillStyle = (x + y) % 2 === 0 ? '#000000' : '#ffffff';
      cx.fillRect(x * 16, y * 16, 16, 16);
    }
    const checkTex = new THREE.CanvasTexture(cv);
    checkTex.wrapS = THREE.RepeatWrapping;
    checkTex.wrapT = THREE.RepeatWrapping;

    const completionPlatform = new THREE.Mesh(platformGeo, new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.3, metalness: 0.1 }));
    completionPlatform.position.set(-23.3, -13.4, 50.25);
    completionPlatform.castShadow = true;
    completionPlatform.receiveShadow = true;
    completionPlatform.userData.isCompletionPlatform = true;
    scene.add(completionPlatform);

    // ── Checkpoints ───────────────────────────────────────────────────────────
    const cpPositions = [
      new THREE.Vector3(-23.3, -13, 0.17),
      new THREE.Vector3(-23.3, -13, 25.5)
    ];

    const checkpoints = cpPositions.map((pos) => {
      const geo = new THREE.BoxGeometry(3.55, 0.3, 3.55);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      mesh.position.copy(pos);
      mesh.userData.isCheckpointBlock = true;

      const label = createCheckpointLabel();
      label.position.set(0, 2.2, 0);
      mesh.add(label);

      scene.add(mesh);
      return { mesh, label };
    });

    // ── Kill Bricks ───────────────────────────────────────────────────────────
    // Using BoxGeometry(1,1,1) + scale so debug panel can resize live
    const kbBaseGeo = new THREE.BoxGeometry(1, 1, 1);
    const kbInitSize = new THREE.Vector3(3.55, 0.71, 0.71);

    const kbDefaultPositions = [
      new THREE.Vector3(0, -12, 0),
      new THREE.Vector3(-10, -12, 12),
      new THREE.Vector3(-18, -12, 26),
      new THREE.Vector3(-23.3, -12, 40)
    ];

    const killBricks = kbDefaultPositions.map((pos) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff3300,
        emissive: 0xff2200,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(kbBaseGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.copy(kbInitSize);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isKillBrick = true;
      scene.add(mesh);
      return { mesh, initSize: kbInitSize.clone() };
    });

    // ── HDR ───────────────────────────────────────────────────────────────────
    new RGBELoader().load(level2Config.hdrPath,
      (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = hdr;
        scene.environment = hdr;
        hdrLoaded = true;
        if (onProgress) onProgress(1.0);
        checkComplete();
      },
      (xhr) => { if (onProgress && xhr.lengthComputable) onProgress(0.5 + (xhr.loaded / xhr.total) * 0.5); },
      (error) => reject(error)
    );
  });
}

export function loadPlayerModel(scene, playerMixer, onProgress) {
  return new Promise((resolve) => {
    if (onProgress) onProgress(1.0);
    resolve(null);
  });
}
