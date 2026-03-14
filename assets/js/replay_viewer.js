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
    const RIGHT_GRIPPER_COLOR = '#30b0e0';
    const BUF_SIZE = 200;
    const jointBufs       = Array.from({ length: 6 }, () => new Float32Array(BUF_SIZE));
    const gripperBuf       = new Float32Array(BUF_SIZE);
    const rightJointBufs  = Array.from({ length: 6 }, () => new Float32Array(BUF_SIZE));
    const rightGripperBuf  = new Float32Array(BUF_SIZE);
    let bufHead = 0, bufFilled = 0;
    let hoveredJoint = -1;
    let hoveredRightJoint = -1;

    const jointsCanvas       = document.getElementById('replayviewerJointsCanvas');
    const gripperCanvas      = document.getElementById('replayviewerGripperCanvas');
    const tooltip            = document.getElementById('replayviewerChartTooltip');
    const rightJointsCanvas  = document.getElementById('replayviewerRightJointsCanvas');
    const rightGripperCanvas = document.getElementById('replayviewerRightGripperCanvas');
    const rightTooltip       = document.getElementById('replayviewerRightChartTooltip');

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
        if (rightJointsCanvas)  rightJointsCanvas.width  = rightJointsCanvas.parentElement.clientWidth;
        if (rightGripperCanvas) rightGripperCanvas.width = rightGripperCanvas.parentElement.clientWidth;
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
        // draw joint and gripper charts
        if (!jointsCanvas) return;
        
        const jw = jointsCanvas.width, jh = jointsCanvas.height;
        const gw = gripperCanvas.width, gh = gripperCanvas.height;
        const jCtx = jointsCanvas.getContext('2d');
        const gCtx = gripperCanvas.getContext('2d');

        // left arm joints
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

        // left arm gripper
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

        // right arm joints
        if (rightJointsCanvas) {
            var rjw = rightJointsCanvas.width, rjh = rightJointsCanvas.height;
            var rjCtx = rightJointsCanvas.getContext('2d');
            rjCtx.clearRect(0, 0, rjw, rjh);
            rjCtx.strokeStyle = 'rgba(0,0,0,0.07)'; rjCtx.lineWidth = 1;
            [0.25, 0.5, 0.75].forEach(function(f) {
                rjCtx.beginPath(); rjCtx.moveTo(0, f * rjh); rjCtx.lineTo(rjw, f * rjh); rjCtx.stroke();
            });
            var rminV = Infinity, rmaxV = -Infinity;
            for (var j = 0; j < 6; j++) {
                var rd = getOrdered(rightJointBufs[j]);
                for (var k = 0; k < rd.length; k++) {
                    if (rd[k] < rminV) rminV = rd[k];
                    if (rd[k] > rmaxV) rmaxV = rd[k];
                }
            }
            if (!isFinite(rminV)) { rminV = -1; rmaxV = 1; }
            var rpad = (rmaxV - rminV) * 0.12 || 0.1;
            rminV -= rpad; rmaxV += rpad;
            for (var j = 0; j < 6; j++) {
                drawLine(rjCtx, getOrdered(rightJointBufs[j]), JOINT_COLORS[j], rjw, rjh, rminV, rmaxV, j === hoveredRightJoint);
            }
        }

        // right arm gripper
        if (rightGripperCanvas) {
            var rgw = rightGripperCanvas.width, rgh = rightGripperCanvas.height;
            var rgCtx = rightGripperCanvas.getContext('2d');
            rgCtx.clearRect(0, 0, rgw, rgh);
            rgCtx.strokeStyle = 'rgba(0,0,0,0.07)'; rgCtx.lineWidth = 1;
            rgCtx.beginPath(); rgCtx.moveTo(0, rgh / 2); rgCtx.lineTo(rgw, rgh / 2); rgCtx.stroke();
            var rgd = getOrdered(rightGripperBuf);
            var rgmn = Infinity, rgmx = -Infinity;
            for (var k = 0; k < rgd.length; k++) {
                if (rgd[k] < rgmn) rgmn = rgd[k];
                if (rgd[k] > rgmx) rgmx = rgd[k];
            }
            if (!isFinite(rgmn)) { rgmn = 0; rgmx = 1; }
            var rgpad = (rgmx - rgmn) * 0.12 || 0.1;
            drawLine(rgCtx, rgd, RIGHT_GRIPPER_COLOR, rgw, rgh, rgmn - rgpad, rgmx + rgpad, false);
        }
    }

    function decodeNumpyArray(obj) {
    // Decode { __numpy_array__: true, data: '<base64>', dtype: 'float64'|'float32'|..., shape: [...] }
    try {
        var binaryStr = atob(obj.data);
        var bytes = new Uint8Array(binaryStr.length);
        for (var i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        var dtype = (obj.dtype || 'float64').toLowerCase();
        var TypedCtor = dtype === 'float32' ? Float32Array
                      : dtype === 'int32'   ? Int32Array
                      : dtype === 'int64'   ? BigInt64Array
                      : Float64Array; // default float64
        var typed = new TypedCtor(bytes.buffer);
        return Array.from(typed, function (v) { return Number(v); });
    } catch (e) {
        console.warn('[Replay Viewer] decodeNumpyArray failed:', e);
        return [];
    }
    }

    function flattenNumericValues(value) {
        if (value === undefined || value === null) return [];
        if (typeof value === 'number') return isFinite(value) ? [value] : [];
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
            if (value.__numpy_array__ === true && typeof value.data === 'string') {
                return decodeNumpyArray(value);
            }
            if (value.data !== undefined) {
                return flattenNumericValues(value.data);
            }
            if (value.value !== undefined) {
                return flattenNumericValues(value.value);
            }

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

            var flattened = [];
            for (var oi = 0; oi < keys.length; oi++) {
            flattened = flattened.concat(flattenNumericValues(value[keys[oi]]));
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

    function normalizeReplayJointPayload(rawJoints, rawGripper) {
        var leftArm = [];
        var rightArm = [];

        if (rawJoints && typeof rawJoints === 'object' && !Array.isArray(rawJoints) && !ArrayBuffer.isView(rawJoints)) {
            leftArm = flattenNumericValues(
                rawJoints.left_arm !== undefined ? rawJoints.left_arm :
                rawJoints.leftArm !== undefined ? rawJoints.leftArm :
                rawJoints.arm_left
            );
            rightArm = flattenNumericValues(
                rawJoints.right_arm !== undefined ? rawJoints.right_arm :
                rawJoints.rightArm !== undefined ? rawJoints.rightArm :
                rawJoints.arm_right
            );
        }

        if ((!leftArm.length && !rightArm.length)) {
            var merged = flattenNumericValues(rawJoints);
            if (merged.length >= 12) {
                leftArm = merged.slice(0, 6);
                rightArm = merged.slice(6, 12);
            } else if (merged.length > 6) {
            var half = Math.floor(merged.length / 2);
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

        var gripperValues = flattenNumericValues(rawGripper);
        var leftGripper = gripperValues.length ? gripperValues[0] : 0;
        var rightGripper = gripperValues.length > 1 ? gripperValues[1] : leftGripper;

        if (rawJoints && typeof rawJoints === 'object' && !Array.isArray(rawJoints) && !ArrayBuffer.isView(rawJoints)) {
            var leftGripperValues = flattenNumericValues(
            rawJoints.left_gripper !== undefined ? rawJoints.left_gripper : rawJoints.leftGripper
            );
            var rightGripperValues = flattenNumericValues(
            rawJoints.right_gripper !== undefined ? rawJoints.right_gripper : rawJoints.rightGripper
            );
            if (leftGripperValues.length) leftGripper = leftGripperValues[0];
            if (rightGripperValues.length) rightGripper = rightGripperValues[0];
        }

        return {
            leftArm: leftArm.slice(0, 6),
            rightArm: rightArm.slice(0, 6),
            leftGripper: leftGripper,
            rightGripper: rightGripper,
            chartArm: leftArm.length ? leftArm.slice(0, 6) : rightArm.slice(0, 6),
            chartGripper: leftGripper,
        };
    }

    function pushJointData(payload) {
        var chartJoints  = payload && payload.chartArm    ? payload.chartArm    : [];
        var chartGripper = payload                        ? payload.chartGripper : 0;
        var rightJoints  = payload && payload.rightArm    ? payload.rightArm    : [];
        var rightGripper = payload                        ? payload.rightGripper : 0;
        for (var i = 0; i < 6; i++) {
            jointBufs[i][bufHead]      = (chartJoints[i]  !== undefined) ? chartJoints[i]  : 0;
            rightJointBufs[i][bufHead] = (rightJoints[i]  !== undefined) ? rightJoints[i]  : 0;
        }
        gripperBuf[bufHead]      = (chartGripper !== undefined && chartGripper !== null) ? chartGripper : 0;
        rightGripperBuf[bufHead] = (rightGripper !== undefined && rightGripper !== null) ? rightGripper : 0;
        bufHead = (bufHead + 1) % BUF_SIZE;
        if (bufFilled < BUF_SIZE) bufFilled++;
        drawCharts();
        
        // Update URDF viewer with current joint values
        if (window.UrdfViewer) {
            window.UrdfViewer.updateFromReplayData(payload);
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

    // hover interaction – right arm joints
    if (rightJointsCanvas) {
    rightJointsCanvas.addEventListener('mousemove', function (e) {
        var rect   = rightJointsCanvas.getBoundingClientRect();
        var scaleX = rightJointsCanvas.width  / rightJointsCanvas.offsetWidth;
        var scaleY = rightJointsCanvas.height / rightJointsCanvas.offsetHeight;
        var cx = (e.clientX - rect.left) * scaleX;
        var cy = (e.clientY - rect.top)  * scaleY;
        var idx = Math.round((cx / rightJointsCanvas.width) * (bufFilled - 1));

        var rminV = Infinity, rmaxV = -Infinity;
        for (var j = 0; j < 6; j++) {
            var rd = getOrdered(rightJointBufs[j]);
            for (var k = 0; k < rd.length; k++) {
                if (rd[k] < rminV) rminV = rd[k];
                if (rd[k] > rmaxV) rmaxV = rd[k];
            }
        }
        if (!isFinite(rminV)) { rminV = -1; rmaxV = 1; }
        var rpad  = (rmaxV - rminV) * 0.12 || 0.1;
        rminV -= rpad; rmaxV += rpad;
        var rrange = rmaxV - rminV || 1;
        var rjh    = rightJointsCanvas.height;

        var best = -1, bestDist = 22;
        for (var j = 0; j < 6; j++) {
            var rd = getOrdered(rightJointBufs[j]);
            if (!rd.length || idx < 0 || idx >= rd.length) continue;
            var vy = rjh - ((rd[idx] - rminV) / rrange) * rjh * 0.88 - rjh * 0.06;
            var dist = Math.abs(vy - cy);
            if (dist < bestDist) { bestDist = dist; best = j; }
        }

        if (best !== hoveredRightJoint) { hoveredRightJoint = best; drawCharts(); }

        if (best >= 0 && idx >= 0) {
            var val = getOrdered(rightJointBufs[best])[idx];
            rightTooltip.textContent = 'Joint ' + (best + 1) + ': ' + (val !== undefined ? val.toFixed(4) : '-');
            rightTooltip.style.display = 'block';
            rightTooltip.style.left = (e.offsetX + 14) + 'px';
            rightTooltip.style.top  = (e.offsetY - 6)  + 'px';
        } else {
            rightTooltip.style.display = 'none';
        }
    });

    rightJointsCanvas.addEventListener('mouseleave', function () {
        hoveredRightJoint = -1;
        drawCharts();
        if (rightTooltip) rightTooltip.style.display = 'none';
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
        // 连接状态切换
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
            var obs = null;

            // Support both wrapped websocket messages and direct payloads.
            if (msg && msg.type === 'obs' && msg.obs) {
            obs = typeof msg.obs === 'string' ? JSON.parse(msg.obs) : msg.obs;
            } else if (msg && (msg.observation || msg.joint_action || msg.action)) {
            obs = msg;
            }

            if (obs) {
            var observation = obs.observation || {};
            var jointAction = obs.joint_action || obs.action || null;

            // Fallback for old payloads that put joint fields directly in observation.
            if (!jointAction && observation) {
                if (
                    observation.left_arm !== undefined ||
                    observation.right_arm !== undefined ||
                    observation.joint_positions !== undefined ||
                    observation.joints !== undefined ||
                    observation.qpos !== undefined
                ) {
                jointAction = observation;
                }
            }

            if (obs.observation) {
                if (observation.head_camera)  updateCamImage('head',  observation.head_camera);
                if (observation.left_camera)  updateCamImage('left',  observation.left_camera);
                if (observation.right_camera) updateCamImage('right', observation.right_camera);
            }
            if (jointAction) {
                // Support the exact structure:
                // { left_arm, left_gripper, right_arm, right_gripper }
                var gripperPair = [jointAction.left_gripper, jointAction.right_gripper];
                pushJointData(normalizeReplayJointPayload(jointAction, gripperPair));
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
        } catch (error) {
            console.error('[Replay Viewer] Failed to handle frame:', error);
        }
    }

    function updateCamImage(key, imageData) {
        // update Camera images
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