/**
 * URDF Viewer based on the urdf-loader workflow:
 * Three.js scene + URDFLoader + custom mesh loaders + setJointValue updates.
 */

(function () {
    'use strict';
    let urdf_dir = '../urdf'; // put your urdf files in this directory, or change this path as needed
    let model_name = 'y1_dual';
    const CONFIG = {
        // URDF path candidates to try loading from
        urdfPathCandidates: [
            urdf_dir + '/' + model_name + '/' + model_name + '.urdf', // ../urdf/y1_dual/y1_dual.urdf
            // other candidate urdf pathes can be added here
            // '/y1_dual/y1_dual.urdf',
            // 'y1_dual/y1_dual.urdf',
            // './y1_dual/y1_dual.urdf',
            // '../y1_dual/y1_dual.urdf',
        ],
        containerSelector: '#replayviewerUrdfContainer',
        cameraPosition: [2.8, 2.2, 2.8],
        controlsTarget: [0, 0.7, 0],
    };

    let modulePromise = null;
    let containerEl = null;
    let scene = null;
    let camera = null;
    let renderer = null;
    let controls = null;
    let robot = null;
    let animationFrameId = null;
    let resizeObserver = null;
    let statusPanel = null;
    let currentUrdfUrl = null;
    let initialized = false;
    let currentJointValues = {};
    let pendingJointValues = null;
    let playbackState = {
        isPaused: false,
        recordedFrames: [],
        currentFrameIndex: 0,
    };

    function getPlaceholder() {
        return containerEl ? containerEl.querySelector('.replayviewer-urdf-ph') : null;
    }

    function setPlaceholder(message, isHtml) {
        const placeholder = getPlaceholder();
        if (!placeholder) return;
        if (isHtml) {
            placeholder.innerHTML = message;
        } else {
            placeholder.textContent = message;
        }
        placeholder.style.display = '';
    }

    function hidePlaceholder() {
        const placeholder = getPlaceholder();
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }

    function dedupe(values) {
        return Array.from(new Set(values.filter(Boolean)));
    }

    function flattenNumericValues(value) {
        if (value === undefined || value === null) return [];
        if (typeof value === 'number') return isFinite(value) ? [value] : [];
        if (typeof value === 'string') {
            const asNum = Number(value);
            return isFinite(asNum) ? [asNum] : [];
        }
        if (Array.isArray(value)) {
            let out = [];
            for (let index = 0; index < value.length; index++) {
                out = out.concat(flattenNumericValues(value[index]));
            }
            return out;
        }
        if (typeof value === 'object') {
            if (value.data !== undefined) {
                return flattenNumericValues(value.data);
            }
            if (value.value !== undefined) {
                return flattenNumericValues(value.value);
            }

            const keys = Object.keys(value);
            if (!keys.length) return [];

            const allNumericKeys = keys.every(function (key) {
                return /^\d+$/.test(key);
            });

            if (allNumericKeys) {
                keys.sort(function (left, right) {
                    return Number(left) - Number(right);
                });

                let ordered = [];
                for (let idx = 0; idx < keys.length; idx++) {
                    ordered = ordered.concat(flattenNumericValues(value[keys[idx]]));
                }
                return ordered;
            }

            let flattened = [];
            for (let idx = 0; idx < keys.length; idx++) {
                flattened = flattened.concat(flattenNumericValues(value[keys[idx]]));
            }
            return flattened;
        }
        if (ArrayBuffer.isView(value)) {
            return Array.from(value).filter(function (item) {
                return typeof item === 'number' && isFinite(item);
            });
        }
        return [];
    }

    function normalizeReplayJointPayload(payload, explicitGripper) {
        if (payload && payload.leftArm) {
            return {
                leftArm: flattenNumericValues(payload.leftArm).slice(0, 6),
                rightArm: flattenNumericValues(payload.rightArm).slice(0, 6),
                leftGripper: flattenNumericValues(payload.leftGripper)[0],
                rightGripper: flattenNumericValues(payload.rightGripper)[0],
            };
        }

        let leftArm = [];
        let rightArm = [];

        if (payload && typeof payload === 'object' && !Array.isArray(payload) && !ArrayBuffer.isView(payload)) {
            leftArm = flattenNumericValues(
                payload.left_arm !== undefined ? payload.left_arm :
                payload.leftArm !== undefined ? payload.leftArm :
                payload.arm_left
            );
            rightArm = flattenNumericValues(
                payload.right_arm !== undefined ? payload.right_arm :
                payload.rightArm !== undefined ? payload.rightArm :
                payload.arm_right
            );
        }

        if (!leftArm.length && !rightArm.length) {
            const merged = flattenNumericValues(payload);
            if (merged.length >= 12) {
                leftArm = merged.slice(0, 6);
                rightArm = merged.slice(6, 12);
            } else if (merged.length > 6) {
                const half = Math.floor(merged.length / 2);
                leftArm = merged.slice(0, half);
                rightArm = merged.slice(half);
            } else {
                leftArm = merged.slice(0, 6);
            }
        }

        if (!leftArm.length && rightArm.length) {
            leftArm = rightArm.slice(0, 6);
        }
        if (!rightArm.length && leftArm.length) {
            rightArm = leftArm.slice(0, 6);
        }

        let leftGripper = 0;
        let rightGripper = 0;
        const explicitGripperValues = flattenNumericValues(explicitGripper);
        if (explicitGripperValues.length) {
            leftGripper = explicitGripperValues[0];
            rightGripper = explicitGripperValues.length > 1 ? explicitGripperValues[1] : leftGripper;
        }

        if (payload && typeof payload === 'object' && !Array.isArray(payload) && !ArrayBuffer.isView(payload)) {
            const leftGripperValues = flattenNumericValues(
                payload.left_gripper !== undefined ? payload.left_gripper : payload.leftGripper
            );
            const rightGripperValues = flattenNumericValues(
                payload.right_gripper !== undefined ? payload.right_gripper : payload.rightGripper
            );
            if (leftGripperValues.length) leftGripper = leftGripperValues[0];
            if (rightGripperValues.length) rightGripper = rightGripperValues[0];
            if (payload.gripper !== undefined && payload.gripper !== null) {
                const gripperValues = flattenNumericValues(payload.gripper);
                if (gripperValues.length) {
                    leftGripper = gripperValues[0];
                    rightGripper = gripperValues.length > 1 ? gripperValues[1] : leftGripper;
                }
            }
            if (payload.gripper_pos !== undefined && payload.gripper_pos !== null) {
                const gripperPosValues = flattenNumericValues(payload.gripper_pos);
                if (gripperPosValues.length) {
                    leftGripper = gripperPosValues[0];
                    rightGripper = gripperPosValues.length > 1 ? gripperPosValues[1] : leftGripper;
                }
            }
        }

        return {
            leftArm: leftArm.slice(0, 6),
            rightArm: rightArm.slice(0, 6),
            leftGripper: leftGripper,
            rightGripper: rightGripper,
        };
    }

    async function loadModules() {
        if (!modulePromise) {
            modulePromise = Promise.all([
                import('https://esm.sh/three@0.164.1?target=es2022'),
                import('https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls?target=es2022'),
                import('https://esm.sh/three@0.164.1/examples/jsm/loaders/GLTFLoader?target=es2022'),
                import('https://esm.sh/three@0.164.1/examples/jsm/loaders/ColladaLoader?target=es2022'),
                import('https://esm.sh/urdf-loader@0.12.6?bundle&deps=three@0.164.1'),
            ]).then(function (mods) {
                return {
                    THREE: mods[0],
                    OrbitControls: mods[1].OrbitControls,
                    GLTFLoader: mods[2].GLTFLoader,
                    ColladaLoader: mods[3].ColladaLoader,
                    URDFLoader: mods[4].default,
                };
            });
        }

        return modulePromise;
    }

    async function resolveUrdfUrl() {
        const candidates = dedupe(CONFIG.urdfPathCandidates);

        for (const candidate of candidates) {
            try {
                const response = await fetch(candidate, {
                    method: 'GET',
                    credentials: 'same-origin',
                    cache: 'no-store',
                });

                if (response.ok) {
                    return response.url || candidate;
                }

                console.warn('[URDF Viewer] URDF not found:', candidate, response.status);
            } catch (error) {
                console.warn('[URDF Viewer] URDF fetch failed:', candidate, error.message);
            }
        }

        throw new Error('URDF file not found in all candidate paths');
    }

    function createStatusPanel() {
        statusPanel = document.createElement('div');
        statusPanel.id = 'urdfViewerPanel';
        statusPanel.style.cssText = [
            'position:absolute',
            'left:10px',
            'bottom:10px',
            'z-index:5',
            'padding:10px 12px',
            'border-radius:6px',
            'background:rgba(7, 10, 18, 0.82)',
            'border:1px solid rgba(255,255,255,0.12)',
            'color:#d7dbe3',
            'font:12px/1.5 monospace',
            'max-width:260px',
        ].join(';');
        containerEl.appendChild(statusPanel);
        updateStatusPanel();
    }

    function updateStatusPanel() {
        // Status of the robot
        if (!statusPanel) return;

        const leftJointNames = [
            'fl_joint1',
            'fl_joint2',
            'fl_joint3',
            'fl_joint4',
            'fl_joint5',
            'fl_joint6',
        ];

        const rightJointNames = [
            'fr_joint1',
            'fr_joint2',
            'fr_joint3',
            'fr_joint4',
            'fr_joint5',
            'fr_joint6',
        ];

        const leftRows = leftJointNames.map(function (name, index) {
            const value = currentJointValues[name] || 0;
            return '<div>J' + (index + 1) + ': ' + value.toFixed(3) + '</div>';
        }).join('');

        const rightRows = rightJointNames.map(function (name, index) {
            const value = currentJointValues[name] || 0;
            return '<div>J' + (index + 1) + ': ' + value.toFixed(3) + '</div>';
        }).join('');

        const leftGripperValue = currentJointValues.fl_joint7 || 0;
        const rightGripperValue = currentJointValues.fr_joint7 || 0;
        const stateColor = playbackState.isPaused ? '#ff8c69' : '#78d381';
        const stateLabel = playbackState.isPaused ? 'PAUSED' : 'PLAYING';

        statusPanel.innerHTML = [
            '<div style="font-weight:bold;margin-bottom:6px;">' + model_name + '</div>',
            '<div style="margin-bottom:6px;">State: <span style="color:' + stateColor + ';">' + stateLabel + '</span></div>',
            '<div style="color:#97a0b3;margin-bottom:4px;">Left Arm</div>',
            leftRows,
            '<div style="margin-top:6px;">Left Gripper: ' + leftGripperValue.toFixed(3) + '</div>',
            '<div style="color:#97a0b3;margin-bottom:4px;">Right Arm</div>',
            rightRows,
            '<div style="margin-top:6px;">Right Gripper: ' + rightGripperValue.toFixed(3) + '</div>',

            '<div style="margin-top:6px;color:#97a0b3;">Frame: ' + (playbackState.currentFrameIndex + 1) + ' / ' + playbackState.recordedFrames.length + '</div>',
            '<div style="margin-top:8px;color:#97a0b3;">Drag rotate, wheel zoom</div>',
        ].join('');
    }

    async function initThreeScene() {
        const modules = await loadModules();
        const THREE = modules.THREE;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xfaf3e0);

        camera = new THREE.PerspectiveCamera(
            45,
            Math.max(containerEl.clientWidth, 1) / Math.max(containerEl.clientHeight, 1),
            0.01,
            200
        );
        camera.position.set(CONFIG.cameraPosition[0], CONFIG.cameraPosition[1], CONFIG.cameraPosition[2]);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        containerEl.appendChild(renderer.domElement);

        controls = new modules.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 0.5;
        controls.maxDistance = 20;
        controls.target.set(CONFIG.controlsTarget[0], CONFIG.controlsTarget[1], CONFIG.controlsTarget[2]);
        controls.update();

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);

        const hemisphereLight = new THREE.HemisphereLight(0xdde6f3, 0x444444, 0.8);
        scene.add(hemisphereLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.castShadow = true;
        directionalLight.position.set(5, 8, 6);
        directionalLight.shadow.mapSize.setScalar(2048);
        scene.add(directionalLight);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 20),
            new THREE.ShadowMaterial({ opacity: 0.2 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        createStatusPanel();

        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(containerEl);
        window.addEventListener('resize', onResize);
    }

    function onResize() {
        if (!containerEl || !camera || !renderer) return;

        const width = Math.max(containerEl.clientWidth, 1);
        const height = Math.max(containerEl.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function fitCameraToRobot() {
        const modules = window.__ArenaUrdfViewerModules;
        const THREE = modules.THREE;
        if (!robot) return;

        robot.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(robot);
        if (bounds.isEmpty()) return;

        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.5);
        const distance = maxDim * 1.9;

        controls.target.copy(center);
        camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance);
        camera.near = 0.01;
        camera.far = Math.max(200, distance * 10);
        camera.updateProjectionMatrix();
        controls.update();
    }

    async function loadRobot() {
        const modules = await loadModules();
        window.__ArenaUrdfViewerModules = modules;

        const THREE = modules.THREE;
        const manager = new THREE.LoadingManager();
        const geometryLoaded = new Promise(function (resolve) {
            manager.onLoad = resolve;
        });

        const loader = new modules.URDFLoader(manager);
        loader.fetchOptions = { mode: 'cors', credentials: 'same-origin' };
        loader.parseCollision = false;
        loader.loadMeshCb = function (path, meshManager, done) {
            const ext = (path.split('.').pop() || '').toLowerCase();

            if (ext === 'glb' || ext === 'gltf') {
                new modules.GLTFLoader(meshManager).load(
                    path,
                    function (result) { done(result.scene); },
                    undefined,
                    function (error) { done(null, error); }
                );
                return;
            }

            if (ext === 'dae') {
                new modules.ColladaLoader(meshManager).load(
                    path,
                    function (result) { done(result.scene); },
                    undefined,
                    function (error) { done(null, error); }
                );
                return;
            }

            loader.defaultMeshLoader(path, meshManager, done);
        };

        currentUrdfUrl = await resolveUrdfUrl();
        console.log('[URDF Viewer] Loading robot from:', currentUrdfUrl);

        const loadedRobot = await loader.loadAsync(currentUrdfUrl);
        await geometryLoaded;

        robot = loadedRobot;
        // ROS URDF is typically Z-up. Three.js is Y-up.
        // The example repo uses +PI/2 for a different model, but this robot
        // needs -PI/2 or it appears flipped upside down.
        robot.rotation.x = -Math.PI / 2;

        robot.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        robot.updateMatrixWorld(true);
        const floorBounds = new THREE.Box3().setFromObject(robot);
        if (!floorBounds.isEmpty()) {
            robot.position.y -= floorBounds.min.y;
        }

        scene.add(robot);
        if (pendingJointValues) {
            applyJointValues(pendingJointValues);
            pendingJointValues = null;
        }
        fitCameraToRobot();
    }

    function animate() {
        animationFrameId = window.requestAnimationFrame(animate);
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function buildJointMap(joints, gripper) {
        const normalized = normalizeReplayJointPayload(joints, gripper);
        const values = {};

        if (normalized.leftArm.length >= 6) {
            values.fl_joint1 = normalized.leftArm[0];
            values.fl_joint2 = normalized.leftArm[1];
            values.fl_joint3 = normalized.leftArm[2];
            values.fl_joint4 = normalized.leftArm[3];
            values.fl_joint5 = normalized.leftArm[4];
            values.fl_joint6 = normalized.leftArm[5];
        }

        if (normalized.rightArm.length >= 6) {
            values.fr_joint1 = normalized.rightArm[0];
            values.fr_joint2 = normalized.rightArm[1];
            values.fr_joint3 = normalized.rightArm[2];
            values.fr_joint4 = normalized.rightArm[3];
            values.fr_joint5 = normalized.rightArm[4];
            values.fr_joint6 = normalized.rightArm[5];
        }

        if (isFinite(normalized.leftGripper)) {
            const leftGripperPos = -normalized.leftGripper * 0.05;
            values.fl_joint7 = leftGripperPos;
            values.fl_joint8 = -leftGripperPos;
        }

        if (isFinite(normalized.rightGripper)) {
            const rightGripperPos = -normalized.rightGripper * 0.05;
            values.fr_joint7 = rightGripperPos;
            values.fr_joint8 = -rightGripperPos;
        }

        return values;
    }

    function applyJointValues(values) {
        if (!values) return;
        if (!robot) {
            pendingJointValues = Object.assign({}, pendingJointValues || {}, values);
            return;
        }

        currentJointValues = Object.assign({}, currentJointValues, values);

        let appliedCount = 0;
        Object.keys(values).forEach(function (jointName) {
            if (!robot.joints || !robot.joints[jointName]) {
                console.warn('[URDF Viewer] Joint not found in robot:', jointName);
                return;
            }

            const value = values[jointName];
            robot.setJointValue(jointName, value);
            appliedCount += 1;
        });

        if (appliedCount === 0) {
            console.warn('[URDF Viewer] No joint values were applied for payload:', values);
        }

        robot.updateMatrixWorld(true);

        if (!playbackState.isPaused) {
            playbackState.recordedFrames.push(Object.assign({}, currentJointValues));
            playbackState.currentFrameIndex = Math.max(playbackState.recordedFrames.length - 1, 0);
        }

        updateStatusPanel();
    }

    function showError(message) {
        setPlaceholder(
            '<div style="text-align:center;color:#ff9380;padding:20px;">' +
            '<div style="font-size:24px;margin-bottom:10px;">URDF 加载失败</div>' +
            '<div style="font-size:12px;color:#b6bcc8;line-height:1.8;">' +
            message +
            '</div>' +
            '</div>',
            true
        );
    }

    window.UrdfViewer = {
        init: async function (containerId) {
            if (initialized) return true;

            containerEl = document.querySelector(containerId || CONFIG.containerSelector);
            if (!containerEl) {
                console.error('[URDF Viewer] Container not found:', containerId || CONFIG.containerSelector);
                return false;
            }

            containerEl.style.position = 'relative';
            setPlaceholder('加载 URDF Viewer 模块中...');

            try {
                await initThreeScene();
                setPlaceholder('加载 URDF 模型中...');
                await loadRobot();
                hidePlaceholder();
                animate();
                initialized = true;
                return true;
            } catch (error) {
                console.error('[URDF Viewer] Initialization failed:', error);
                showError('请打开 F12 Console 查看错误。<br>' + String(error.message || error));
                return false;
            }
        },

        updateJoints: function (jointValues) {
            applyJointValues(jointValues);
        },

        updateFromReplayData: function (joints, gripper) {
            applyJointValues(buildJointMap(joints, gripper));
        },

        dispose: function () {
            if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            window.removeEventListener('resize', onResize);

            if (controls) {
                controls.dispose();
                controls = null;
            }

            if (renderer) {
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
                renderer = null;
            }

            if (statusPanel && statusPanel.parentNode) {
                statusPanel.parentNode.removeChild(statusPanel);
                statusPanel = null;
            }

            if (robot && robot.parent) {
                robot.parent.remove(robot);
            }

            robot = null;
            scene = null;
            camera = null;
            containerEl = null;
            currentUrdfUrl = null;
            initialized = false;
            currentJointValues = {};
            pendingJointValues = null;
            playbackState = {
                isPaused: false,
                recordedFrames: [],
                currentFrameIndex: 0,
            };
        },
    };

    document.addEventListener('keydown', function (event) {
        if (event.key === ' ') {
            playbackState.isPaused = !playbackState.isPaused;
            updateStatusPanel();
            event.preventDefault();
        }
    });
})();