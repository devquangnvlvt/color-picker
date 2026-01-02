const appState = {
    view: 'gallery',
    levels: [],
    currentLevel: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedColorId: 1,
    paintedPixels: new Set(),
    canvas: null,
    ctx: null,
    container: null,

    // Interaction state
    activePointers: new Map(),
    lastPinchDistance: null,
    isPainting: false,
    isPanning: false,
    selectedTool: null, // 'wand', 'bomb', 'hint'
    lastScreenX: 0,
    lastScreenY: 0,
    hintPixel: null // {x, y}
};

// Initialize App
async function init() {
    appState.canvas = document.getElementById('game-canvas');
    appState.ctx = appState.canvas.getContext('2d', { alpha: false });
    appState.container = document.getElementById('game-canvas-container');

    await loadManifest();
    renderGallery();
    setupEventListeners();
    animate();
}

// Load Levels Manifest
async function loadManifest() {
    try {
        const response = await fetch('data/manifest.json');
        appState.levels = await response.json();
    } catch (e) {
        console.error("Failed to load manifest", e);
    }
}

// Render Gallery
function renderGallery(filter = 'all') {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';

    const filtered = filter === 'all'
        ? appState.levels
        : appState.levels.filter(l => l.category === filter);

    filtered.forEach(level => {
        const div = document.createElement('div');
        div.className = 'level-card';

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';
        div.appendChild(canvas);

        const idHint = document.createElement('div');
        idHint.className = 'loading-hint';
        idHint.innerText = `#${level.id.split('_')[1]}`;
        // div.appendChild(idHint); // Optional: keep or remove ID hint

        div.onclick = () => loadLevel(level.id);

        // Check completion
        const saved = localStorage.getItem(`save_${level.id}`);
        if (saved) {
            const painted = JSON.parse(saved).length;
            // Fetch total from manifest if available or just check if it was marked as won
            if (localStorage.getItem(`won_${level.id}`)) {
                div.classList.add('completed');
            }
        }

        grid.appendChild(div);

        // Render preview
        renderPreview(level.id, canvas);
    });
}

async function renderPreview(id, canvas) {
    try {
        const response = await fetch(`data/${id}.json`);
        const data = await response.json();
        const ctx = canvas.getContext('2d', { alpha: false });

        canvas.width = data.width;
        canvas.height = data.height;

        ctx.fillStyle = "#1e293b"; // Same as game background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        data.grid.forEach((row, y) => {
            row.forEach((colorId, x) => {
                if (colorId !== 0) {
                    ctx.fillStyle = data.palette[colorId - 1];
                    ctx.fillRect(x, y, 1, 1);
                }
            });
        });
    } catch (e) {
        console.error("Preview failed", e);
    }
}

// Load Level Data
async function loadLevel(id) {
    try {
        const response = await fetch(`data/${id}.json`);
        appState.currentLevel = await response.json();
        appState.paintedPixels.clear();
        appState.selectedColorId = 1;
        appState.selectedTool = null;
        appState.hintPixel = null;

        // Load progress
        const saved = localStorage.getItem(`save_${id}`);
        if (saved) {
            const arr = JSON.parse(saved);
            arr.forEach(p => appState.paintedPixels.add(p));
        }

        // Show view FIRST
        document.getElementById('gallery-view').classList.remove('active');
        document.getElementById('game-view').classList.add('active');

        // Wait for a frame to ensure layout reflow
        requestAnimationFrame(() => {
            centerImage();
            renderPalette();
            updateProgress();
            updateToolUI(); // Update tool UI on level load
        });
    } catch (e) {
        console.error("Failed to load level", e);
    }
}

function centerImage() {
    if (!appState.currentLevel || !appState.container) return;

    const pad = 40;
    const containerW = appState.container.clientWidth;
    const containerH = appState.container.clientHeight;

    const scaleW = (containerW - pad) / appState.currentLevel.width;
    const scaleH = (containerH - pad) / appState.currentLevel.height;

    appState.scale = Math.floor(Math.min(scaleW, scaleH));
    if (appState.scale < 5) appState.scale = 10;

    appState.offsetX = (containerW - appState.currentLevel.width * appState.scale) / 2;
    appState.offsetY = (containerH - appState.currentLevel.height * appState.scale) / 2;
}

