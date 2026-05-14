// Configuration
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const PIXEL_SIZE = 10; // Each empire pixel is 10x10 canvas pixels
const GRID_WIDTH = CANVAS_WIDTH / PIXEL_SIZE;
const GRID_HEIGHT = CANVAS_HEIGHT / PIXEL_SIZE;
const TICK_INTERVAL = 10; // 100ms = 0.1 seconds
const INITIAL_EMPIRES = 10;
const ATTACK_CHANCE = 0.80; // 80% chance to attack or grow each tick
const SPAWN_CHANCE = 0.001; // 0.1% chance per tick
const SPAWN_SIZE = Math.floor(Math.random() * 301) + 50; // pixels converted when new empire spawns
const DICE_SIDES = 12;
const WATER = 'WATER'; // Special value for water tiles
const WATER_THRESHOLD = 0.2; // 0-1, higher = more water

// Color palette for empires
const COLORS = [
    '#ff0000', '#6d0000', '#00fff2', '#007206', '#ffffff',
    '#ffcc00', '#57007c', '#1916f0', '#ff6a00', '#00ffae'
];

// Empire names
const EMPIRE_NAMES = [
    'Troy', 'Athens', 'Beijing', 'Cairo', 'Edo',
    'Kyoto', 'Sparta', 'Rome', 'Luxor', 'Constantinople',
    'Delphi', 'Nanjing', 'Marakesh', 'Timbuktu', 'Teotihuacan',
    'Tikal', 'Cusco', 'Jericho', 'Persepolis', 'Axum',
    'Babylon', 'Ur', 'Varanasi', 'Memphis', 'Thebes',
    'Knossos', 'Pompeii', 'Knidos', 'Petra', 'Nimrud',
    'Hattusa', 'Nineveh', 'Miletus', 'Jorvik', 'Seleucia',
    'Akkad', 'Byblos', 'Tyre', 'Aksum', 'Palmyra',
    'Pataliputra', 'Kandahar', 'Taxila', 'Uxmal', 'Chichen Itza',
    'Angkor', 'Xi an', 'Samarkand', 'Ai-Mo', 'Harappa',
    'Lalibela', 'Carthage', 'Aleppo', 'Ephesus'
];

// Game state
const gameState = {
    grid: [],
    empires: {},
    tick: 0,
    isRunning: true,
    speedMultiplier: 1
};

let gameLoopInterval = null;

// Initialize canvas and game
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Simple Perlin-like noise function with seed
function perlinNoise(x, y, scale = 50, seed = 0) {
    const xi = Math.floor(x / scale);
    const yi = Math.floor(y / scale);
    const xf = (x % scale) / scale;
    const yf = (y % scale) / scale;

    const hash = (a, b) => {
        let h = Math.sin(a * 12.9898 + b * 78.233 + seed * 45.164) * 43758.5453;
        return h - Math.floor(h);
    };

    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;

    const u = fade(xf);
    const v = fade(yf);

    const n00 = hash(xi, yi);
    const n10 = hash(xi + 1, yi);
    const n01 = hash(xi, yi + 1);
    const n11 = hash(xi + 1, yi + 1);

    const nx0 = lerp(n00, n10, u);
    const nx1 = lerp(n01, n11, u);
    return lerp(nx0, nx1, v);
}

// Generate a similar color by slightly modifying RGB values
function getSimilarColor(baseColor) {
    let r = parseInt(baseColor.slice(1, 3), 16);
    let g = parseInt(baseColor.slice(3, 5), 16);
    let b = parseInt(baseColor.slice(5, 7), 16);

    // Modify by -30 to +30 for noticeable but similar variation
    r = Math.max(0, Math.min(255, r + (Math.random() - 0.5) * 60));
    g = Math.max(0, Math.min(255, g + (Math.random() - 0.5) * 60));
    b = Math.max(0, Math.min(255, b + (Math.random() - 0.5) * 60));

    return '#' + Math.floor(r).toString(16).padStart(2, '0') +
        Math.floor(g).toString(16).padStart(2, '0') +
        Math.floor(b).toString(16).padStart(2, '0');
}

