const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let grid = 3;          // taille d'une face du cube : grid x grid cases
const TILE = 100;      // taille d'une case en unités locales
const SIDES = ["top", "right", "bottom", "left"];

const COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4",
];

// ---------------------------------------------------------------------------
// Plateaux : les faces du cube et la grille de départ.
// Chaque face est placée dans l'espace 3D du cube (coordonnées 0..grid) :
// la case (col, row) a pour coin origin + col * u + row * v.
// Les dimensions sont fixées par setupBoards() au début de chaque partie.
// ---------------------------------------------------------------------------

// Faces visibles depuis le coin (grid, grid, grid) : vue 0
const FRONT_FACES = [
  { name: "top", shade: 0, corner: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { name: "left", shade: 0.2, corner: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1] },
  { name: "right", shade: 0.35, corner: [1, 1, 1], u: [0, -1, 0], v: [0, 0, -1] },
];

// Vue 1 : l'intérieur du cube, vu sous le même angle que la vue 0 mais sans
// les 3 faces avant. On voit le sol (z = 0) et les deux murs du fond (x = 0,
// y = 0), chacun à l'emplacement exact qu'il occupe derrière les faces avant.
// Les axes u, v sont choisis pour que les cases ne soient pas retournées à
// l'écran (u x v pointe vers l'intérieur, puisqu'on les regarde de dedans).
const BACK_FACES = [
  { name: "floor", shade: 0.1, corner: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  { name: "back-left", shade: 0.3, corner: [0, 1, 1], u: [0, -1, 0], v: [0, 0, -1] },
  { name: "back-right", shade: 0.45, corner: [0, 0, 1], u: [1, 0, 0], v: [0, 0, -1] },
];

const ALL_FACES = [
  ...FRONT_FACES.map((face) => ({ ...face, view: 0, cube: true })),
  ...BACK_FACES.map((face) => ({ ...face, view: 1, cube: true })),
];

// Grille de départ : (nombre de faces * grid) colonnes x grid lignes
const startBoard = { name: "start", shade: 0, cube: false };

let faces = [];   // faces utilisées dans la partie (3 ou 6)
let boards = [];  // faces + grille de départ

// Point 3D d'une face en coordonnées de case (col, row)
function facePoint(face, col, row) {
  return face.origin.map((o, k) => o + col * face.u[k] + row * face.v[k]);
}

// Clé unique d'une arête 3D (indépendante du sens de parcours)
function edgeKey(a, b) {
  const ka = a.join(","), kb = b.join(",");
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

// Les 4 arêtes d'une case, dans l'ordre de SIDES
function cellEdges(face, index) {
  const c = index % face.cols;
  const r = Math.floor(index / face.cols);
  const p = (dc, dr) => facePoint(face, c + dc, r + dr);
  return {
    top: edgeKey(p(0, 0), p(1, 0)),
    right: edgeKey(p(1, 0), p(1, 1)),
    bottom: edgeKey(p(0, 1), p(1, 1)),
    left: edgeKey(p(0, 0), p(0, 1)),
  };
}

// Pour chaque arête 3D : la liste des (face, case, côté) qui la partagent.
// Les arêtes communes à deux faces du cube relient des cases de faces différentes.
const edgeMap = new Map();

function setupBoards(n, faceCount) {
  grid = n;
  faces = ALL_FACES.slice(0, faceCount);
  boards = [...faces, startBoard];
  faces.forEach((face) => {
    face.origin = face.corner.map((k) => k * n);
    face.cols = n;
    face.rows = n;
    face.cells = Array(n * n).fill(null);
  });
  startBoard.cols = faceCount * n;
  startBoard.rows = n;

  edgeMap.clear();
  faces.forEach((face) => {
    face.cells.forEach((_, index) => {
      const edges = cellEdges(face, index);
      SIDES.forEach((side) => {
        if (!edgeMap.has(edges[side])) edgeMap.set(edges[side], []);
        edgeMap.get(edges[side]).push({ face, index, side });
      });
    });
  });
}

// Cases voisines d'une case du cube : [{ side, face, index, side: côté voisin }]
function neighbors(face, index) {
  const edges = cellEdges(face, index);
  const result = [];
  SIDES.forEach((side) => {
    edgeMap.get(edges[side]).forEach((n) => {
      if (n.face !== face || n.index !== index) {
        result.push({ side, face: n.face, index: n.index, otherSide: n.side });
      }
    });
  });
  return result;
}

// ---------------------------------------------------------------------------
// Génération : on tire une valeur par arête 3D, ce qui donne un cube résolu
// (y compris sur les arêtes communes à deux faces), puis on mélange les tuiles.
// ---------------------------------------------------------------------------

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function generateTiles() {
  const values = new Map();
  edgeMap.forEach((_, key) => values.set(key, Math.floor(Math.random() * 10)));
  const tiles = [];
  faces.forEach((face) => {
    face.cells.forEach((_, index) => {
      const edges = cellEdges(face, index);
      const tile = {};
      SIDES.forEach((side) => (tile[side] = values.get(edges[side])));
      tiles.push(tile);
      face.solution[index] = tile;
    });
  });
  return shuffle(tiles);
}

function newGame(n, faceCount) {
  setupBoards(n, faceCount);
  faces.forEach((face) => (face.solution = []));
  startBoard.cells = generateTiles();
  resetUiState();
  message = "";
}

// ---------------------------------------------------------------------------
// Sauvegarde automatique dans le localStorage du navigateur
// ---------------------------------------------------------------------------

const SAVE_KEY = "cube-tetravex-save";

function saveGame() {
  const state = {
    grid,
    faceCount: faces.length,
    faces: faces.map((face) => ({ cells: face.cells, solution: face.solution })),
    start: startBoard.cells,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // Stockage indisponible (navigation privée, quota...) : on joue sans sauvegarde
  }
}

// Restaure la partie sauvegardée ; renvoie false s'il n'y en a pas de valide
function loadGame() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    return false;
  }
  if (!state || ![1, 2, 3, 4].includes(state.grid) || ![3, 6].includes(state.faceCount)) {
    return false;
  }
  const n = state.grid;
  const cellsOk = (cells, length) => Array.isArray(cells) && cells.length === length;
  if (!cellsOk(state.faces, state.faceCount) || !cellsOk(state.start, state.faceCount * n * n) ||
      !state.faces.every((f) => cellsOk(f.cells, n * n) && cellsOk(f.solution, n * n))) {
    return false;
  }

  setupBoards(n, state.faceCount);
  faces.forEach((face, i) => {
    face.cells = state.faces[i].cells;
    face.solution = state.faces[i].solution;
  });
  startBoard.cells = state.start;
  resetUiState();
  message = isSolved() ? "Well done, the cube is solved!" : "";
  return true;
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

// Une case du cube est valide si sa tuile correspond à toutes ses voisines posées
function cellIsValid(face, index) {
  const tile = face.cells[index];
  if (!tile) return true;
  return neighbors(face, index).every((n) => {
    const other = n.face.cells[n.index];
    return !other || other[n.otherSide] === tile[n.side];
  });
}

// Déplace (ou échange) la tuile de src vers dst ; annule si le cube devient invalide.
// Avec dryRun, se contente de dire si le mouvement serait accepté.
function tryMove(src, dst, dryRun = false) {
  const a = src.board.cells[src.index];
  const b = dst.board.cells[dst.index];
  src.board.cells[src.index] = b;
  dst.board.cells[dst.index] = a;

  const ok = [src, dst].every((s) => !s.board.cube || cellIsValid(s.board, s.index));
  if (!ok || dryRun) {
    src.board.cells[src.index] = a;
    dst.board.cells[dst.index] = b;
  }
  return ok;
}

function isSolved() {
  return faces.every((face) => face.cells.every((tile) => tile));
}

// ---------------------------------------------------------------------------
// Indices : on compare le cube à la solution générée.
// Deux tuiles identiques sont interchangeables, on compare donc les valeurs.
// ---------------------------------------------------------------------------

function sameTile(a, b) {
  return SIDES.every((side) => a[side] === b[side]);
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Toutes les cases du cube : [{ board, index }]
function cubeCells() {
  return faces.flatMap((face) => face.cells.map((_, index) => ({ board: face, index })));
}

// Trouve, hors du cube, une tuile qui correspond à la solution de la case donnée
function findTileFor(cell) {
  const wanted = cell.board.solution[cell.index];
  const index = startBoard.cells.findIndex((tile) => tile && sameTile(tile, wanted));
  return index >= 0 ? { board: startBoard, index } : null;
}

function computeHint() {
  const cells = cubeCells();
  const placed = cells.filter((c) => c.board.cells[c.index]);
  const wrong = placed.filter((c) => !sameTile(c.board.cells[c.index], c.board.solution[c.index]));

  if (wrong.length > 0) {
    return { cells: [{ ...randomItem(wrong), color: "#ff9a1f" }], text: "Hint: this tile is in the wrong place." };
  }

  let targets;
  if (placed.length === 0) {
    targets = cells;
  } else {
    // Cases vides voisines d'une tuile déjà (bien) placée
    targets = cells.filter(
      (c) => !c.board.cells[c.index] &&
        neighbors(c.board, c.index).some((n) => n.face.cells[n.index])
    );
  }
  if (targets.length === 0) return { cells: [], text: "The cube is already solved!" };

  const target = randomItem(targets);
  const source = findTileFor(target);
  return {
    cells: [{ ...source, color: "#2fd0ff" }, { ...target, color: "#2fd0ff" }],
    text: "Hint: place the tile outlined in blue on the blue cell of the cube.",
  };
}

// ---------------------------------------------------------------------------
// Disposition à l'écran : chaque plateau reçoit une transformation affine
// (origin, u, v) qui envoie une case locale vers l'écran.
// ---------------------------------------------------------------------------

function layout() {
  const w = canvas.width;
  const h = canvas.height;

  // Une ou deux vues du cube en haut (hauteur 2*grid cases, largeur
  // 2*grid*cos30 cases chacune, séparées d'une case), la grille de départ en
  // bas (grid lignes). On garde une bande en haut pour les boutons.
  const cos30 = Math.cos(Math.PI / 6);
  const views = faces.length / 3;
  // Les écarts (GAP cases) laissent la place aux nombres attendus autour des cubes
  const GAP = 1.5;
  const cubesWidth = views * 2 * grid * cos30 + (views - 1) * GAP;
  const L = Math.min(
    (h - 64 - 16) / (2 * grid + GAP + startBoard.rows + 0.5),
    w / (Math.max(cubesWidth, startBoard.cols) + 1)
  );
  const top = 64 + L / 2;

  // Projection isométrique, la même pour les deux vues : les coins (0, 0, 0)
  // et (grid, grid, grid) se projettent tous deux sur le centre de la vue.
  const axes = [
    { x: L * cos30, y: L / 2 },  // axe x du cube (vers la droite-bas)
    { x: -L * cos30, y: L / 2 }, // axe y du cube (vers la gauche-bas)
    { x: 0, y: -L },             // axe z du cube (vers le haut)
  ];
  const centerY = top + grid * L;
  const step = 2 * grid * cos30 * L + GAP * L; // écart entre les centres des deux vues
  const centers = Array.from({ length: views }, (_, i) => ({
    x: w / 2 + (i - (views - 1) / 2) * step,
    y: centerY,
  }));
  const project = (p, base) => ({
    x: base.x + p[0] * axes[0].x + p[1] * axes[1].x + p[2] * axes[2].x,
    y: base.y + p[0] * axes[0].y + p[1] * axes[1].y + p[2] * axes[2].y,
  });
  const zero = { x: 0, y: 0 };

  faces.forEach((face) => {
    face.screen = {
      origin: project(face.origin, centers[face.view]),
      u: project(face.u, zero),
      v: project(face.v, zero),
    };
    // Position de la face dans l'autre vue, pour le mode transparence
    if (views === 2) {
      face.otherScreen = { ...face.screen, origin: project(face.origin, centers[1 - face.view]) };
    }
  });

  // Nom des vues, affiché sous chaque cube quand il y en a deux
  const labels = views === 2
    ? [
        { text: "Outside view", x: centers[0].x, y: centerY + grid * L + L },
        { text: "Inside view", x: centers[1].x, y: centerY + grid * L + L },
      ]
    : [];

  startBoard.screen = {
    origin: { x: (w - startBoard.cols * L) / 2, y: centerY + grid * L + GAP * L },
    u: { x: L, y: 0 },
    v: { x: 0, y: L },
  };

  return { L, labels };
}

// Retrouve la case sous un point écran en inversant la transformation du plateau
function hitTest(x, y) {
  for (const board of boards) {
    const { origin, u, v } = board.screen;
    const det = u.x * v.y - u.y * v.x;
    const dx = x - origin.x;
    const dy = y - origin.y;
    const col = (dx * v.y - dy * v.x) / det;
    const row = (u.x * dy - u.y * dx) / det;
    if (col >= 0 && col < board.cols && row >= 0 && row < board.rows) {
      return { board, index: Math.floor(row) * board.cols + Math.floor(col) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// État de l'interface
// ---------------------------------------------------------------------------

let selected = null;   // { board, index } : tuile sélectionnée (clic ou glisser)
let hover = null;      // { board, index } : case sous le pointeur
let drag = null;       // { src, startX, startY, x, y, moved } : glisser-déposer en cours
let shake = null;      // { board, index, start } : case refusée, qui tremble
let animations = [];   // tuiles en mouvement : { tile, from, to, start }
let confetti = [];     // particules de l'effet de victoire
let message = "";
let hint = [];         // [{ board, index, color }] : cases mises en évidence par l'indice
let transparency = false; // mode 6 faces : voir le cube entier en transparence

// Aides visuelles activables dans le panneau Options
const options = {
  hoverLinks: false,     // survol : voisines dans l'autre vue
  validTargets: false,   // cases où la tuile sélectionnée peut être posée
  ghostNeighbors: true,  // tuiles voisines en transparence au bord des faces
  sound: true,           // effets sonores
};

const MOVE_DURATION = 250;   // ms
const SHAKE_DURATION = 450;  // ms
const DRAG_THRESHOLD = 6;    // px parcourus avant qu'un appui devienne un glisser

function resetUiState() {
  selected = null;
  hover = null;
  drag = null;
  shake = null;
  animations = [];
  confetti = [];
  hint = [];
}

const sameCell = (a, b) => a && b && a.board === b.board && a.index === b.index;

// Transformation écran d'une case : son coin et les vecteurs d'une case
function cellTransform(board, index) {
  const { origin, u, v } = board.screen;
  const col = index % board.cols;
  const row = Math.floor(index / board.cols);
  return {
    origin: { x: origin.x + col * u.x + row * v.x, y: origin.y + col * u.y + row * v.y },
    u,
    v,
  };
}

// Transformation d'une tuile tenue sous le pointeur : un carré à plat, centré
function pointerTransform(x, y) {
  const L = startBoard.screen.u.x;
  return { origin: { x: x - L / 2, y: y - L / 2 }, u: { x: L, y: 0 }, v: { x: 0, y: L } };
}

function lerpTransform(a, b, t) {
  const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  return { origin: lerp(a.origin, b.origin), u: lerp(a.u, b.u), v: lerp(a.v, b.v) };
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Cases dont la tuile ne doit pas être dessinée à sa place : tuile tenue,
// ou tuile encore en route vers sa case
function isHidden(board, index) {
  if (drag && drag.moved && sameCell(drag.src, { board, index })) return true;
  return animations.some((a) => sameCell(a.to, { board, index }));
}

// Cases du cube où la tuile sélectionnée serait acceptée
function validTargets() {
  if (!selected) return [];
  return cubeCells().filter((c) => !sameCell(c, selected) && tryMove(selected, c, true));
}

// ---------------------------------------------------------------------------
// Sons : synthétisés avec la Web Audio API, sans fichier audio.
// Le contexte audio est créé au premier son, donc après une action du joueur
// (les navigateurs bloquent le son avant toute interaction).
// ---------------------------------------------------------------------------

let audioCtx = null;

function getAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Une note courte avec une enveloppe attaque / décroissance
function tone(audio, freq, duration, { type = "sine", volume = 0.2, delay = 0, slideTo = null } = {}) {
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const SOUNDS = {
  // Tuile prise (sélection ou début de glisser)
  pick: (a) => tone(a, 700, 0.06, { type: "triangle", volume: 0.12 }),
  // Tuile posée sur une case vide
  place: (a) => {
    tone(a, 240, 0.09, { type: "triangle", volume: 0.25, slideTo: 170 });
    tone(a, 900, 0.04, { volume: 0.06 });
  },
  // Deux tuiles échangées
  swap: (a) => {
    tone(a, 330, 0.07, { type: "triangle", volume: 0.2 });
    tone(a, 440, 0.08, { type: "triangle", volume: 0.2, delay: 0.07 });
  },
  // Mouvement refusé
  refuse: (a) => {
    tone(a, 150, 0.16, { type: "sawtooth", volume: 0.08 });
    tone(a, 110, 0.2, { type: "sawtooth", volume: 0.08, delay: 0.09 });
  },
  // Indice
  hint: (a) => {
    tone(a, 880, 0.12, { volume: 0.1 });
    tone(a, 1320, 0.2, { volume: 0.08, delay: 0.1 });
  },
  // Nouvelle partie
  newGame: (a) => tone(a, 300, 0.18, { volume: 0.1, slideTo: 600 }),
  // Cube résolu : arpège puis accord final
  win: (a) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(a, f, 0.22, { type: "triangle", volume: 0.15, delay: i * 0.11 }));
    [523, 659, 784].forEach((f) => tone(a, f, 0.8, { type: "triangle", volume: 0.1, delay: 0.5 }));
  },
};

function playSound(name) {
  if (!options.sound) return;
  try {
    const audio = getAudio();
    if (audio) SOUNDS[name](audio);
  } catch (e) {
    // Pas de son disponible : le jeu continue en silence
  }
}

// ---------------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------------

function drawTriangle(x, y, p1, p2, value) {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x + p1[0], y + p1[1]);
  ctx.lineTo(x + p2[0], y + p2[1]);
  ctx.closePath();
  ctx.fillStyle = COLORS[value];
  ctx.fill();
  ctx.stroke();

  // Le chiffre est placé au barycentre du triangle
  const tx = (cx + x + p1[0] + x + p2[0]) / 3;
  const ty = (cy + y + p1[1] + y + p2[1]) / 3;
  ctx.fillStyle = "#111";
  ctx.fillText(value, tx, ty);
}

function drawTile(tile, col, row) {
  const x = col * TILE;
  const y = row * TILE;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#222";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  drawTriangle(x, y, [0, 0], [TILE, 0], tile.top);
  drawTriangle(x, y, [TILE, 0], [TILE, TILE], tile.right);
  drawTriangle(x, y, [TILE, TILE], [0, TILE], tile.bottom);
  drawTriangle(x, y, [0, TILE], [0, 0], tile.left);

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x, y, TILE, TILE);
}

// Dessine une tuile selon une transformation écran quelconque
function drawTileAt(tile, transform) {
  const { origin, u, v } = transform;
  ctx.setTransform(u.x / TILE, u.y / TILE, v.x / TILE, v.y / TILE, origin.x, origin.y);
  drawTile(tile, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawEmptyCell(col, row) {
  const x = col * TILE;
  const y = row * TILE;
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#555";
  ctx.strokeRect(x, y, TILE, TILE);
}

function outlineCell(index, cols, color, width = 10) {
  const x = (index % cols) * TILE;
  const y = Math.floor(index / cols) * TILE;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.strokeRect(x + width / 2, y + width / 2, TILE - width, TILE - width);
}

function fillCell(index, cols, color) {
  ctx.fillStyle = color;
  ctx.fillRect((index % cols) * TILE, Math.floor(index / cols) * TILE, TILE, TILE);
}

// Bord d'une case, dans le repère local de son plateau
const SIDE_SEGMENTS = {
  top: [[0, 0], [TILE, 0]],
  right: [[TILE, 0], [TILE, TILE]],
  bottom: [[0, TILE], [TILE, TILE]],
  left: [[0, 0], [0, TILE]],
};

function strokeSide(index, cols, side, color) {
  const x = (index % cols) * TILE;
  const y = Math.floor(index / cols) * TILE;
  const [[x1, y1], [x2, y2]] = SIDE_SEGMENTS[side];
  ctx.beginPath();
  ctx.moveTo(x + x1, y + y1);
  ctx.lineTo(x + x2, y + y2);
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineCap = "butt";
}

// Pour chaque bord d'une case : position de la case fantôme voisine (dc, dr)
// et le triangle de cette case qui touche le bord.
const GHOST_TRIANGLES = {
  top: [0, -1, [TILE, TILE], [0, TILE]],
  right: [1, 0, [0, TILE], [0, 0]],
  bottom: [0, 1, [0, 0], [TILE, 0]],
  left: [-1, 0, [TILE, 0], [TILE, TILE]],
};

// En face des bords d'une face dont la voisine est dans l'autre vue, dessine
// en transparence la partie de la tuile voisine qui touche ce bord.
// À appeler dans le repère local de la face.
function drawGhostNeighbors(face) {
  ctx.save();
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  face.cells.forEach((_, index) => {
    neighbors(face, index)
      .filter((n) => n.face.view !== face.view && n.face.cells[n.index] && !isHidden(n.face, n.index))
      .forEach((n) => {
        const value = n.face.cells[n.index][n.otherSide];
        const [dc, dr, p1, p2] = GHOST_TRIANGLES[n.side];
        const x = ((index % face.cols) + dc) * TILE;
        const y = (Math.floor(index / face.cols) + dr) * TILE;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#222";
        drawTriangle(x, y, p1, p2, value);
      });
  });
  ctx.restore();
}

// Survol d'une case du cube : met en évidence ses voisines de l'autre vue
// et les bords qu'elles partagent. Renvoie [{ board, index, side }] par plateau.
function hoverLinks() {
  if (!hover || !hover.board.cube) return [];
  const links = neighbors(hover.board, hover.index)
    .filter((n) => n.face.view !== hover.board.view);
  if (links.length === 0) return [];
  return [
    ...links.map((n) => ({ board: hover.board, index: hover.index, side: n.side })),
    ...links.map((n) => ({ board: n.face, index: n.index, side: n.otherSide })),
  ];
}

// Mode transparence : dessine les tuiles d'une face en filigrane, à sa place
// dans l'autre vue (les deux vues partagent la même projection).
function drawFiligree(face, alpha) {
  const { origin, u, v } = face.otherScreen;
  ctx.save();
  ctx.setTransform(u.x / TILE, u.y / TILE, v.x / TILE, v.y / TILE, origin.x, origin.y);
  ctx.globalAlpha = alpha;
  face.cells.forEach((tile, i) => {
    if (tile && !isHidden(face, i)) drawTile(tile, i % face.cols, Math.floor(i / face.cols));
  });
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#888";
  ctx.strokeRect(0, 0, face.cols * TILE, face.rows * TILE);
  ctx.restore();
}

function drawBoard(board, now, targets, links, tileAlpha = 1) {
  const { origin, u, v } = board.screen;
  ctx.setTransform(u.x / TILE, u.y / TILE, v.x / TILE, v.y / TILE, origin.x, origin.y);

  board.cells.forEach((tile, i) => {
    const col = i % board.cols;
    const row = Math.floor(i / board.cols);

    // La case refusée tremble le long de son axe horizontal
    let offset = 0;
    if (shake && sameCell(shake, { board, index: i })) {
      const t = (now - shake.start) / SHAKE_DURATION;
      offset = Math.sin(t * Math.PI * 6) * 12 * (1 - t);
    }
    ctx.translate(offset, 0);
    ctx.globalAlpha = tileAlpha;
    if (tile && !isHidden(board, i)) drawTile(tile, col, row);
    else drawEmptyCell(col, row);
    ctx.globalAlpha = 1;
    ctx.translate(-offset, 0);
  });

  // Ombrage pour donner du relief au cube
  if (board.shade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${board.shade * tileAlpha})`;
    ctx.fillRect(0, 0, board.cols * TILE, board.rows * TILE);
  }

  if (board.cube && options.ghostNeighbors) drawGhostNeighbors(board);

  // Cases où la tuile sélectionnée peut être posée
  targets
    .filter((c) => c.board === board)
    .forEach((c) => {
      if (!c.board.cells[c.index]) fillCell(c.index, board.cols, "rgba(80, 230, 120, 0.15)");
      outlineCell(c.index, board.cols, "rgba(80, 230, 120, 0.45)", 4);
    });

  hint
    .filter((h) => h.board === board)
    .forEach((h) => outlineCell(h.index, board.cols, h.color));

  links
    .filter((l) => l.board === board)
    .forEach((l) => {
      outlineCell(l.index, board.cols, "rgba(255, 230, 80, 0.6)", 6);
      strokeSide(l.index, board.cols, l.side, "#ffe650");
    });

  if (selected && selected.board === board) {
    outlineCell(selected.index, board.cols, "#fff");
  }
  if (shake && shake.board === board) {
    outlineCell(shake.index, board.cols, "#ff3030");
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------------------
// Effet de victoire : une pluie de confettis aux couleurs des tuiles
// ---------------------------------------------------------------------------

function launchConfetti(now) {
  confetti = Array.from({ length: 180 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 120,
    vy: 100 + Math.random() * 200,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 10,
    size: 6 + Math.random() * 8,
    color: randomItem(COLORS),
  }));
  confetti.last = now;
}

function drawConfetti(now) {
  if (confetti.length === 0) return;
  const dt = (now - confetti.last) / 1000;
  confetti.last = now;
  confetti.forEach((p) => {
    p.vy += 150 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;
    ctx.setTransform(Math.cos(p.angle), Math.sin(p.angle), -Math.sin(p.angle), Math.cos(p.angle), p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (confetti.every((p) => p.y > canvas.height + 20)) confetti = [];
}

// ---------------------------------------------------------------------------
// Boucle de dessin : un seul dessin par image, relancé tant qu'il y a une
// animation en cours
// ---------------------------------------------------------------------------

let frameRequested = false;

function requestDraw() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame((now) => {
    frameRequested = false;
    draw(now);
    if (animations.length > 0 || shake || confetti.length > 0) requestDraw();
  });
}

function draw(now = performance.now()) {
  animations = animations.filter((a) => now - a.start < MOVE_DURATION);
  if (shake && now - shake.start >= SHAKE_DURATION) shake = null;

  const { L, labels } = layout();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const targets = options.validTargets ? validTargets() : [];
  const links = options.hoverLinks ? hoverLinks() : [];
  if (transparency && faces.length === 6) {
    // Vue extérieure : les faces du fond apparaissent à travers les faces
    // avant, rendues translucides. Vue intérieure : les faces avant sont
    // dessinées en filigrane devant les faces du fond.
    faces.filter((f) => f.view === 1).forEach((f) => drawFiligree(f, 0.35));
    faces.filter((f) => f.view === 0).forEach((f) => drawBoard(f, now, targets, links, 0.75));
    faces.filter((f) => f.view === 1).forEach((f) => drawBoard(f, now, targets, links));
    faces.filter((f) => f.view === 0).forEach((f) => drawFiligree(f, 0.2));
    drawBoard(startBoard, now, targets, links);
  } else {
    boards.forEach((board) => drawBoard(board, now, targets, links));
  }

  // Tuiles en mouvement vers leur nouvelle case
  animations.forEach((a) => {
    const t = easeOut((now - a.start) / MOVE_DURATION);
    drawTileAt(a.tile, lerpTransform(a.from, cellTransform(a.to.board, a.to.index), t));
  });

  // Tuile tenue sous le pointeur, avec une ombre
  if (drag && drag.moved) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    drawTileAt(drag.src.board.cells[drag.src.index], pointerTransform(drag.x, drag.y));
    ctx.restore();
  }

  const fontSize = Math.round(Math.min(L * 0.4, 24));
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textBaseline = "middle";

  ctx.textAlign = "center";
  labels.forEach((label) => ctx.fillText(label.text, label.x, label.y));

  if (message) {
    ctx.textAlign = "left";
    ctx.fillText(message, 16, 36);
  }

  drawConfetti(now);
}

// ---------------------------------------------------------------------------
// Interaction (souris et tactile, via les pointer events) :
// - un clic sélectionne une tuile, un second clic la pose ;
// - ou bien on fait glisser la tuile jusqu'à sa case.
// Poser sur une case vide déplace la tuile, sur une case occupée les échange.
// ---------------------------------------------------------------------------

// Joue le coup src -> dst. fromTransform : position de départ de la tuile
// déplacée (sa case, ou sous le pointeur si elle a été glissée).
function playMove(src, dst, fromTransform) {
  const now = performance.now();
  const a = src.board.cells[src.index];
  const b = dst.board.cells[dst.index];

  if (tryMove(src, dst)) {
    saveGame();
    animations.push({ tile: a, from: fromTransform, to: dst, start: now });
    if (b) animations.push({ tile: b, from: cellTransform(dst.board, dst.index), to: src, start: now });
    selected = null;
    hint = [];
    if (isSolved()) {
      message = "Well done, the cube is solved!";
      launchConfetti(now);
      playSound("win");
    } else {
      message = "";
      playSound(b ? "swap" : "place");
    }
  } else {
    shake = { ...dst, start: now };
    playSound("refuse");
    message = "Move rejected: the numbers do not match.";
    // Une tuile glissée retourne à sa case
    if (drag && drag.moved) animations.push({ tile: a, from: fromTransform, to: src, start: now });
  }
}

// Clic simple (appui relâché sans glisser)
function handleClick(hit) {
  if (!hit) {
    selected = null;
  } else if (!selected) {
    if (hit.board.cells[hit.index]) {
      selected = hit;
      playSound("pick");
    }
  } else if (sameCell(selected, hit)) {
    selected = null;
  } else {
    playMove(selected, hit, cellTransform(selected.board, selected.index));
  }
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const { x, y } = pointerPosition(event);
  const hit = hitTest(x, y);
  drag = { src: hit, startX: x, startY: y, x, y, moved: false };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const { x, y } = pointerPosition(event);
  hover = hitTest(x, y);

  if (drag) {
    drag.x = x;
    drag.y = y;
    const far = Math.hypot(x - drag.startX, y - drag.startY) > DRAG_THRESHOLD;
    if (!drag.moved && far && drag.src && drag.src.board.cells[drag.src.index]) {
      drag.moved = true;
      selected = drag.src;
      playSound("pick");
    }
  }
  requestDraw();
});

canvas.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const { x, y } = pointerPosition(event);
  const hit = hitTest(x, y);

  if (!drag.moved) {
    handleClick(hit);
  } else if (hit && !sameCell(hit, drag.src)) {
    playMove(drag.src, hit, pointerTransform(x, y));
  } else {
    // Lâchée hors d'une case ou sur sa propre case : la tuile y retourne
    animations.push({
      tile: drag.src.board.cells[drag.src.index],
      from: pointerTransform(x, y),
      to: drag.src,
      start: performance.now(),
    });
    selected = null;
  }
  drag = null;
  requestDraw();
});

canvas.addEventListener("pointercancel", () => {
  drag = null;
  requestDraw();
});

canvas.addEventListener("pointerleave", () => {
  hover = null;
  requestDraw();
});

document.getElementById("hint").addEventListener("click", () => {
  const result = computeHint();
  hint = result.cells;
  message = result.text;
  playSound("hint");
  draw();
});

// Panneau Options : une case à cocher par aide visuelle, mémorisées dans le navigateur
const OPTIONS_KEY = "cube-tetravex-options";

try {
  const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY));
  if (saved) {
    Object.keys(options).forEach((key) => {
      if (typeof saved[key] === "boolean") options[key] = saved[key];
    });
  }
} catch (e) {
  // Stockage indisponible ou illisible : options par défaut
}

document.querySelectorAll("#options input[data-option]").forEach((input) => {
  const key = input.dataset.option;
  input.checked = options[key];
  input.addEventListener("change", () => {
    options[key] = input.checked;
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch (e) {
      // Préférences non mémorisées
    }
    requestDraw();
  });
});

// Bouton transparence : utile seulement avec les 6 faces (2 vues)
const TRANSPARENCY_KEY = "cube-tetravex-transparency";
const transparencyButton = document.getElementById("transparency");

function updateTransparencyButton() {
  transparencyButton.disabled = faces.length !== 6;
  transparencyButton.classList.toggle("active", transparency);
}

try {
  transparency = localStorage.getItem(TRANSPARENCY_KEY) === "1";
} catch (e) {
  // Stockage indisponible : transparence désactivée par défaut
}

transparencyButton.addEventListener("click", () => {
  transparency = !transparency;
  try {
    localStorage.setItem(TRANSPARENCY_KEY, transparency ? "1" : "0");
  } catch (e) {
    // Préférence non mémorisée
  }
  updateTransparencyButton();
  requestDraw();
});

// Lance une partie avec la taille et le mode choisis dans les listes
function startNewGame() {
  const size = Number(document.getElementById("size").value);
  const faceCount = Number(document.getElementById("mode").value);
  newGame(size, faceCount);
  saveGame();
  updateTransparencyButton();
}

document.getElementById("new-game").addEventListener("click", () => {
  startNewGame();
  playSound("newGame");
  draw();
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

window.addEventListener("resize", resize);

// Reprend la partie sauvegardée s'il y en a une, sinon en commence une nouvelle
if (loadGame()) {
  document.getElementById("size").value = String(grid);
  document.getElementById("mode").value = String(faces.length);
  updateTransparencyButton();
} else {
  startNewGame();
}
resize();