// Render Palette
function renderPalette() {
    const scroll = document.getElementById('palette-scroll');
    scroll.innerHTML = '';

    appState.currentLevel.palette.forEach((color, index) => {
        const colorId = index + 1;
        const btn = document.createElement('div');
        btn.className = `color-btn ${appState.selectedColorId === colorId ? 'active' : ''}`;
        btn.style.backgroundColor = color;
        btn.innerText = colorId;

        // Font brightness check
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        btn.style.color = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000' : '#fff';

        btn.onclick = () => {
            appState.selectedColorId = colorId;
            renderPalette();
        };
        scroll.appendChild(btn);
    });
}

// Game Loop / Render
function animate() {
    if (appState.currentLevel) {
        draw();
    }
    requestAnimationFrame(animate);
}

function draw() {
    const { ctx, canvas, container, scale, offsetX, offsetY, currentLevel, paintedPixels } = appState;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const { width, height, grid, palette } = currentLevel;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const colorId = grid[y][x];
            if (colorId === 0) continue; // Skip transparency

            const px = x * scale;
            const py = y * scale;

            const isPainted = paintedPixels.has(`${x},${y}`);

            if (isPainted) {
                ctx.fillStyle = palette[colorId - 1];
                ctx.fillRect(px, py, scale, scale);
            } else {
                // Draw grid cell
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.strokeRect(px, py, scale, scale);

                // Draw number if zoomed in enough
                if (scale > 15) {
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.font = `${scale / 2}px Outfit`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(colorId, px + scale / 2, py + scale / 2);
                }

                // Highlight cells matching selected color
                if (colorId === appState.selectedColorId) {
                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    ctx.fillRect(px, py, scale, scale);
                }
            }

            // Draw hint highlight
            if (appState.hintPixel && appState.hintPixel.x === x && appState.hintPixel.y === y) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.strokeRect(px, py, scale, scale);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fillRect(px, py, scale, scale);
            }
        }
    }

    ctx.restore();
}

