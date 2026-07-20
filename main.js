// --- 1. إعداد المشهد الأساسي ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-10, 20, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 2. إعداد الأرضية ---
const textureLoader = new THREE.TextureLoader();
textureLoader.load('./assets/ground.png', (groundTexture) => {
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(50, 50);
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}, undefined, (err) => {
    document.getElementById('error-log').innerHTML += "خطأ تحميل الأرضية: ground.png<br>";
});

// --- 3. متغيرات اللاعب والانميشن والتحكم ---
let playerModel, mixer;
const actions = {};
let currentAction = 'idle_20';
const clock = new THREE.Clock();

const playerSettings = {
    walkSpeed: 3.5,
    runSpeed: 7.0,
    rotationSpeed: 12.0
};

const joystickData = { active: false, x: 0, y: 0, distance: 0 };

const joystickZone = document.getElementById('joystick-zone');
const joystickManager = nipplejs.create({
    zone: joystickZone,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 100
});

joystickManager.on('move', (evt, data) => {
    joystickData.active = true;
    joystickData.x = data.vector.x;
    joystickData.y = data.vector.y;
    joystickData.distance = data.distance; 
});

joystickManager.on('end', () => {
    joystickData.active = false;
    joystickData.x = 0;
    joystickData.y = 0;
    joystickData.distance = 0;
});

// --- 4. دالة تحميل المجسم (GLTFLoader مضمن داخل السيرفر العام أو باستخدام كود مدمج) ---
// سنقوم بتحميل الـ GLTFLoader مباشرة عبر سكربت لضمان عدم وجود أخطاء مسارات
const loaderScript = document.createElement('script');
loaderScript.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
loaderScript.onload = () => {
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load('./assets/player.glb', (gltf) => {
        playerModel = gltf.scene;
        playerModel.traverse((child) => {
            if (child.isMesh) child.castShadow = true;
        });
        
        playerModel.scale.set(1, 1, 1); 
        scene.add(playerModel);

        mixer = new THREE.AnimationMixer(playerModel);
        
        gltf.animations.forEach((clip) => {
            if (clip.name === 'idle_20' || clip.name === 'walk_34' || clip.name === 'run_32') {
                actions[clip.name] = mixer.clipAction(clip);
            }
        });

        if(actions['idle_20']) actions['idle_20'].play();
        
        // إخفاء صندوق الأخطاء فور نجاح التحميل
        document.getElementById('error-log').style.display = 'none';
    }, undefined, (error) => {
        document.getElementById('error-log').innerHTML += "فشل تحميل player.glb تأكد من وجوده.<br>";
    });
};
document.head.appendChild(loaderScript);

// --- 5. نظام الكاميرا (OrbitControls) ---
const controlsScript = document.createElement('script');
controlsScript.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
controlsScript.onload = () => {
    window.controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.minDistance = 3.5;
    controls.maxDistance = 5.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
};
document.head.appendChild(controlsScript);

camera.position.set(0, 2, -5);

function fadeToAction(name, duration = 0.2) {
    if (currentAction === name || !actions[name]) return;
    const prev = actions[currentAction];
    const next = actions[name];
    
    if (prev) prev.fadeOut(duration);
    next.reset().fadeIn(duration).play();
    currentAction = name;
}

// --- 6. حلقة التحديث (Game Loop) ---
const moveVector = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (playerModel) {
        if (joystickData.active) {
            const isRunning = joystickData.distance > 30;
            const currentSpeed = isRunning ? playerSettings.runSpeed : playerSettings.walkSpeed;
            
            fadeToAction(isRunning ? 'run_32' : 'walk_34', 0.2);

            camera.getWorldDirection(forwardVector);
            forwardVector.y = 0;
            forwardVector.normalize();

            rightVector.crossVectors(camera.up, forwardVector).normalize();

            moveVector.set(0, 0, 0);
            moveVector.addScaledVector(forwardVector, joystickData.y);
            moveVector.addScaledVector(rightVector, -joystickData.x);

            if (moveVector.lengthSq() > 0.01) {
                moveVector.normalize();

                const targetRotation = Math.atan2(moveVector.x, moveVector.z);
                let angleDiff = targetRotation - playerModel.rotation.y;
                angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
                playerModel.rotation.y += angleDiff * playerSettings.rotationSpeed * delta;

                playerModel.position.addScaledVector(moveVector, currentSpeed * delta);
            }
        } else {
            fadeToAction('idle_20', 0.2);
        }

        if (mixer) mixer.update(delta);

        const targetPos = playerModel.position.clone();
        targetPos.y += 1.2; 
        if (window.controls) {
            window.controls.target.lerp(targetPos, 0.1);
        }
    }

    if (window.controls) window.controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
