import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- 1. إعداد المشهد الأساسي ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

// الكاميرا
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// الرندر (مُحسن للأداء العالي للموبايل و 90FPS)
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // لتخفيف الضغط على معالجات الهواتف مع الحفاظ على الدقة
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// الإضاءة
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-10, 20, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 2. إعداد الأرضية ---
const textureLoader = new THREE.TextureLoader();
const groundTexture = textureLoader.load('assets/ground.png');
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(50, 50);

const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- 3. متغيرات اللاعب والأنميشن والأنالوك ---
let playerModel, mixer;
const actions = {};
let currentAction = 'idle_20';
const clock = new THREE.Clock();

const playerSettings = {
    walkSpeed: 3.5,
    runSpeed: 7.0,
    rotationSpeed: 12.0 // سرعة دوران اللاعب مع الأنالوك
};

// متغيرات لالتقاط حركة الأنالوك
const joystickData = {
    active: false,
    x: 0,
    y: 0,
    distance: 0 // لمعرفة هل هو مشي أم ركض
};

// --- 4. إعداد الأنالوك (Joystick) للموبايل ---
const joystickZone = document.getElementById('joystick-zone');
const joystickManager = nipplejs.create({
    zone: joystickZone,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 100
});

// قراءة تفاعل اللاعب مع الأنالوك
joystickManager.on('move', (evt, data) => {
    joystickData.active = true;
    joystickData.x = data.vector.x; // يمين ويسار
    joystickData.y = data.vector.y; // أعلى وأسفل
    joystickData.distance = data.distance; 
});

joystickManager.on('end', () => {
    joystickData.active = false;
    joystickData.x = 0;
    joystickData.y = 0;
    joystickData.distance = 0;
});

// --- 5. تحميل اللاعب والانميشنات ---
const gltfLoader = new GLTFLoader();
gltfLoader.load('assets/player.glb', (gltf) => {
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
});

// --- 6. نظام الكاميرا (دوران باللمس من النصف الأيمن) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false; // منع التقريب باللمس لتبقى كببجي
controls.enableDamping = true; 
controls.dampingFactor = 0.05;
controls.minDistance = 3.5;
controls.maxDistance = 5.0;
controls.maxPolarAngle = Math.PI / 2 - 0.1; // منع الكاميرا من اختراق الأرض

camera.position.set(0, 2, -5);

// دالة الانتقال بين الانميشنات
function fadeToAction(name, duration = 0.2) {
    if (currentAction === name || !actions[name]) return;
    const prev = actions[currentAction];
    const next = actions[name];
    
    if (prev) prev.fadeOut(duration);
    next.reset().fadeIn(duration).play();
    currentAction = name;
}

// --- 7. حلقة التحديث (Game Loop) ---
const moveVector = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // حساب الزمن لضمان 90 فريم بسلاسة

    if (playerModel) {
        if (joystickData.active) {
            // تحديد هل اللاعب يمشي أم يركض (حسب مسافة سحب الأنالوك)
            // أقصى مسافة للأنالوك هي 50 عادةً، إذا سحب أكثر من 30 يعتبر ركض
            const isRunning = joystickData.distance > 30;
            const currentSpeed = isRunning ? playerSettings.runSpeed : playerSettings.walkSpeed;
            
            fadeToAction(isRunning ? 'run_32' : 'walk_34', 0.2);

            // استخراج اتجاه الكاميرا رياضياً
            camera.getWorldDirection(forwardVector);
            forwardVector.y = 0;
            forwardVector.normalize();

            // استخراج يمين الكاميرا رياضياً
            rightVector.crossVectors(camera.up, forwardVector).normalize();

            // حساب اتجاه الحركة بناءً على الكاميرا والأنالوك
            // ملاحظة: nipplejs تعطي Y موجب عند السحب للأعلى، و X موجب لليمين
            moveVector.set(0, 0, 0);
            moveVector.addScaledVector(forwardVector, joystickData.y); // للأمام والخلف
            moveVector.addScaledVector(rightVector, -joystickData.x);   // لليمين واليسار

            if (moveVector.lengthSq() > 0.01) {
                moveVector.normalize();

                // تدوير اللاعب لجهة حركته بنعومة
                const targetRotation = Math.atan2(moveVector.x, moveVector.z);
                let angleDiff = targetRotation - playerModel.rotation.y;
                angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
                playerModel.rotation.y += angleDiff * playerSettings.rotationSpeed * delta;

                // تحريك مكان اللاعب
                playerModel.position.addScaledVector(moveVector, currentSpeed * delta);
            }
        } else {
            fadeToAction('idle_20', 0.2);
        }

        // تحديث إطار الانميشن
        if (mixer) mixer.update(delta);

        // جعل الكاميرا تتبع اللاعب دائماً بنعومة
        const targetPos = playerModel.position.clone();
        targetPos.y += 1.2; // التركيز على كتف/ظهر اللاعب
        controls.target.lerp(targetPos, 0.1);
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

// التعامل مع تغيير حجم أو دوران الشاشة في الموبايل
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