// Events
function setupEventListeners() {
    const canvas = document.getElementById('game-canvas');

    // Prevent context menu to allow right-click panning
    canvas.oncontextmenu = (e) => e.preventDefault();

    canvas.onpointerdown = (e) => {
        canvas.setPointerCapture(e.pointerId);
        appState.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (appState.activePointers.size === 1) {
            // One pointer: could be Paint or Pan (if right click)
            if (e.pointerType === 'mouse' && e.button === 2) {
                // Right click = Pan start
                appState.isPanning = true;
            } else {
                // Left click or Touch = Paint start
                appState.isPainting = true;
                paintPixel(e.clientX, e.clientY);
            }
        } else if (appState.activePointers.size === 2) {
            // Two pointers: Always Pan/Zoom
            appState.isPainting = false;
            appState.isPanning = true;
            appState.lastPinchDistance = getPinchDistance();
        }

        appState.lastScreenX = e.clientX;
        appState.lastScreenY = e.clientY;
    };

    canvas.onpointermove = (e) => {
        if (!appState.activePointers.has(e.pointerId)) return;

        // Update pointer position
        appState.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (appState.isPainting && appState.activePointers.size === 1) {
            paintPixel(e.clientX, e.clientY);
        } else if (appState.isPanning || appState.activePointers.size === 2) {
            if (appState.activePointers.size === 2) {
                // Handle Zoom
                const currentDist = getPinchDistance();
                if (appState.lastPinchDistance && currentDist) {
                    const ratio = currentDist / appState.lastPinchDistance;
                    const oldScale = appState.scale;
                    appState.scale *= ratio;
                    appState.scale = Math.max(2, Math.min(150, appState.scale));

                    // Zoom towards center of two fingers
                    const center = getPinchCenter();
                    const rect = appState.container.getBoundingClientRect();
                    const zoomRatio = appState.scale / oldScale;

                    appState.offsetX = center.x - rect.left - (center.x - rect.left - appState.offsetX) * zoomRatio;
                    appState.offsetY = center.y - rect.top - (center.y - rect.top - appState.offsetY) * zoomRatio;
                }
                appState.lastPinchDistance = currentDist;

                // Handle Pan (average of two fingers)
                const center = getPinchCenter();
                const dx = center.x - appState.lastScreenX;
                const dy = center.y - appState.lastScreenY;
                appState.offsetX += dx;
                appState.offsetY += dy;
                appState.lastScreenX = center.x;
                appState.lastScreenY = center.y;
            } else {
                // Handle Single-finger/Right-click Pan
                const dx = e.clientX - appState.lastScreenX;
                const dy = e.clientY - appState.lastScreenY;
                appState.offsetX += dx;
                appState.offsetY += dy;
                appState.lastScreenX = e.clientX;
                appState.lastScreenY = e.clientY;
            }
        }
    };

    const handlePointerUp = (e) => {
        appState.activePointers.delete(e.pointerId);
        if (appState.activePointers.size < 2) {
            appState.lastPinchDistance = null;
        }
        if (appState.activePointers.size === 0) {
            appState.isPainting = false;
            appState.isPanning = false;
        }
    };

    canvas.onpointerup = handlePointerUp;
    canvas.onpointercancel = handlePointerUp;
    canvas.onpointerleave = handlePointerUp;

    canvas.onwheel = (e) => {
        e.preventDefault();
        const zoomSpeed = 0.001;
        const delta = -e.deltaY;
        const oldScale = appState.scale;

        appState.scale *= (1 + delta * zoomSpeed);
        appState.scale = Math.max(2, Math.min(150, appState.scale));

        const rect = appState.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const ratio = appState.scale / oldScale;
        appState.offsetX = mouseX - (mouseX - appState.offsetX) * ratio;
        appState.offsetY = mouseY - (mouseY - appState.offsetY) * ratio;
    };

    // Navigation
    document.getElementById('back-btn').onclick = () => {
        document.getElementById('game-view').classList.remove('active');
        document.getElementById('gallery-view').classList.add('active');
        appState.currentLevel = null;
    };
    // Zoom reset
    document.getElementById('zoom-reset-btn').onclick = centerImage;

    // Tools
    const wandBtn = document.getElementById('tool-wand');
    const bombBtn = document.getElementById('tool-bomb');
    const hintBtn = document.getElementById('tool-hint');

    if (wandBtn) wandBtn.onclick = () => {
        appState.selectedTool = appState.selectedTool === 'wand' ? null : 'wand';
        updateToolUI();
    };
    if (bombBtn) bombBtn.onclick = () => {
        appState.selectedTool = appState.selectedTool === 'bomb' ? null : 'bomb';
        updateToolUI();
    };
    if (hintBtn) hintBtn.onclick = useHint;
}

function updateToolUI() {
    const wandBtn = document.getElementById('tool-wand');
    const bombBtn = document.getElementById('tool-bomb');
    if (wandBtn) wandBtn.classList.toggle('active', appState.selectedTool === 'wand');
    if (bombBtn) bombBtn.classList.toggle('active', appState.selectedTool === 'bomb');
}

function useHint() {
    if (!appState.currentLevel) return;

    // Find unpainted pixel for current color
    let targetX = -1, targetY = -1;
    const { grid, width, height } = appState.currentLevel;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === appState.selectedColorId && !appState.paintedPixels.has(`${x},${y}`)) {
                targetX = x; targetY = y;
                break;
            }
        }
        if (targetX !== -1) break;
    }

    if (targetX !== -1) {
        // Zoom and Pan to this pixel
        appState.scale = 40; // Zoom in
        const containerW = appState.container.clientWidth;
        const containerH = appState.container.clientHeight;

        appState.offsetX = containerW / 2 - (targetX * appState.scale + appState.scale / 2);
        appState.offsetY = containerH / 2 - (targetY * appState.scale + appState.scale / 2);

        appState.hintPixel = { x: targetX, y: targetY };
        setTimeout(() => { appState.hintPixel = null; }, 3000);

        if (navigator.vibrate) navigator.vibrate(50);
    }
}

// Categories
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelector('.tab-btn.active').classList.remove('active');
        btn.classList.add('active');
        renderGallery(btn.dataset.category);
    };
});

