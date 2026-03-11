(function () {
    'use strict';

    const evalmonitorPage = document.querySelector('.evalmonitor-page');
    const leftResizer = document.getElementById('evalmonitorLeftResizer');
    const rightResizer = document.getElementById('evalmonitorRightResizer');
    const mobileMedia = window.matchMedia('(max-width: 900px)');

    // ── camera state ──
    const cams = {
    head:  { img: document.getElementById('evalmonitorHeadCamera'),  ns: document.getElementById('evalmonitorHeadNoSignal')  },
    left:  { img: document.getElementById('evalmonitorLeftCamera'),  ns: document.getElementById('evalmonitorLeftNoSignal')  },
    right: { img: document.getElementById('evalmonitorRightCamera'), ns: document.getElementById('evalmonitorRightNoSignal') },
    };
    let expandedKey = null;

    // ── WebSocket state ──
    let ws = null, wsConnected = false;
    let frameCount = 0, fpsCounter = 0;
    let lastFrameTime = Date.now(), lastFpsUpdate = Date.now();

    // ── joint chart ──
    const JOINT_COLORS = ['#e05555', '#9b5fe0', '#e0a0c0', '#5598e0', '#60c070', '#e0b855', '#4db6ac', '#f48fb1'];
    const LEFT_GRIPPER_COLOR = '#e07030';
    const RIGHT_GRIPPER_COLOR = '#2f9e44';
    const BUF_SIZE = 200;

    const leftJointsCanvas  = document.getElementById('evalmonitorLeftJointsCanvas');
    const rightJointsCanvas = document.getElementById('evalmonitorRightJointsCanvas');
    const leftGripperCanvas = document.getElementById('evalmonitorLeftGripperCanvas');
    const rightGripperCanvas = document.getElementById('evalmonitorRightGripperCanvas');
    const tooltip           = document.getElementById('evalmonitorChartTooltip');

    let leftJointSeries = [];
    let rightJointSeries = [];
    let leftGripperSeries = [[]];
    let rightGripperSeries = [[]];

    const resizeBounds = {
        left: { min: 220, max: 520 },
        right: { min: 220, max: 460 },
        centerMin: 360,
    };

    let dragState = null;

    function resizeCanvases() {
    if (!leftJointsCanvas || !rightJointsCanvas || !leftGripperCanvas || !rightGripperCanvas) return;
    const lw = leftJointsCanvas.parentElement.clientWidth;
    const rw = rightJointsCanvas.parentElement.clientWidth;
    const lgw = leftGripperCanvas.parentElement.clientWidth;
    const rgw = rightGripperCanvas.parentElement.clientWidth;
    leftJointsCanvas.width = lw;
    rightJointsCanvas.width = rw;
    leftGripperCanvas.width = lgw;
    rightGripperCanvas.width = rgw;
    drawCharts();
    }

    function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
    }

    function isResizableLayout() {
    return evalmonitorPage && !mobileMedia.matches;
    }

    function applyColumnWidths(leftWidth, rightWidth) {
    if (!evalmonitorPage || !isResizableLayout()) return;
    evalmonitorPage.style.setProperty('--evalmonitor-left-width', leftWidth + 'px');
    evalmonitorPage.style.setProperty('--evalmonitor-right-width', rightWidth + 'px');
    resizeCanvases();
    }

    function getLayoutMetrics() {
    if (!evalmonitorPage) return null;
    const styles = getComputedStyle(evalmonitorPage);
    const rect = evalmonitorPage.getBoundingClientRect();
    const left = parseFloat(styles.getPropertyValue('--evalmonitor-left-width')) || 300;
    const right = parseFloat(styles.getPropertyValue('--evalmonitor-right-width')) || 260;
    const resizer = parseFloat(styles.getPropertyValue('--evalmonitor-resizer-width')) || 12;
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
    document.body.classList.remove('evalmonitor-is-resizing');
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
    document.body.classList.add('evalmonitor-is-resizing');
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

    function drawLine(ctx, data, color, w, h, minV, maxV) {
    if (!data || data.length < 2) return;
    const range = maxV - minV || 1;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((data[i] - minV) / range) * h * 0.88 - h * 0.06;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    }

    function drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function (f) {
        ctx.beginPath();
        ctx.moveTo(0, f * h);
        ctx.lineTo(w, f * h);
        ctx.stroke();
    });
    }

    function ensureSeriesCount(seriesStore, count) {
    while (seriesStore.length < count) {
        seriesStore.push([]);
    }
    }

    function appendSeriesValue(series, value) {
    if (series.length >= BUF_SIZE) {
        series.shift();
    }
    series.push(typeof value === 'number' && isFinite(value) ? value : 0);
    }

    function appendSeriesFrame(seriesStore, values) {
    const safeValues = Array.isArray(values) ? values : [];
    ensureSeriesCount(seriesStore, safeValues.length);
    for (let i = 0; i < seriesStore.length; i++) {
        appendSeriesValue(seriesStore[i], safeValues[i]);
    }
    }

    function getMinMax(seriesList) {
    let minV = Infinity;
    let maxV = -Infinity;

    for (let i = 0; i < seriesList.length; i++) {
        const series = seriesList[i];
        for (let j = 0; j < series.length; j++) {
        if (series[j] < minV) minV = series[j];
        if (series[j] > maxV) maxV = series[j];
        }
    }

    if (!isFinite(minV)) {
        minV = -1;
        maxV = 1;
    }
    const pad = (maxV - minV) * 0.12 || 0.1;
    return { min: minV - pad, max: maxV + pad };
    }

    function drawSeriesChart(canvas, seriesList, colors) {
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);

    const bounds = getMinMax(seriesList);
    for (let i = 0; i < seriesList.length; i++) {
        drawLine(ctx, seriesList[i], colors[i % colors.length], w, h, bounds.min, bounds.max);
    }
    }

    function drawCharts() {
    drawSeriesChart(leftJointsCanvas, leftJointSeries, JOINT_COLORS);
    drawSeriesChart(rightJointsCanvas, rightJointSeries, JOINT_COLORS);
    drawSeriesChart(leftGripperCanvas, [leftGripperSeries[0]], [LEFT_GRIPPER_COLOR]);
    drawSeriesChart(rightGripperCanvas, [rightGripperSeries[0]], [RIGHT_GRIPPER_COLOR]);
    }

    function pushJointData(groups) {
    appendSeriesFrame(leftJointSeries, groups.leftArm);
    appendSeriesFrame(rightJointSeries, groups.rightArm);
    appendSeriesValue(leftGripperSeries[0], groups.leftGripper);
    appendSeriesValue(rightGripperSeries[0], groups.rightGripper);
    drawCharts();
    }

    function flattenNumericValues(value) {
    if (value === undefined || value === null) return [];
    if (typeof value === 'number') return [value];
    if (typeof value === 'string') {
        var asNum = Number(value);
        return isFinite(asNum) ? [asNum] : [];
    }
    if (Array.isArray(value)) {
        var out = [];
        for (var i = 0; i < value.length; i++) {
        out = out.concat(flattenNumericValues(value[i]));
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

        // Support dict-like payloads such as {"0": 0.1, "1": 0.2, ...}
        var keys = Object.keys(value);
        if (!keys.length) return [];
        var allNumericKeys = keys.every(function (k) { return /^\d+$/.test(k); });
        if (allNumericKeys) {
        keys.sort(function (a, b) { return Number(a) - Number(b); });
        var ordered = [];
        for (var idx = 0; idx < keys.length; idx++) {
            ordered = ordered.concat(flattenNumericValues(value[keys[idx]]));
        }
        return ordered;
        }

        // Fallback: try flattening all object values.
        var out = [];
        for (var oi = 0; oi < keys.length; oi++) {
        out = out.concat(flattenNumericValues(value[keys[oi]]));
        }
        return out;
    }
    if (ArrayBuffer.isView(value)) {
        return Array.from(value).filter(function (item) {
        return typeof item === 'number' && isFinite(item);
        });
    }
    return [];
    }

    function extractJointSeries(jointAction) {
    if (!jointAction) {
        return { leftArm: [], rightArm: [], leftGripper: 0, rightGripper: 0 };
    }

    var leftArm = flattenNumericValues(
        jointAction.left_arm !== undefined ? jointAction.left_arm :
        jointAction.leftArm !== undefined ? jointAction.leftArm :
        jointAction.arm_left
    );
    var rightArm = flattenNumericValues(
        jointAction.right_arm !== undefined ? jointAction.right_arm :
        jointAction.rightArm !== undefined ? jointAction.rightArm :
        jointAction.arm_right
    );

    // Backward-compatible fallback when only merged joints are provided.
    if ((!leftArm.length && !rightArm.length) && (jointAction.joints || jointAction.joint_positions || jointAction.qpos)) {
        var merged = flattenNumericValues(jointAction.joints || jointAction.joint_positions || jointAction.qpos);
        var half = Math.floor(merged.length / 2);
        leftArm = merged.slice(0, half || merged.length);
        rightArm = merged.slice(half);
    }

    // Additional fallback: if only one side exists, split it to keep both charts active.
    if (!leftArm.length && rightArm.length > 1) {
        var rHalf = Math.floor(rightArm.length / 2);
        leftArm = rightArm.slice(0, rHalf);
        rightArm = rightArm.slice(rHalf);
    }
    if (!rightArm.length && leftArm.length > 1) {
        var lHalf = Math.floor(leftArm.length / 2);
        rightArm = leftArm.slice(lHalf);
        leftArm = leftArm.slice(0, lHalf);
    }

    var leftGripperValues = flattenNumericValues(jointAction.left_gripper);
    var rightGripperValues = flattenNumericValues(jointAction.right_gripper);
    var leftGripper = leftGripperValues.length ? leftGripperValues[0] : 0;
    var rightGripper = rightGripperValues.length ? rightGripperValues[0] : 0;

    if (jointAction.gripper !== undefined && jointAction.gripper !== null) {
        leftGripper = jointAction.gripper;
        rightGripper = jointAction.gripper;
    }
    if (jointAction.gripper_pos !== undefined && jointAction.gripper_pos !== null) {
        leftGripper = jointAction.gripper_pos;
        rightGripper = jointAction.gripper_pos;
    }

    return {
        leftArm: leftArm,
        rightArm: rightArm,
        leftGripper: leftGripper,
        rightGripper: rightGripper,
    };
    }

    function bytesToBase64(bytes) {
    var chunkSize = 0x8000;
    var binary = '';
    for (var offset = 0; offset < bytes.length; offset += chunkSize) {
        var chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
    }

    function normalizeImagePayload(imageData) {
    if (!imageData) return null;

    if (typeof imageData === 'string') {
        return imageData;
    }

    if (imageData && imageData.__bytes__ === true) {
        if (typeof imageData.data === 'string') {
        return imageData.data;
        }
        if (Array.isArray(imageData.data)) {
        return bytesToBase64(Uint8Array.from(imageData.data));
        }
    }

    if (Array.isArray(imageData)) {
        return bytesToBase64(Uint8Array.from(imageData));
    }

    if (ArrayBuffer.isView(imageData)) {
        return bytesToBase64(new Uint8Array(imageData.buffer, imageData.byteOffset, imageData.byteLength));
    }

    if (imageData.data && Array.isArray(imageData.data)) {
        return bytesToBase64(Uint8Array.from(imageData.data));
    }

    return null;
    }

    if (tooltip) {
    tooltip.style.display = 'none';
    }

    // ── WebSocket ──
    function setWsStatus(connected, text) {
    wsConnected = connected;
    var badge = document.getElementById('evalmonitorWsStatus');
    var txt   = document.getElementById('evalmonitorWsStatusText');
    var btn   = document.getElementById('evalmonitorConnectBtn');
    badge.className = 'evalmonitor-ws-badge ' + (connected ? 'connected' : 'disconnected');
    txt.textContent  = text;
    btn.textContent  = connected ? '断开' : '连接';
    btn.disabled     = false;
    }

    window.toggleEvalMonitorConnection = function () {
    if (wsConnected) {
        if (ws) { ws.close(); ws = null; }
        setWsStatus(false, '未连接');
    } else {
        var raw = document.getElementById('evalmonitorServerUrl').value.trim();
        var url = raw.includes('role=viewer') ? raw
        : (raw.includes('?') ? raw + '&role=viewer' : raw + '?role=viewer');
        setWsStatus(false, '连接中...');
        document.getElementById('evalmonitorConnectBtn').disabled = true;
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
            var observation = obs.observation || {};
            var jointAction = obs.joint_action || obs.action || {};

            if (observation.head_camera)  updateCamImage('head',  observation.head_camera);
            if (observation.left_camera)  updateCamImage('left',  observation.left_camera);
            if (observation.right_camera) updateCamImage('right', observation.right_camera);

            var actionData = extractJointSeries(jointAction);
            pushJointData(actionData);

            frameCount++; fpsCounter++;
            document.getElementById('evalmonitorFrameCount').textContent = frameCount;
            document.getElementById('evalmonitorLatency').textContent    = now - lastFrameTime;
            lastFrameTime = now;
            if (now - lastFpsUpdate >= 1000) {
                document.getElementById('evalmonitorFps').textContent =
                (fpsCounter / ((now - lastFpsUpdate) / 1000)).toFixed(1);
                fpsCounter = 0; lastFpsUpdate = now;
            }
        }
        // TODO
        // if (msg.type === 'action')
        
    } catch (_) {}
    }

    function updateCamImage(key, imageData) {
    var b64 = normalizeImagePayload(imageData);
    if (!b64) return;
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
    var modal    = document.getElementById('evalmonitorCamModal');
    var modalImg = document.getElementById('evalmonitorModalImg');

    window.expandEvalMonitorCamera = function (key) {
    var src = cams[key] && cams[key].img.src;
    if (!src || cams[key].img.style.display === 'none') return;
    expandedKey  = key;
    modalImg.src = src;
    modal.classList.add('open');
    };

    window.closeEvalMonitorCamera = function () {
    modal.classList.remove('open');
    modalImg.src = '';
    expandedKey  = null;
    };

    window.onEvalMonitorModalBgClick = function (e) {
    if (e.target === modal) window.closeEvalMonitorCamera();
    };

    document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeEvalMonitorCamera();
    });

    // ── init ──
    bindResizer(leftResizer, 'left');
    bindResizer(rightResizer, 'right');
    syncWidthsToAvailableSpace(300, 260);
    mobileMedia.addEventListener('change', function () {
    stopResizing();
    if (mobileMedia.matches) {
        evalmonitorPage.style.removeProperty('--evalmonitor-left-width');
        evalmonitorPage.style.removeProperty('--evalmonitor-right-width');
    } else {
        syncWidthsToAvailableSpace(300, 260);
    }
    });
    window.addEventListener('resize', resizeCanvases);
    requestAnimationFrame(resizeCanvases);
})();