// Generate map with a single jagged island surrounded by water
function generateMapWithWater() {
    const seed = Math.random() * 10000;
    const centerX = GRID_WIDTH / 2 + (Math.random() * 0.2 - 0.1) * GRID_WIDTH;
    const centerY = GRID_HEIGHT / 2 + (Math.random() * 0.2 - 0.1) * GRID_HEIGHT;
    const baseRadius = Math.min(GRID_WIDTH, GRID_HEIGHT) * (0.36 + Math.random() * 0.12);
    // Edge jitter controls how jagged the coastline is - higher = more jagged
    const edgeJitter = baseRadius * 0.50;
    const noiseScale = 14 + Math.random() * 30; // Larger scale = smoother coastlines, smaller = more detail

    const waterMap = Array(GRID_HEIGHT).fill().map(() => Array(GRID_WIDTH).fill(null));

    // Generate a single island shape using radial distance and layered noise for sharper edges
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const coarse = perlinNoise(x * 1.3, y * 1.3, noiseScale, seed) * 2 - 1;
            const fine = perlinNoise(x * 3.6, y * 3.6, noiseScale / 2, seed + 42) * 2 - 1;
            const noise = coarse * 0.7 + fine * 0.3;
            const threshold = baseRadius + noise * edgeJitter;
            if (dist > threshold) {
                waterMap[y][x] = WATER;
            }
        }
    }

    // Remove any interior lakes so land is continuous and no water exists inside the island
    const oceanVisited = floodFillOcean(waterMap);
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (waterMap[y][x] === WATER && !oceanVisited.has(`${x},${y}`)) {
                waterMap[y][x] = null;
            }
        }
    }

    // Keep only the largest connected landmass around the center and remove stray islands
    const startLand = findNearestLand(waterMap, centerX, centerY);
    if (startLand) {
        const mainLand = floodFillLandMap(waterMap, startLand.x, startLand.y);
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (waterMap[y][x] !== WATER && !mainLand.has(`${x},${y}`)) {
                    waterMap[y][x] = WATER;
                }
            }
        }
    }

    return waterMap;
}

function floodFillOcean(waterMap) {
    const visited = new Set();
    const queue = [];

    for (let x = 0; x < GRID_WIDTH; x++) {
        if (waterMap[0][x] === WATER) { visited.add(`${x},0`); queue.push([x, 0]); }
        if (waterMap[GRID_HEIGHT - 1][x] === WATER) { visited.add(`${x},${GRID_HEIGHT - 1}`); queue.push([x, GRID_HEIGHT - 1]); }
    }
    for (let y = 0; y < GRID_HEIGHT; y++) {
        if (waterMap[y][0] === WATER) { visited.add(`0,${y}`); queue.push([0, y]); }
        if (waterMap[y][GRID_WIDTH - 1] === WATER) { visited.add(`${GRID_WIDTH - 1},${y}`); queue.push([GRID_WIDTH - 1, y]); }
    }

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT &&
                !visited.has(key) && waterMap[ny][nx] === WATER) {
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
    }
    return visited;
}

function findNearestLand(waterMap, cx, cy) {
    const startX = Math.round(cx);
    const startY = Math.round(cy);
    const visited = new Set();
    const queue = [[startX, startY]];
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT && waterMap[y][x] !== WATER) {
            return { x, y };
        }
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT && !visited.has(key)) {
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
    }
    return null;
}

function floodFillLandMap(waterMap, startX, startY) {
    const visited = new Set();
    const queue = [[startX, startY]];
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT &&
                !visited.has(key) && waterMap[ny][nx] !== WATER) {
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
    }
    return visited;
}

// Count reachable land tiles using flood fill
function countReachableLand(waterMap, startX, startY) {
    const visited = new Set();
    const queue = [[startX, startY]];
    visited.add(`${startX},${startY}`);
    let count = 1;

    while (queue.length > 0) {
        const [x, y] = queue.shift();

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;

            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT &&
                !visited.has(key) && waterMap[ny][nx] !== WATER) {
                visited.add(key);
                queue.push([nx, ny]);
                count++;
            }
        }
    }
    return count;
}