// Paint Logic
function paintPixel(screenX, screenY) {
    if (!appState.currentLevel) return;

    const rect = appState.canvas.getBoundingClientRect(); // Use appState.canvas
    const x = Math.floor((screenX - rect.left - appState.offsetX) / appState.scale);
    const y = Math.floor((screenY - rect.top - appState.offsetY) / appState.scale);

    if (x >= 0 && x < appState.currentLevel.width && y >= 0 && y < appState.currentLevel.height) {
        if (appState.selectedTool === 'wand') {
            useMagicWand(x, y);
            appState.selectedTool = null;
            updateToolUI();
            return;
        }

        if (appState.selectedTool === 'bomb') {
            useBomb(x, y);
            appState.selectedTool = null;
            updateToolUI();
            return;
        }

        const colorId = appState.currentLevel.grid[y][x];
        if (colorId === appState.selectedColorId) {
            const pos = `${x},${y}`;
            if (!appState.paintedPixels.has(pos)) {
                appState.paintedPixels.add(pos);
                triggerHaptic();
                updateProgress();
            }
        }
    }
}

function triggerHaptic() {
    if (navigator.vibrate) {
        navigator.vibrate(15);
    }
}

function useMagicWand(startX, startY) {
    const targetColorId = appState.currentLevel.grid[startY][startX];
    if (targetColorId === 0) return;

    // Standard flood fill for connected region of SAME color number
    const stack = [[startX, startY]];
    const colorToFill = targetColorId;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const pos = `${x},${y}`;

        if (x < 0 || x >= appState.currentLevel.width || y < 0 || y >= appState.currentLevel.height) continue;
        if (appState.currentLevel.grid[y][x] !== colorToFill) continue;
        if (appState.paintedPixels.has(pos)) continue;

        appState.paintedPixels.add(pos);

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    updateProgress();
    checkWin(); // Check for win after using a tool
}

function useBomb(centerX, centerY) {
    const radius = 3; // 7x7 area
    let count = 0;

    for (let y = centerY - radius; y <= centerY + radius; y++) {
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            if (x >= 0 && x < appState.currentLevel.width && y >= 0 && y < appState.currentLevel.height) {
                const colorId = appState.currentLevel.grid[y][x];
                if (colorId !== 0) {
                    const pos = `${x},${y}`;
                    if (!appState.paintedPixels.has(pos)) {
                        appState.paintedPixels.add(pos);
                        count++;
                    }
                }
            }
        }
    }

    if (count > 0) {
        if (navigator.vibrate) navigator.vibrate(100);
        updateProgress();
        checkWin(); // Check for win after using a tool
    }
}

function getPinchDistance() {
    const pointers = Array.from(appState.activePointers.values());
    if (pointers.length < 2) return 0;
    const dx = pointers[0].x - pointers[1].x;
    const dy = pointers[0].y - pointers[1].y;
    return Math.sqrt(dx * dx + dy * dy);
}

function getPinchCenter() {
    const pointers = Array.from(appState.activePointers.values());
    if (pointers.length < 2) return pointers[0] || { x: 0, y: 0 };
    return {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2
    };
}

function updateProgress() {
    if (!appState.currentLevel) return;
    const total = appState.currentLevel.grid.flat().filter(c => c !== 0).length;
    const current = appState.paintedPixels.size;
    const percent = Math.floor((current / total) * 100);

    document.getElementById('progress-bar').style.width = `${percent}%`;
    document.getElementById('progress-text').innerText = `${percent}%`;

    // Save progress
    localStorage.setItem(`save_${appState.currentLevel.id}`, JSON.stringify(Array.from(appState.paintedPixels)));
}

function checkWin() {
    const total = appState.currentLevel.grid.flat().filter(c => c !== 0).length;
    if (appState.paintedPixels.size === total) {
        localStorage.setItem(`won_${appState.currentLevel.id}`, 'true');
        document.getElementById('success-overlay').classList.add('active');

        // Confetti!
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#60a5fa', '#a78bfa', '#facc15']
        });
    }
}

// Overlay controls
document.getElementById('close-modal-btn').onclick = () => {
    document.getElementById('success-overlay').classList.remove('active');
};

document.getElementById('next-btn').onclick = () => {
    document.getElementById('success-overlay').classList.remove('active');
    // Find next level logic...
    const idx = appState.levels.findIndex(l => l.id === appState.currentLevel.id);
    if (idx < appState.levels.length - 1) {
        loadLevel(appState.levels[idx + 1].id);
    } else {
        document.getElementById('back-btn').click();
    }
};

init();
