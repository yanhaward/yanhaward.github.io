(function () {
    'use strict';

    const replayviewerPage = document.querySelector('.replayviewer-page');
    const leftResizer = document.getElementById('replayviewerLeftResizer');
    const rightResizer = document.getElementById('replayviewerRightResizer');
    const mobileMedia = window.matchMedia('(max-width: 900px)');

    // ── camera state ──
    const cams = {
    head:  { img: document.getElementById('replayviewerHeadCamera'),  ns: document.getElementById('replayviewerHeadNoSignal')  },
    left:  { img: document.getElementById('replayviewerLeftCamera'),  ns: document.getElementById('replayviewerLeftNoSignal')  },
    right: { img: document.getElementById('replayviewerRightCamera'), ns: document.getElementById('replayviewerRightNoSignal') },
    };
    let expandedKey = null;

    // ── WebSocket state ──
    let ws = null, wsConnected = false;
    let frameCount = 0, fpsCounter = 0;
    let lastFrameTime = Date.now(), lastFpsUpdate = Date.now();

    // ── joint chart ──
    const JOINT_COLORS = ['#e05555', '#9b5fe0', '#e0a0c0', '#5598e0', '#60c070', '#e0b855'];
    const GRIPPER_COLOR = '#e07030';
    const BUF_SIZE = 200;
    const jointBufs  = Array.from({ length: 6 }, () => new Float32Array(BUF_SIZE));
    const gripperBuf  = new Float32Array(BUF_SIZE);
    let bufHead = 0, bufFilled = 0;
    let hoveredJoint = -1;

    const jointsCanvas  = document.getElementById('replayviewerJointsCanvas');
    const gripperCanvas = document.getElementById('replayviewerGripperCanvas');
    const tooltip       = document.getElementById('replayviewerChartTooltip');

    const resizeBounds = {
        left: { min: 220, max: 520 },
        right: { min: 220, max: 460 },
        centerMin: 360,
    };

    let dragState = null;

    function resizeCanvases() {
    if (!jointsCanvas) return;
    const w = jointsCanvas.parentElement.clientWidth;
    jointsCanvas.width  = w;
    gripperCanvas.width = w;
    drawCharts();
    }

    function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
    }

    function isResizableLayout() {
    return replayviewerPage && !mobileMedia.matches;
    }

    function applyColumnWidths(leftWidth, rightWidth) {
    if (!replayviewerPage || !isResizableLayout()) return;
    replayviewerPage.style.setProperty('--replayviewer-left-width', leftWidth + 'px');
    replayviewerPage.style.setProperty('--replayviewer-right-width', rightWidth + 'px');
    resizeCanvases();
    }

    function getLayoutMetrics() {
    if (!replayviewerPage) return null;
    const styles = getComputedStyle(replayviewerPage);
    const rect = replayviewerPage.getBoundingClientRect();
    const left = parseFloat(styles.getPropertyValue('--replayviewer-left-width')) || 300;
    const right = parseFloat(styles.getPropertyValue('--replayviewer-right-width')) || 260;
    const resizer = parseFloat(styles.getPropertyValue('--replayviewer-resizer-width')) || 12;
    return { rect, left, right, resizer };
    }

    function syncWidthsToAvailableSpace(nextLeft, nextRight) {
    const metrics = getLayoutMetrics();
    if (!metrics) return;
    const total = metrics.rect.width;
    const gapTotal = metrics.resizer * 2;
    const maxSideTotal = total - gapTotal - resizeBounds.centerMin;
    const leftMin = resizeBounds.left.min;
    const rightMin = resizeBounds.right.min;
    let left = clamp(nextLeft, resizeBounds.left.min, resizeBounds.left.max);
    let right = clamp(nextRight, resizeBounds.right.min, resizeBounds.right.max);

    if (maxSideTotal <= leftMin + rightMin) {
        left = leftMin;
        right = rightMin;
    } else if (left + right > maxSideTotal) {
        if (dragState && dragState.side === 'left') {
        left = clamp(maxSideTotal - right, leftMin, resizeBounds.left.max);
        } else if (dragState && dragState.side === 'right') {
        right = clamp(maxSideTotal - left, rightMin, resizeBounds.right.max);
        } else {
        right = clamp(maxSideTotal - left, rightMin, resizeBounds.right.max);
        left = clamp(maxSideTotal - right, leftMin, resizeBounds.left.max);
        }
    }

    applyColumnWidths(left, right);
    }

    function stopResizing() {
    if (!dragState) return;
    dragState.handle.classList.remove('is-dragging');
    document.body.classList.remove('replayviewer-is-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResizing);
    window.removeEventListener('pointercancel', stopResizing);
    dragState = null;
    }

    function onPointerMove(event) {
    if (!dragState || !isResizableLayout()) return;
    const delta = event.clientX - dragState.startX;
    if (dragState.side === 'left') {
        syncWidthsToAvailableSpace(dragState.startLeft + delta, dragState.startRight);
    } else {
        syncWidthsToAvailableSpace(dragState.startLeft, dragState.startRight - delta);
    }
    }

    function startResizing(side, handle, event) {
    if (!isResizableLayout()) return;
    const metrics = getLayoutMetrics();
    if (!metrics) return;
    dragState = {
        side: side,
        handle: handle,
        startX: event.clientX,
        startLeft: metrics.left,
        startRight: metrics.right,
    };
    handle.classList.add('is-dragging');
    document.body.classList.add('replayviewer-is-resizing');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    event.preventDefault();
    }

    function adjustByKeyboard(side, step) {
    const metrics = getLayoutMetrics();
    if (!metrics || !isResizableLayout()) return;
    dragState = { side: side };
    if (side === 'left') {
        syncWidthsToAvailableSpace(metrics.left + step, metrics.right);
    } else {
        syncWidthsToAvailableSpace(metrics.left, metrics.right + step);
    }
    dragState = null;
    }

    function bindResizer(handle, side) {
    if (!handle) return;
    handle.addEventListener('pointerdown', function (event) {
        startResizing(side, handle, event);
    });
    handle.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft') {
        adjustByKeyboard(side, side === 'left' ? -16 : 16);
        event.preventDefault();
        }
        if (event.key === 'ArrowRight') {
        adjustByKeyboard(side, side === 'left' ? 16 : -16);
        event.preventDefault();
        }
    });
    }

    function getOrdered(buf) {
    const n = bufFilled;
    const start = bufFilled < BUF_SIZE ? 0 : bufHead;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = buf[(start + i) % BUF_SIZE];
    return out;
    }

    function drawLine(ctx, data, color, w, h, minV, maxV, highlighted) {
    if (data.length < 2) return;
    const range = maxV - minV || 1;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = highlighted ? 2.5 : 1.2;
    ctx.globalAlpha = highlighted ? 1 : (hoveredJoint >= 0 ? 0.22 : 1);
    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((data[i] - minV) / range) * h * 0.88 - h * 0.06;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    }

    function drawCharts() {
    if (!jointsCanvas) return;
    
    const jw = jointsCanvas.width, jh = jointsCanvas.height;
    const gw = gripperCanvas.width, gh = gripperCanvas.height;
    const jCtx = jointsCanvas.getContext('2d');
    const gCtx = gripperCanvas.getContext('2d');

    // joints
    jCtx.clearRect(0, 0, jw, jh);
    jCtx.strokeStyle = 'rgba(0,0,0,0.07)'; jCtx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function(f) {
        jCtx.beginPath(); jCtx.moveTo(0, f * jh); jCtx.lineTo(jw, f * jh); jCtx.stroke();
    });

    var minV = Infinity, maxV = -Infinity;
    for (var j = 0; j < 6; j++) {
        var d = getOrdered(jointBufs[j]);
        for (var k = 0; k < d.length; k++) {
        if (d[k] < minV) minV = d[k];
        if (d[k] > maxV) maxV = d[k];
        }
    }
    if (!isFinite(minV)) { minV = -1; maxV = 1; }
    var pad = (maxV - minV) * 0.12 || 0.1;
    minV -= pad; maxV += pad;

    for (var j = 0; j < 6; j++) {
        drawLine(jCtx, getOrdered(jointBufs[j]), JOINT_COLORS[j], jw, jh, minV, maxV, j === hoveredJoint);
    }

    // gripper
    gCtx.clearRect(0, 0, gw, gh);
    gCtx.strokeStyle = 'rgba(0,0,0,0.07)'; gCtx.lineWidth = 1;
    gCtx.beginPath(); gCtx.moveTo(0, gh / 2); gCtx.lineTo(gw, gh / 2); gCtx.stroke();
    var gd = getOrdered(gripperBuf);
    var gmn = Infinity, gmx = -Infinity;
    for (var k = 0; k < gd.length; k++) {
        if (gd[k] < gmn) gmn = gd[k];
        if (gd[k] > gmx) gmx = gd[k];
    }
    if (!isFinite(gmn)) { gmn = 0; gmx = 1; }
    var gpad = (gmx - gmn) * 0.12 || 0.1;
    drawLine(gCtx, gd, GRIPPER_COLOR, gw, gh, gmn - gpad, gmx + gpad, false);
    }

    function pushJointData(joints, gripper) {
    for (var i = 0; i < 6; i++) {
        jointBufs[i][bufHead] = (joints && joints[i] !== undefined) ? joints[i] : 0;
    }
    gripperBuf[bufHead] = (gripper !== undefined && gripper !== null) ? gripper : 0;
    bufHead = (bufHead + 1) % BUF_SIZE;
    if (bufFilled < BUF_SIZE) bufFilled++;
    drawCharts();
    
    // Update URDF viewer with current joint values
    if (window.UrdfViewer) {
        window.UrdfViewer.updateFromReplayData(joints, gripper);
    }
    }

    // hover interaction
    if (jointsCanvas) {
    jointsCanvas.addEventListener('mousemove', function (e) {
        var rect  = jointsCanvas.getBoundingClientRect();
        var scaleX = jointsCanvas.width  / jointsCanvas.offsetWidth;
        var scaleY = jointsCanvas.height / jointsCanvas.offsetHeight;
        var cx = (e.clientX - rect.left) * scaleX;
        var cy = (e.clientY - rect.top)  * scaleY;
        var idx = Math.round((cx / jointsCanvas.width) * (bufFilled - 1));

        var minV = Infinity, maxV = -Infinity;
        for (var j = 0; j < 6; j++) {
        var d = getOrdered(jointBufs[j]);
        for (var k = 0; k < d.length; k++) {
            if (d[k] < minV) minV = d[k];
            if (d[k] > maxV) maxV = d[k];
        }
        }
        if (!isFinite(minV)) { minV = -1; maxV = 1; }
        var pad   = (maxV - minV) * 0.12 || 0.1;
        minV -= pad; maxV += pad;
        var range = maxV - minV || 1;
        var jh    = jointsCanvas.height;

        var best = -1, bestDist = 22;
        for (var j = 0; j < 6; j++) {
        var d = getOrdered(jointBufs[j]);
        if (!d.length || idx < 0 || idx >= d.length) continue;
        var vy = jh - ((d[idx] - minV) / range) * jh * 0.88 - jh * 0.06;
        var dist = Math.abs(vy - cy);
        if (dist < bestDist) { bestDist = dist; best = j; }
        }

        if (best !== hoveredJoint) { hoveredJoint = best; drawCharts(); }

        if (best >= 0 && idx >= 0) {
        var val = getOrdered(jointBufs[best])[idx];
        tooltip.textContent = 'Joint ' + (best + 1) + ': ' + (val !== undefined ? val.toFixed(4) : '-');
        tooltip.style.display = 'block';
        tooltip.style.left = (e.offsetX + 14) + 'px';
        tooltip.style.top  = (e.offsetY - 6)  + 'px';
        } else {
        tooltip.style.display = 'none';
        }
    });

    jointsCanvas.addEventListener('mouseleave', function () {
        hoveredJoint = -1;
        drawCharts();
        if (tooltip) tooltip.style.display = 'none';
    });
    }

    // ── WebSocket ──
    function setWsStatus(connected, text) {
    wsConnected = connected;
    var badge = document.getElementById('replayviewerWsStatus');
    var txt   = document.getElementById('replayviewerWsStatusText');
    var btn   = document.getElementById('replayviewerConnectBtn');
    badge.className = 'replayviewer-ws-badge ' + (connected ? 'connected' : 'disconnected');
    txt.textContent  = text;
    btn.textContent  = connected ? '断开' : '连接';
    btn.disabled     = false;
    }

    window.toggleReplayViewerConnection = function () {
    if (wsConnected) {
        if (ws) { ws.close(); ws = null; }
        setWsStatus(false, '未连接');
    } else {
        var raw = document.getElementById('replayviewerServerUrl').value.trim();
        var url = raw.includes('role=viewer') ? raw
        : (raw.includes('?') ? raw + '&role=viewer' : raw + '?role=viewer');
        setWsStatus(false, '连接中...');
        document.getElementById('replayviewerConnectBtn').disabled = true;
        try {
        ws = new WebSocket(url);
        ws.onopen    = function () {
            setWsStatus(true, '已连接');
            frameCount = 0; fpsCounter = 0; lastFpsUpdate = Date.now();
        };
        ws.onmessage = function (e) { handleFrame(e.data); };
        ws.onerror   = function () { setWsStatus(false, '连接错误'); };
        ws.onclose   = function () { setWsStatus(false, '未连接'); };
        } catch (_) {
        setWsStatus(false, '连接失败');
        }
    }
    };

    async function handleFrame(data) {
    try {
        var now = Date.now();
        var msg = typeof data === 'string' ? JSON.parse(data) : JSON.parse(await data.text());
        if (msg.type === 'obs' && msg.obs) {
        var obs = typeof msg.obs === 'string' ? JSON.parse(msg.obs) : msg.obs;
        if (obs.observation) {
            var o = obs.observation;
            if (o.head_camera)  updateCamImage('head',  o.head_camera);
            if (o.left_camera)  updateCamImage('left',  o.left_camera);
            if (o.right_camera) updateCamImage('right', o.right_camera);
            var joints  = o.joint_positions || o.joints || o.qpos || [];
            var gripper = o.gripper_pos !== undefined ? o.gripper_pos : o.gripper;
            pushJointData(joints, gripper);
        }
        frameCount++; fpsCounter++;
        document.getElementById('replayviewerFrameCount').textContent = frameCount;
        document.getElementById('replayviewerLatency').textContent    = now - lastFrameTime;
        lastFrameTime = now;
        if (now - lastFpsUpdate >= 1000) {
            document.getElementById('replayviewerFps').textContent =
            (fpsCounter / ((now - lastFpsUpdate) / 1000)).toFixed(1);
            fpsCounter = 0; lastFpsUpdate = now;
        }
        }
    } catch (_) {}
    }

    function updateCamImage(key, imageData) {
    var b64;
    if (imageData && imageData.__bytes__ === true) {
        b64 = imageData.data;
    } else if (typeof imageData === 'string') {
        b64 = imageData;
    } else { return; }
    var cam = cams[key];
    cam.img.src          = 'data:image/jpeg;base64,' + b64;
    cam.img.style.display = 'block';
    cam.ns.style.display  = 'none';
    // keep modal in sync if this cam is expanded
    if (expandedKey === key && modal.classList.contains('open')) {
        modalImg.src = cam.img.src;
    }
    }

    // ── camera expand modal ──
    var modal    = document.getElementById('replayviewerCamModal');
    var modalImg = document.getElementById('replayviewerModalImg');

    window.expandReplayViewerCamera = function (key) {
    var src = cams[key] && cams[key].img.src;
    if (!src || cams[key].img.style.display === 'none') return;
    expandedKey  = key;
    modalImg.src = src;
    modal.classList.add('open');
    };

    window.closeReplayViewerCamera = function () {
    modal.classList.remove('open');
    modalImg.src = '';
    expandedKey  = null;
    };

    window.onReplayViewerModalBgClick = function (e) {
    if (e.target === modal) window.closeReplayViewerCamera();
    };

    document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeReplayViewerCamera();
    });

    // ── init ──
    bindResizer(leftResizer, 'left');
    bindResizer(rightResizer, 'right');
    syncWidthsToAvailableSpace(300, 260);
    mobileMedia.addEventListener('change', function () {
    stopResizing();
    if (mobileMedia.matches) {
        replayviewerPage.style.removeProperty('--replayviewer-left-width');
        replayviewerPage.style.removeProperty('--replayviewer-right-width');
    } else {
        syncWidthsToAvailableSpace(300, 260);
    }
    });
    window.addEventListener('resize', resizeCanvases);
    requestAnimationFrame(resizeCanvases);
    
    // Initialize URDF viewer
    if (window.UrdfViewer) {
    window.UrdfViewer.init('#replayviewerUrdfContainer').catch(function(err) {
        console.error('[URDF Viewer] Initialization failed:', err);
    });
    }

})();