// Flood fill to verify connectivity (legacy function, kept for compatibility)
function floodFillLand(waterMap, startX, startY) {
    const visited = new Set();
    const queue = [[startX, startY]];
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const [x, y] = queue.shift();

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;

            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT &&
                !visited.has(key) && waterMap[ny][nx] !== WATER) {
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
    }
}

function initializeGame() {
    // Hide game over message
    document.getElementById('gameOverMsg').style.display = 'none';
    gameState.isRunning = true;

    // Generate map with water
    const waterMap = generateMapWithWater();

    // Create grid with water already placed
    gameState.grid = Array(GRID_HEIGHT).fill().map((_, y) =>
        Array(GRID_WIDTH).fill().map((_, x) => waterMap[y][x])
    );

    gameState.empires = {};
    gameState.tick = 0;

    // Spawn initial empires on land only
    let empireCount = 0;
    let attempts = 0;
    while (empireCount < INITIAL_EMPIRES && attempts < 500) {
        const x = Math.floor(Math.random() * GRID_WIDTH);
        const y = Math.floor(Math.random() * GRID_HEIGHT);

        if (gameState.grid[y][x] === null) {
            const color = COLORS[empireCount];
            spawnEmpire(x, y, color, 1);
            empireCount++;
        }
        attempts++;
    }
}

function spawnEmpire(startX, startY, color, pixelsToSpawn) {
    if (!gameState.empires[color]) {
        // Generate a random name for the empire
        const availableNames = EMPIRE_NAMES.filter(name =>
            !Object.values(gameState.empires).some(empire => empire.name === name)
        );
        const empireName = availableNames.length > 0
            ? availableNames[Math.floor(Math.random() * availableNames.length)]
            : `Empire ${Object.keys(gameState.empires).length + 1}`;

        gameState.empires[color] = {
            color: color,
            name: empireName,
            pixels: new Set(),
            lastAttackTick: -1
        };
    }

    let spawned = 0;
    const empire = gameState.empires[color];
    const maxAttempts = pixelsToSpawn * 10;
    let attempts = 0;

    // Spawn pixels in a tight cluster (within ~5-7 pixel radius)
    while (spawned < pixelsToSpawn && attempts < maxAttempts) {
        const offsetX = Math.floor((Math.random() - 0.5) * 10);
        const offsetY = Math.floor((Math.random() - 0.5) * 10);
        const x = startX + offsetX;
        const y = startY + offsetY;

        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT && gameState.grid[y][x] === null) {
            gameState.grid[y][x] = color;
            empire.pixels.add(`${x},${y}`);
            spawned++;
        }
        attempts++;
    }
}

function calculatePower(color) {
    if (!gameState.empires[color]) return 0;
    const pixelCount = gameState.empires[color].pixels.size;
    return Math.floor(pixelCount / 100);
}

function rollDice() {
    return Math.floor(Math.random() * DICE_SIDES) + 1;
}

function getAdjacentPixels(x, y) {
    const adjacent = [];
    const directions = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
            adjacent.push({ x: nx, y: ny });
        }
    }
    return adjacent;
}

