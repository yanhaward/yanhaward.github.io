/**
 * URDF Viewer - Real-time 3D visualization of URDF-based robotic arms
 * Uses Three.js to render the robot model and update joint states
 */

(function () {
    'use strict';

    // ========== Configuration ==========
    const CONFIG = {
        urdfPath: '/y1_dual/y1_dual.urdf',
        meshPath: '/y1_dual/meshes/',  // Fixed: actual mesh files are in meshes/
        containerSelector: '#replayviewerUrdfContainer',
        initialCameraSettings: {
            position: [0.5, 0.4, 0.6],
            lookAt: [0, 0, 0.3],
            fov: 50,
        },
    };

    // ========== Global State ==========
    let scene, camera, renderer;
    let robotGroup, linkMeshes = {}, joints = {}, jointLimits = {};
    let initialized = false;
    let currentJointValues = {};
    let urdfData = null;
    let animationFrameId = null;
    
    // Mouse control state
    let mouseControl = {
        isDragging: false,
        previousMousePosition: { x: 0, y: 0 },
        rotation: { x: 0, y: 0 },
    };
    
    // Playback state
    let playbackState = {
        isPaused: false,
        recordedFrames: [],
        currentFrameIndex: 0,
    };
    
    // UI state
    let uiPanel = null;

    // ========== Check THREE.js availability ==========
    function checkThreeJs() {
        if (typeof THREE === 'undefined') {
            console.error('[URDF Viewer] Three.js is not loaded');
            return false;
        }
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('[URDF Viewer] Three.js GLTFLoader is not loaded, attempting lazy load...');
            // Try to load GLTFLoader if Three.js is available but loaders aren't
            return true; // Still allow init, we'll try to load loaders dynamically
        }
        return true;
    }

    function loadThreeJsLibraries() {
        return new Promise((resolve) => {
            const threeUrls = [
                'https://cdn.bootcdn.net/npm/three@r128/build/three.min.js',
                'https://cdn.jsdelivr.net/npm/three@r128/build/three.min.js',
                'https://unpkg.com/three@r128/build/three.min.js',
            ];
            const gltfUrls = [
                'https://cdn.bootcdn.net/npm/three@r128/examples/js/loaders/GLTFLoader.js',
                'https://cdn.jsdelivr.net/npm/three@r128/examples/js/loaders/GLTFLoader.js',
                'https://unpkg.com/three@r128/examples/js/loaders/GLTFLoader.js',
            ];
            const colladaUrls = [
                'https://cdn.bootcdn.net/npm/three@r128/examples/js/loaders/ColladaLoader.js',
                'https://cdn.jsdelivr.net/npm/three@r128/examples/js/loaders/ColladaLoader.js',
                'https://unpkg.com/three@r128/examples/js/loaders/ColladaLoader.js',
            ];

            const loadScriptFromList = (urls, label, done) => {
                let i = 0;
                const tryNext = () => {
                    if (i >= urls.length) {
                        done(false);
                        return;
                    }
                    const url = urls[i++];
                    const script = document.createElement('script');
                    script.src = url;
                    script.async = true;
                    script.crossOrigin = 'anonymous';
                    script.onload = () => {
                        console.log(`[URDF Viewer] ${label} loaded from: ${url}`);
                        done(true);
                    };
                    script.onerror = () => {
                        console.warn(`[URDF Viewer] Failed to load ${label} from: ${url}`);
                        tryNext();
                    };
                    document.head.appendChild(script);
                };
                tryNext();
            };

            const ensureColladaLoader = () => {
                if (typeof THREE.ColladaLoader !== 'undefined') {
                    resolve(true);
                    return;
                }
                loadScriptFromList(colladaUrls, 'ColladaLoader', (ok) => {
                    if (!ok) {
                        console.warn('[URDF Viewer] ColladaLoader is unavailable; .dae meshes may fail');
                    }
                    resolve(true);
                });
            };

            const ensureGltfLoader = () => {
                if (typeof THREE.GLTFLoader !== 'undefined') {
                    ensureColladaLoader();
                    return;
                }
                loadScriptFromList(gltfUrls, 'GLTFLoader', (ok) => {
                    if (!ok) {
                        console.error('[URDF Viewer] Failed to load GLTFLoader from all sources');
                        resolve(false);
                        return;
                    }
                    ensureColladaLoader();
                });
            };

            const ensureThree = () => {
                if (typeof THREE !== 'undefined') {
                    ensureGltfLoader();
                    return;
                }
                loadScriptFromList(threeUrls, 'Three.js', (ok) => {
                    if (!ok) {
                        console.error('[URDF Viewer] Failed to load Three.js from all sources');
                        resolve(false);
                        return;
                    }
                    ensureGltfLoader();
                });
            };

            ensureThree();
        });
    }

    // ========== Initialization ==========
    function initThreeJs(container) {
        if (initialized) return;
        
        if (!checkThreeJs()) {
            console.error('[URDF Viewer] Cannot initialize without Three.js');
            return;
        }

        console.log('[URDF Viewer] Initializing Three.js...');

        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        scene.fog = new THREE.Fog(0x1a1a1a, 2, 8);

        // Setup camera
        camera = new THREE.PerspectiveCamera(
            CONFIG.initialCameraSettings.fov,
            container.clientWidth / container.clientHeight,
            0.01,
            100
        );
        camera.position.set(...CONFIG.initialCameraSettings.position);
        camera.lookAt(...CONFIG.initialCameraSettings.lookAt);

        // Setup renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }
        container.appendChild(renderer.domElement);

        console.log('[URDF Viewer] Renderer created:', renderer.getSize());

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1.5, 1);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -2;
        directionalLight.shadow.camera.right = 2;
        directionalLight.shadow.camera.top = 2;
        directionalLight.shadow.camera.bottom = -2;
        scene.add(directionalLight);

        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(2, 2);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        scene.add(ground);

        // Robot group
        robotGroup = new THREE.Group();
        robotGroup.castShadow = true;
        robotGroup.receiveShadow = true;
        scene.add(robotGroup);

        // Setup mouse control
        setupMouseControl(renderer.domElement);

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Setup UI panel
        setupUiPanel(container);

        initialized = true;
        console.log('[URDF Viewer] Three.js initialization complete');
    }

    function onWindowResize() {
        if (!initialized) return;
        const container = document.querySelector(CONFIG.containerSelector);
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function fitCameraToRobot() {
        if (!robotGroup || !camera) return;
        const box = new THREE.Box3().setFromObject(robotGroup);
        if (box.isEmpty()) {
            console.warn('[URDF Viewer] Robot bounding box is empty; skip camera fit');
            return;
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.2);
        const fov = (camera.fov * Math.PI) / 180;
        const distance = maxDim / Math.tan(fov / 2) * 1.4;

        camera.position.set(center.x + distance * 0.8, center.y + distance * 0.5, center.z + distance * 0.9);
        camera.near = 0.01;
        camera.far = Math.max(100, distance * 8);
        camera.updateProjectionMatrix();
        camera.lookAt(center);

        console.log('[URDF Viewer] Camera fitted to robot. Center:', center, 'Size:', size);
    }

    // ========== Mouse Control ==========
    function setupMouseControl(canvas) {
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('dblclick', onDoubleClick);
    }

    function onMouseDown(e) {
        mouseControl.isDragging = true;
        mouseControl.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e) {
        if (!mouseControl.isDragging || !robotGroup) return;

        const deltaX = e.clientX - mouseControl.previousMousePosition.x;
        const deltaY = e.clientY - mouseControl.previousMousePosition.y;

        mouseControl.rotation.y += deltaX * 0.01;
        mouseControl.rotation.x += deltaY * 0.01;

        // Clamp X rotation
        mouseControl.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseControl.rotation.x));

        // Apply rotation to robot group
        const qx = new THREE.Quaternion();
        qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouseControl.rotation.y);
        const qy = new THREE.Quaternion();
        qy.setFromAxisAngle(new THREE.Vector3(1, 0, 0), mouseControl.rotation.x);
        robotGroup.quaternion.multiplyQuaternions(qx, qy);

        mouseControl.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    function onMouseUp() {
        mouseControl.isDragging = false;
    }

    function onDoubleClick() {
        // Toggle pause
        playbackState.isPaused = !playbackState.isPaused;
        updateUiPanel();
        console.log('[URDF Viewer] Playback ' + (playbackState.isPaused ? 'paused' : 'resumed'));
    }

    // ========== UI Panel ==========
    function setupUiPanel(container) {
        uiPanel = document.createElement('div');
        uiPanel.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: monospace;
            max-width: 280px;
            border: 1px solid #444;
            z-index: 100;
        `;
        uiPanel.id = 'urdfViewerPanel';
        container.appendChild(uiPanel);
        updateUiPanel();
    }

    function updateUiPanel() {
        if (!uiPanel) return;
        let html = `<div style="margin-bottom: 8px; font-weight: bold;">🤖 Robot State</div>`;
        
        html += `<div style="margin-bottom: 6px;">
            <div>Status: <span style="color: ${playbackState.isPaused ? '#ff6b6b' : '#51cf66'};">
                ${playbackState.isPaused ? 'PAUSED' : 'PLAYING'}
            </span></div>
        </div>`;
        
        html += `<div style="margin-bottom: 6px;">
            <div style="color: #888; margin-bottom: 4px;">Joint Angles (rad):</div>`;
        
        // Show left arm joints
        const joints = [
            { name: 'fl_joint1', label: 'J1' },
            { name: 'fl_joint2', label: 'J2' },
            { name: 'fl_joint3', label: 'J3' },
            { name: 'fl_joint4', label: 'J4' },
            { name: 'fl_joint5', label: 'J5' },
            { name: 'fl_joint6', label: 'J6' },
        ];
        
        joints.forEach(joint => {
            const value = currentJointValues[joint.name] || 0;
            html += `<div>${joint.label}: ${value.toFixed(3)}</div>`;
        });
        
        html += `</div>`;
        
        // Show gripper
        const gripperValue = currentJointValues['fl_joint7'] || 0;
        html += `<div style="color: #888; margin-bottom: 4px;">Gripper:</div>`;
        html += `<div>Position: ${gripperValue.toFixed(3)}</div>`;
        
        // Show frame info
        html += `<div style="margin-top: 8px; color: #888;">
            Frame: ${playbackState.currentFrameIndex + 1} / ${playbackState.recordedFrames.length}
        </div>`;
        
        // Show controls
        html += `<div style="margin-top: 8px; font-size: 11px; color: #aaa;">
            <div>📌 Drag to rotate</div>
            <div>⏸️  Double-click to pause</div>
            <div>💾 Press 'E' to export</div>
        </div>`;
        
        uiPanel.innerHTML = html;
    }

    // ========== URDF Parsing ==========
    function parseUrdfXml(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            console.error('[URDF Viewer] XML Parse Error');
            return null;
        }

        const robotElem = xmlDoc.querySelector('robot');
        const robotName = robotElem ? robotElem.getAttribute('name') : 'robot';

        const links = {};
        const linkElems = xmlDoc.querySelectorAll('link');
        linkElems.forEach(linkElem => {
            const linkName = linkElem.getAttribute('name');
            const visualElems = linkElem.querySelectorAll('visual');
            const visuals = [];
            visualElems.forEach(visualElem => {
                const originElem = visualElem.querySelector('origin');
                const meshElem = visualElem.querySelector('geometry mesh');
                if (meshElem) {
                    const origin = parseOrigin(originElem);
                    const filename = meshElem.getAttribute('filename');
                    visuals.push({
                        origin: origin,
                        filename: filename,
                    });
                }
            });
            links[linkName] = { visuals: visuals };
        });

        const jointsList = [];
        const jointMap = {};
        const jointElems = xmlDoc.querySelectorAll('joint');
        jointElems.forEach(jointElem => {
            const jointName = jointElem.getAttribute('name');
            const jointType = jointElem.getAttribute('type');
            const parentElem = jointElem.querySelector('parent');
            const childElem = jointElem.querySelector('child');
            const originElem = jointElem.querySelector('origin');
            const axisElem = jointElem.querySelector('axis');
            const limitElem = jointElem.querySelector('limit');

            const joint = {
                name: jointName,
                type: jointType,
                parent: parentElem ? parentElem.getAttribute('link') : null,
                child: childElem ? childElem.getAttribute('link') : null,
                origin: parseOrigin(originElem),
                axis: axisElem
                    ? {
                          x: parseFloat(axisElem.getAttribute('xyz').split(' ')[0]) || 0,
                          y: parseFloat(axisElem.getAttribute('xyz').split(' ')[1]) || 0,
                          z: parseFloat(axisElem.getAttribute('xyz').split(' ')[2]) || 0,
                      }
                    : { x: 0, y: 0, z: 1 },
                limits: limitElem
                    ? {
                          lower: parseFloat(limitElem.getAttribute('lower')) || -Math.PI,
                          upper: parseFloat(limitElem.getAttribute('upper')) || Math.PI,
                      }
                    : { lower: -Math.PI, upper: Math.PI },
            };
            jointsList.push(joint);
            jointMap[jointName] = joint;
        });

        return {
            name: robotName,
            links: links,
            joints: jointsList,
            jointMap: jointMap,
        };
    }

    function parseOrigin(originElem) {
        const xyz = originElem ? (originElem.getAttribute('xyz') || '0 0 0').split(' ') : ['0', '0', '0'];
        const rpy = originElem ? (originElem.getAttribute('rpy') || '0 0 0').split(' ') : ['0', '0', '0'];
        return {
            position: [parseFloat(xyz[0]), parseFloat(xyz[1]), parseFloat(xyz[2])],
            rotation: [parseFloat(rpy[0]), parseFloat(rpy[1]), parseFloat(rpy[2])],
        };
    }

    // ========== Model Loading ==========
    async function loadUrdf(urdfPath) {
        try {
            console.log('[URDF Viewer] Loading URDF from:', urdfPath);
            const response = await fetch(urdfPath);
            if (!response.ok) {
                console.error(`[URDF Viewer] HTTP Error: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP ${response.status}`);
            }
            const urdfText = await response.text();
            console.log(`[URDF Viewer] URDF file loaded (${urdfText.length} bytes)`);
            
            urdfData = parseUrdfXml(urdfText);

            if (!urdfData) {
                console.error('[URDF Viewer] Failed to parse URDF - XML parsing error');
                return false;
            }

            console.log('[URDF Viewer] URDF parsed successfully:', urdfData.name);
            console.log('[URDF Viewer] Links found:', Object.keys(urdfData.links).length);
            console.log('[URDF Viewer] Joints found:', urdfData.joints.length);
            console.log('[URDF Viewer] Link names:', Object.keys(urdfData.links));
            return true;
        } catch (error) {
            console.error('[URDF Viewer] Failed to load URDF:', error.message);
            console.error('[URDF Viewer] Stack trace:', error.stack);
            return false;
        }
    }

    async function buildRobotModel() {
        if (!urdfData) {
            console.error('[URDF Viewer] Cannot build model: urdfData is null');
            return false;
        }

        console.log('[URDF Viewer] Building robot model...');
        console.log('[URDF Viewer] Mesh path:', CONFIG.meshPath);

        robotGroup.clear();
        linkMeshes = {};
        joints = {};
        jointLimits = {};

        // Build joint structure
        urdfData.joints.forEach(joint => {
            joints[joint.name] = {
                type: joint.type,
                parent: joint.parent,
                child: joint.child,
                origin: joint.origin,
                axis: joint.axis,
                angle: 0,
                distance: 0,
            };
            jointLimits[joint.name] = joint.limits;
            currentJointValues[joint.name] = 0;
        });
        console.log('[URDF Viewer] Joint structure built:', Object.keys(joints).length, 'joints');

        // Create link scene graph starting from base_link
        try {
            await createLinkHierarchy('base_link', robotGroup);
        } catch (error) {
            console.error('[URDF Viewer] Error during link hierarchy creation:', error);
            return false;
        }

        console.log('[URDF Viewer] ✅ Robot model built successfully');
        console.log('[URDF Viewer] Link meshes loaded:', Object.keys(linkMeshes).length);
        return true;
    }

    async function createLinkHierarchy(linkName, parentGroup, parentJoint = null) {
        const linkGroup = new THREE.Group();
        linkGroup.name = linkName;

        // Apply parent joint STATIC transformation (origin)
        if (parentJoint) {
            const [px, py, pz] = parentJoint.origin.position;
            linkGroup.position.set(px, py, pz);
            applyRotation(linkGroup, parentJoint.origin.rotation);
            console.log(`[URDF Viewer] Link '${linkName}' connected via joint '${parentJoint.name}'`);
        } else {
            console.log(`[URDF Viewer] Creating root link: ${linkName}`);
        }

        // Load and add visuals for this link
        const linkData = urdfData.links[linkName];
        if (linkData && linkData.visuals.length > 0) {
            console.log(`[URDF Viewer]   Link has ${linkData.visuals.length} visual(s)`);
            for (const visual of linkData.visuals) {
                try {
                    const mesh = await loadMesh(visual.filename);
                    if (mesh) {
                        const visualGroup = new THREE.Group();
                        const [vx, vy, vz] = visual.origin.position;
                        visualGroup.position.set(vx, vy, vz);
                        applyRotation(visualGroup, visual.origin.rotation);
                        visualGroup.add(mesh);
                        linkGroup.add(visualGroup);
                        console.log(`[URDF Viewer]   ✅ Added mesh to ${linkName}`);
                    } else {
                        console.warn(`[URDF Viewer]   ⚠️ Mesh loaded as null for ${linkName}/${visual.filename}`);
                    }
                } catch (error) {
                    console.error(`[URDF Viewer]   ❌ Exception loading mesh for ${linkName}/${visual.filename}:`, error);
                }
            }
        } else {
            console.log(`[URDF Viewer]   Link '${linkName}' has no visuals`);
        }

        parentGroup.add(linkGroup);
        linkMeshes[linkName] = linkGroup;

        // Find child joints and recursively create child links
        const childJoints = urdfData.joints.filter(j => j.parent === linkName);
        if (childJoints.length > 0) {
            console.log(`[URDF Viewer]   Link '${linkName}' has ${childJoints.length} child joint(s)`);
        }
        for (const childJoint of childJoints) {
            await createLinkHierarchy(childJoint.child, linkGroup, childJoint);
        }
    }

    async function loadMesh(filename) {
        // Convert filename from URDF format to URL
        let meshPath = filename;
        if (meshPath.startsWith('./')) {
            meshPath = meshPath.substring(2);
        }
        const meshUrl = CONFIG.meshPath + meshPath;
        console.log(`[URDF Viewer] Loading mesh: ${filename} → ${meshUrl}`);

        try {
            if (meshUrl.endsWith('.glb')) {
                console.log(`[URDF Viewer]   Using GLTFLoader for: ${meshUrl}`);
                return await loadGltf(meshUrl);
            } else if (meshUrl.endsWith('.dae')) {
                console.log(`[URDF Viewer]   Using ColladaLoader for: ${meshUrl}`);
                return await loadDae(meshUrl);
            } else {
                console.warn(`[URDF Viewer]   Unknown format: ${meshUrl}`);
            }
        } catch (error) {
            console.error(`[URDF Viewer] ❌ Failed to load mesh ${filename}:`);
            console.error(`[URDF Viewer]   URL: ${meshUrl}`);
            console.error(`[URDF Viewer]   Error: ${error.message}`);
            console.error(`[URDF Viewer]   Stack: ${error.stack}`);
        }
        return null;
    }

    function loadGltf(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(
                url,
                (gltf) => {
                    const scene = gltf.scene;
                    scene.castShadow = true;
                    scene.receiveShadow = true;
                    scene.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });
                    resolve(scene);
                },
                undefined,
                (error) => {
                    reject(error);
                }
            );
        });
    }

    function loadDae(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.ColladaLoader();
            loader.load(
                url,
                (collada) => {
                    const scene = collada.scene;
                    scene.castShadow = true;
                    scene.receiveShadow = true;
                    scene.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });
                    resolve(scene);
                },
                undefined,
                (error) => {
                    reject(error);
                }
            );
        });
    }

    function applyRotation(obj, rpy) {
        const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
        obj.quaternion.setFromEuler(euler);
    }

    // ========== Joint Updates ==========
    function updateJointAngles(jointValues) {
        Object.assign(currentJointValues, jointValues);
        
        // Record frame for export
        if (!playbackState.isPaused) {
            playbackState.recordedFrames.push(JSON.parse(JSON.stringify(jointValues)));
            playbackState.currentFrameIndex = playbackState.recordedFrames.length - 1;
        }
        
        updateRobotPose();
        updateUiPanel();
    }

    function updateRobotPose() {
        // Traverse the robot model and apply joint transforms
        // The structure is: base_link -> ... -> child_link via joints
        
        function updateLinkPose(linkName) {
            const linkGroup = linkMeshes[linkName];
            if (!linkGroup) return;

            // Find the joint that connects parent to this link
            const incomingJoint = urdfData.joints.find((j) => j.child === linkName);

            if (incomingJoint) {
                // Reset position and rotation to the joint's static origin
                const [px, py, pz] = incomingJoint.origin.position;
                linkGroup.position.set(px, py, pz);
                
                // Get the default rotation from the joint origin
                const defaultRotation = new THREE.Euler(
                    incomingJoint.origin.rotation[0],
                    incomingJoint.origin.rotation[1],
                    incomingJoint.origin.rotation[2],
                    'XYZ'
                );
                const defaultQuat = new THREE.Quaternion();
                defaultQuat.setFromEuler(defaultRotation);

                // Get the current joint value
                const jointValue = currentJointValues[incomingJoint.name] || 0;

                if (incomingJoint.type === 'revolute') {
                    // For revolute joints, rotate around the axis
                    const axisVec = new THREE.Vector3(
                        incomingJoint.axis.x,
                        incomingJoint.axis.y,
                        incomingJoint.axis.z
                    ).normalize();

                    // Create rotation from joint value
                    const jointQuat = new THREE.Quaternion();
                    jointQuat.setFromAxisAngle(axisVec, jointValue);
                    
                    // Combine: first default rotation, then joint rotation
                    // Final = jointQuat * defaultQuat
                    linkGroup.quaternion.multiplyQuaternions(jointQuat, defaultQuat);
                } else if (incomingJoint.type === 'prismatic') {
                    // For prismatic joints, translate along the axis
                    const axisVec = new THREE.Vector3(
                        incomingJoint.axis.x,
                        incomingJoint.axis.y,
                        incomingJoint.axis.z
                    ).normalize();
                    
                    // Scale axis by joint value and add to position
                    const translation = axisVec.clone().multiplyScalar(jointValue);
                    linkGroup.position.add(translation);
                    
                    // Apply default rotation
                    linkGroup.quaternion.copy(defaultQuat);
                } else {
                    // Fixed joints: just apply the default rotation
                    linkGroup.quaternion.copy(defaultQuat);
                }
            }

            // Recursively update child links
            const childJoints = urdfData.joints.filter((j) => j.parent === linkName);
            childJoints.forEach((childJoint) => {
                updateLinkPose(childJoint.child);
            });
        }

        updateLinkPose('base_link');
    }

    // ========== Animation Loop ==========
    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    // ========== Export Functionality ==========
    function exportRecordedData() {
        if (playbackState.recordedFrames.length === 0) {
            console.log('[URDF Viewer] No frames recorded');
            alert('没有录制的帧数据');
            return;
        }

        const data = {
            timestamp: new Date().toISOString(),
            robotName: urdfData ? urdfData.name : 'unknown',
            frameCount: playbackState.recordedFrames.length,
            frames: playbackState.recordedFrames,
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `robot_trajectory_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('[URDF Viewer] Exported', playbackState.recordedFrames.length, 'frames');
    }

    // ========== Keyboard Controls ==========
    document.addEventListener('keydown', function(e) {
        if (e.key === 'e' || e.key === 'E') {
            exportRecordedData();
        }
        if (e.key === ' ') {
            playbackState.isPaused = !playbackState.isPaused;
            updateUiPanel();
            e.preventDefault();
        }
    });

    // ========== Public API ==========
    window.UrdfViewer = {
        async init(containerId = CONFIG.containerSelector) {
            const container = document.querySelector(containerId);
            if (!container) {
                console.error('[URDF Viewer] Container not found:', containerId);
                return false;
            }

            console.log('[URDF Viewer] Initializing...');

            // Show loading state
            const placeholder = container.querySelector('.replayviewer-urdf-ph');
            if (placeholder) {
                placeholder.textContent = '加载 Three.js 库中...';
            }

            // Load Three.js libraries with fallback
            const threeJsLoaded = await loadThreeJsLibraries();
            
            if (!threeJsLoaded) {
                console.error('[URDF Viewer] Failed to load Three.js from all CDN sources');
                if (placeholder) {
                    placeholder.innerHTML = `
                        <div style="text-align: center; color: #ff6b6b;">
                            <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                            <div style="margin-bottom: 8px;">Three.js 库加载失败</div>
                            <div style="font-size: 12px; color: #aaa; margin-bottom: 12px;">
                                请检查网络连接或尝试：
                            </div>
                            <div style="font-size: 12px; color: #888; line-height: 1.8;">
                                • 刷新页面 (Ctrl+R)<br>
                                • 清除浏览器缓存 (Ctrl+Shift+Delete)<br>
                                • 检查科学上网<br>
                                • 尝试其他浏览器
                            </div>
                        </div>
                    `;
                }
                return false;
            }

            // Wait for Three.js to be fully available
            let attempts = 0;
            while (!checkThreeJs() && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
            }

            if (!checkThreeJs()) {
                if (placeholder) {
                    placeholder.textContent = 'Three.js 初始化失败';
                }
                console.error('[URDF Viewer] Three.js failed to initialize');
                return false;
            }

            console.log('[URDF Viewer] Three.js ready');

            if (placeholder) {
                placeholder.textContent = 'URDF 加载中...';
            }

            // Initialize Three.js
            initThreeJs(container);

            // Load URDF
            console.log('[URDF Viewer] ===== URDF Loading Phase =====');
            if (placeholder) {
                placeholder.textContent = 'URDF 加载中...';
            }
            const urdfLoaded = await loadUrdf(CONFIG.urdfPath);
            if (!urdfLoaded) {
                if (placeholder) {
                    placeholder.innerHTML = `
                        <div style="text-align: center; color: #ff6b6b; padding: 20px;">
                            <div style="font-size: 24px; margin-bottom: 10px;">❌ URDF 加载失败</div>
                            <div style="font-size: 12px; color: #aaa; margin-bottom: 12px;">
                                请检查浏览器控制台 (F12) 的错误信息
                            </div>
                            <div style="font-size: 12px; color: #888; line-height: 1.8; text-align: left; max-width: 300px; margin: 0 auto;">
                                📋 Console 中应该看到：<br>
                                • [URDF Viewer] Loading URDF from: /y1_dual/y1_dual.urdf<br>
                                • 以及具体的错误信息<br><br>
                                ✅ 解决方案：<br>
                                • 检查URDF文件路径<br>
                                • 刷新页面并查看控制台<br>
                                • 检查网络连接
                            </div>
                        </div>
                    `;
                }
                console.error('[URDF Viewer] URDF Loading failed - see error details above');
                return false;
            }

            // Build robot model
            console.log('[URDF Viewer] ===== Model Building Phase =====');
            if (placeholder) {
                placeholder.textContent = '构建模型中...';
            }

            const modelBuilt = await buildRobotModel();
            if (!modelBuilt) {
                if (placeholder) {
                    placeholder.innerHTML = `
                        <div style="text-align: center; color: #ff6b6b; padding: 20px;">
                            <div style="font-size: 24px; margin-bottom: 10px;">❌ 模型构建失败</div>
                            <div style="font-size: 12px; color: #aaa; margin-bottom: 12px;">
                                请检查浏览器控制台 (F12) 的错误信息
                            </div>
                            <div style="font-size: 12px; color: #888; line-height: 1.8; text-align: left; max-width: 300px; margin: 0 auto;">
                                📋 常见问题：<br>
                                • 网格文件路径错误<br>
                                • 网格文件不存在<br>
                                • Three.js 加载器缺失<br><br>
                                ✅ 调试步骤：<br>
                                1. F12 打开控制台<br>
                                2. 查找 [URDF Viewer] 日志<br>
                                3. 查看具体错误信息
                            </div>
                        </div>
                    `;
                }
                console.error('[URDF Viewer] Model building failed - see error details above');
                return false;
            }

            // Ensure the model is in view even if URDF scale/origin differs.
            fitCameraToRobot();

            // Remove placeholder
            if (placeholder) {
                placeholder.style.display = 'none';
            }

            // Start animation
            animate();

            console.log('[URDF Viewer] Initialization complete');
            return true;
        },

        updateJoints(jointValues) {
            if (!initialized) return;
            updateJointAngles(jointValues);
        },

        // For compatibility with replay viewer
        updateFromReplayData(joints, gripper) {
            if (!initialized) return;

            const jointValues = {};
            if (joints && joints.length >= 6) {
                jointValues['fl_joint1'] = joints[0];
                jointValues['fl_joint2'] = joints[1];
                jointValues['fl_joint3'] = joints[2];
                jointValues['fl_joint4'] = joints[3];
                jointValues['fl_joint5'] = joints[4];
                jointValues['fl_joint6'] = joints[5];

                jointValues['fr_joint1'] = joints[0];
                jointValues['fr_joint2'] = joints[1];
                jointValues['fr_joint3'] = joints[2];
                jointValues['fr_joint4'] = joints[3];
                jointValues['fr_joint5'] = joints[4];
                jointValues['fr_joint6'] = joints[5];
            }

            if (gripper !== undefined && gripper !== null) {
                const gripperPos = -gripper * 0.05;
                jointValues['fl_joint7'] = gripperPos;
                jointValues['fl_joint8'] = -gripperPos;

                jointValues['fr_joint7'] = gripperPos;
                jointValues['fr_joint8'] = -gripperPos;
            }

            updateJointAngles(jointValues);
        },

        dispose() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            if (renderer) {
                renderer.dispose();
            }
        },
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[URDF Viewer] DOM loaded, scheduling auto-initialization...');
            // Delay to allow external scripts to load
            setTimeout(() => {
                window.UrdfViewer.init().catch(err => {
                    console.error('[URDF Viewer] Auto-init failed:', err);
                });
            }, 1000);
        });
    } else {
        console.log('[URDF Viewer] DOM already loaded, scheduling auto-initialization...');
        setTimeout(() => {
            window.UrdfViewer.init().catch(err => {
                console.error('[URDF Viewer] Auto-init failed:', err);
            });
        }, 1000);
    }

    console.log('[URDF Viewer] Module loaded and ready');
})();