function performAttack(attacker, targetX, targetY) {
    const defender = gameState.grid[targetY][targetX];

    // Cannot attack water
    if (defender === WATER) return;

    if (defender === attacker) return;

    // Check for surrender if defender is an empire and attacker is 5x larger
    if (defender !== null && defender !== WATER) {
        const attackerSize = gameState.empires[attacker].pixels.size;
        const defenderSize = gameState.empires[defender].pixels.size;

        // If attacker is 5x or more the size of defender, chance of surrender scales with size difference
        if (attackerSize >= defenderSize * 5) {
            const sizeRatio = attackerSize / defenderSize;
            // Base chance of 0.001% at 5x, increases linearly with ratio
            const baseChance = 0.00001; // 0.001% at exactly 5x
            const surrenderChance = baseChance * (sizeRatio / 5);

            if (Math.random() < surrenderChance) {
                // Defender surrenders - delete the entire empire and leave neutral territory
                const defenderPixels = Array.from(gameState.empires[defender].pixels);
                defenderPixels.forEach(pixel => {
                    const [x, y] = pixel.split(',').map(Number);
                    gameState.grid[y][x] = null; // Convert to neutral
                });
                delete gameState.empires[defender];
                return; // Attack ends with surrender
            }
        }
    }

    const attackerPower = calculatePower(attacker);
    // Empty space (null) gets 0 power, but gets a die roll bonus
    const defenderPower = defender === null ? 0 : calculatePower(defender);

    const attackRoll = rollDice() + attackerPower;
    // Empty space gets a die roll, but no power bonus
    const defendRoll = rollDice() + (defender === null ? 0 : defenderPower);

    if (attackRoll > defendRoll) {
        // Attacker wins - convert pixel
        if (defender !== null && defender !== WATER) {
            gameState.empires[defender].pixels.delete(`${targetX},${targetY}`);
            if (gameState.empires[defender].pixels.size === 0) {
                delete gameState.empires[defender];
            }
        }

        gameState.grid[targetY][targetX] = attacker;
        gameState.empires[attacker].pixels.add(`${targetX},${targetY}`);
    }
    // If defend wins or ties (including empty space resistance), nothing happens
}

function randomEmpireSpawn() {
    // 0.1% chance per tick
    if (Math.random() > SPAWN_CHANCE) return;

    // Pick random empire to spawn from
    const empireColors = Object.keys(gameState.empires);
    if (empireColors.length === 0) return;

    const sourceColor = empireColors[Math.floor(Math.random() * empireColors.length)];
    const sourceEmpire = gameState.empires[sourceColor];

    if (sourceEmpire.pixels.size === 0) return;

    // Pick random pixel from source empire
    const pixelsArray = Array.from(sourceEmpire.pixels);
    const randomPixel = pixelsArray[Math.floor(Math.random() * pixelsArray.length)];
    const [sx, sy] = randomPixel.split(',').map(Number);

    // Generate a random color (any color including gray)
    const newColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    // Spawn the new empire as a tight group
    spawnEmpire(sx, sy, newColor, SPAWN_SIZE);
}

function simulateTick() {
    // Each empire has 25% chance to attack/grow each tick
    const empireColors = Object.keys(gameState.empires);

    for (const color of empireColors) {
        if (Math.random() > ATTACK_CHANCE) continue;

        const empire = gameState.empires[color];
        if (empire.pixels.size === 0) continue;

        // Pick a random pixel to attack from
        const pixelsArray = Array.from(empire.pixels);
        const randomPixel = pixelsArray[Math.floor(Math.random() * pixelsArray.length)];
        const [px, py] = randomPixel.split(',').map(Number);

        // Get adjacent pixels
        const adjacent = getAdjacentPixels(px, py);

        // Find adjacent pixels of any other type (enemy empires or empty space, but NOT water)
        const targets = adjacent.filter(adj => {
            const targetColor = gameState.grid[adj.y][adj.x];
            return targetColor !== color && targetColor !== WATER;
        });

        if (targets.length > 0) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            performAttack(color, target.x, target.y);
        }
    }

    // Random empire spawn
    randomEmpireSpawn();

    // Clean up empires with no pixels
    for (const color of Object.keys(gameState.empires)) {
        if (gameState.empires[color].pixels.size === 0) {
            delete gameState.empires[color];
        }
    }

    // Civil war check - 0.001% chance per empire per tick
    for (const color of Object.keys(gameState.empires)) {
        if (Math.random() < 0.00001) { // 0.001%
            const empire = gameState.empires[color];
            const pixels = Array.from(empire.pixels);

            if (pixels.length < 10) continue; // Too small to split

            const numParts = Math.floor(Math.random() * 4) + 2; // 2-5 parts
            const groups = Array.from({ length: numParts }, () => []);

            // Distribute pixels evenly among groups
            pixels.forEach((pixel, index) => {
                groups[index % numParts].push(pixel);
            });

            // Remove old empire
            delete gameState.empires[color];

            // Create new empires with similar colors and preserve the original name
            groups.forEach(group => {
                if (group.length > 0) {
                    const newColor = getSimilarColor(color);
                    gameState.empires[newColor] = {
                        color: newColor,
                        name: empire.name,
                        pixels: new Set(group),
                        lastAttackTick: -1
                    };
                }
            });
        }
    }

    // Check for game over (only 1 empire remains)
    const empireCount = Object.keys(gameState.empires).length;
    if (empireCount === 1) {
        gameState.isRunning = false;
        const winner = Object.keys(gameState.empires)[0];
        const winnerEmpire = gameState.empires[winner];
        showGameOver(`${winnerEmpire.name} has conquered the world with ${winnerEmpire.pixels.size} territories!`);
    } else if (empireCount === 0) {
        gameState.isRunning = false;
        showGameOver('All empires eliminated!');
    }

    gameState.tick++;
}

function showGameOver(message) {
    const gameOverMsg = document.getElementById('gameOverMsg');
    gameOverMsg.textContent = `GAME OVER\n${message}`;
    gameOverMsg.style.display = 'block';
}

function drawWorldMapBackground() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const scaleX = CANVAS_WIDTH / 1200;
    const scaleY = CANVAS_HEIGHT / 800;
    ctx.scale(scaleX, scaleY);

    ctx.beginPath();
    ctx.moveTo(120, 210);
    ctx.lineTo(190, 175);
    ctx.lineTo(260, 190);
    ctx.lineTo(320, 240);
    ctx.lineTo(325, 310);
    ctx.lineTo(300, 360);
    ctx.lineTo(250, 390);
    ctx.lineTo(190, 380);
    ctx.lineTo(145, 330);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(300, 390);
    ctx.lineTo(330, 460);
    ctx.lineTo(310, 530);
    ctx.lineTo(270, 580);
    ctx.lineTo(230, 565);
    ctx.lineTo(210, 520);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(420, 210);
    ctx.lineTo(470, 190);
    ctx.lineTo(520, 195);
    ctx.lineTo(560, 225);
    ctx.lineTo(560, 280);
    ctx.lineTo(520, 330);
    ctx.lineTo(470, 370);
    ctx.lineTo(440, 425);
    ctx.lineTo(430, 470);
    ctx.lineTo(470, 520);
    ctx.lineTo(520, 520);
    ctx.lineTo(550, 470);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(530, 180);
    ctx.lineTo(620, 175);
    ctx.lineTo(690, 200);
    ctx.lineTo(760, 240);
    ctx.lineTo(800, 260);
    ctx.lineTo(880, 265);
    ctx.lineTo(900, 230);
    ctx.lineTo(920, 200);
    ctx.lineTo(970, 205);
    ctx.lineTo(1020, 240);
    ctx.lineTo(1050, 280);
    ctx.lineTo(1040, 330);
    ctx.lineTo(990, 385);
    ctx.lineTo(930, 420);
    ctx.lineTo(880, 420);
    ctx.lineTo(840, 390);
    ctx.lineTo(820, 340);
    ctx.lineTo(780, 320);
    ctx.lineTo(740, 330);
    ctx.lineTo(720, 360);
    ctx.lineTo(700, 410);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(940, 520);
    ctx.lineTo(980, 540);
    ctx.lineTo(1030, 560);
    ctx.lineTo(1060, 620);
    ctx.lineTo(1040, 670);
    ctx.lineTo(990, 680);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#08121f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const cell = gameState.grid[y][x];
            if (cell === WATER) {
                ctx.fillStyle = '#1a4d7a';
                ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            } else if (cell !== null) {
                ctx.fillStyle = cell;
                ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }
    }

    // Draw black outline around water/land boundary
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (gameState.grid[y][x] !== WATER) continue;

            const px = x * PIXEL_SIZE;
            const py = y * PIXEL_SIZE;
            const neighbors = [
                { dx: 0, dy: -1, x1: px, y1: py, x2: px + PIXEL_SIZE, y2: py },
                { dx: 0, dy: 1, x1: px, y1: py + PIXEL_SIZE, x2: px + PIXEL_SIZE, y2: py + PIXEL_SIZE },
                { dx: -1, dy: 0, x1: px, y1: py, x2: px, y2: py + PIXEL_SIZE },
                { dx: 1, dy: 0, x1: px + PIXEL_SIZE, y1: py, x2: px + PIXEL_SIZE, y2: py + PIXEL_SIZE }
            ];

            for (const edge of neighbors) {
                const nx = x + edge.dx;
                const ny = y + edge.dy;
                if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) {
                    continue;
                }
                const neighborCell = gameState.grid[ny][nx];
                if (neighborCell !== WATER) {
                    ctx.beginPath();
                    ctx.moveTo(edge.x1, edge.y1);
                    ctx.lineTo(edge.x2, edge.y2);
                    ctx.stroke();
                }
            }
        }
    }

    // Draw grid lines (faint)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= GRID_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * PIXEL_SIZE, 0);
        ctx.lineTo(x * PIXEL_SIZE, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * PIXEL_SIZE);
        ctx.lineTo(CANVAS_WIDTH, y * PIXEL_SIZE);
        ctx.stroke();
    }
}

function updateStats() {
    const statsPanel = document.getElementById('statsPanel');
    const empireColors = Object.keys(gameState.empires).sort((a, b) => {
        return gameState.empires[b].pixels.size - gameState.empires[a].pixels.size;
    });

    let html = '';
    for (const color of empireColors) {
        const empire = gameState.empires[color];
        const pixelCount = empire.pixels.size;
        const power = calculatePower(color);
        //Territories now shows number of pixels, and power is calculated as 1 power per 100 pixels for better scaling and to give more meaningful numbers to track as empires grow larger.
        html += `
            <div class="stat-item" style="border-left-color: ${color}">
                <div><strong>${empire.name}</strong></div>
                <div>${pixelCount} territories</div>
                <div>Power: +${power}</div>
            </div>
        `;
    }

    statsPanel.innerHTML = html;
    document.getElementById('tickCounter').textContent = `Tick: ${gameState.tick}`;
}

function gameLoop() {
    if (gameState.isRunning) {
        simulateTick();
    }
    draw();
    updateStats();
}

// Event listeners
document.getElementById('toggleBtn').addEventListener('click', () => {
    gameState.isRunning = !gameState.isRunning;
    document.getElementById('toggleBtn').textContent = gameState.isRunning ? 'Pause Simulation' : 'Resume Simulation';
});

document.getElementById('resetBtn').addEventListener('click', () => {
    initializeGame();
    draw();
    updateStats();
});

document.getElementById('genMapBtn').addEventListener('click', () => {
    initializeGame();
    draw();
    updateStats();
});

function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    const actualInterval = TICK_INTERVAL / gameState.speedMultiplier;
    gameLoopInterval = setInterval(gameLoop, actualInterval);
    document.getElementById('speedDisplay').textContent = `Speed: ${gameState.speedMultiplier}x`;
}

document.getElementById('speedUpBtn').addEventListener('click', () => {
    gameState.speedMultiplier = Math.min(gameState.speedMultiplier * 2, 1024);
    startGameLoop();
});

document.getElementById('speedDownBtn').addEventListener('click', () => {
    gameState.speedMultiplier = Math.max(gameState.speedMultiplier / 2, 0.25);
    startGameLoop();
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
    const canvas = document.getElementById('canvas');
    if (canvas.requestFullscreen) {
        canvas.requestFullscreen();
    } else if (canvas.mozRequestFullScreen) {
        canvas.mozRequestFullScreen();
    } else if (canvas.webkitRequestFullscreen) {
        canvas.webkitRequestFullscreen();
    } else if (canvas.msRequestFullscreen) {
        canvas.msRequestFullscreen();
    }
});

// Start the game
initializeGame();
draw();
updateStats();
startGameLoop();
