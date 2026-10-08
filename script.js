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
  selected = null;
  rejected = null;
  hint = [];
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
  selected = null;
  rejected = null;
  hint = [];
  message = isSolved() ? "Bravo, le cube est résolu !" : "";
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

// Déplace (ou échange) la tuile de src vers dst ; annule si le cube devient invalide
function tryMove(src, dst) {
  const a = src.board.cells[src.index];
  const b = dst.board.cells[dst.index];
  src.board.cells[src.index] = b;
  dst.board.cells[dst.index] = a;

  const ok = [src, dst].every((s) => !s.board.cube || cellIsValid(s.board, s.index));
  if (!ok) {
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
    return { cells: [{ ...randomItem(wrong), color: "#ff9a1f" }], text: "Indice : cette tuile est mal placée." };
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
  if (targets.length === 0) return { cells: [], text: "Le cube est déjà résolu !" };

  const target = randomItem(targets);
  const source = findTileFor(target);
  return {
    cells: [{ ...source, color: "#2fd0ff" }, { ...target, color: "#2fd0ff" }],
    text: "Indice : placez la tuile entourée en bleu sur la case bleue du cube.",
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
  });

  // Nom des vues, affiché sous chaque cube quand il y en a deux
  const labels = views === 2
    ? [
        { text: "Vue extérieure", x: centers[0].x, y: centerY + grid * L + L },
        { text: "Vue intérieure", x: centers[1].x, y: centerY + grid * L + L },
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
// Dessin
// ---------------------------------------------------------------------------

let selected = null;  // { board, index }
let rejected = null;  // { board, index, until } : case refusée, affichée en rouge
let message = "";
let hint = [];        // [{ board, index, color }] : cases mises en évidence par l'indice

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

function drawEmptyCell(col, row) {
  const x = col * TILE;
  const y = row * TILE;
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#555";
  ctx.strokeRect(x, y, TILE, TILE);
}

function outlineCell(index, cols, color) {
  const x = (index % cols) * TILE;
  const y = Math.floor(index / cols) * TILE;
  ctx.lineWidth = 10;
  ctx.strokeStyle = color;
  ctx.strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
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
      .filter((n) => n.face.view !== face.view && n.face.cells[n.index])
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

function drawBoard(board) {
  const { origin, u, v } = board.screen;
  ctx.setTransform(u.x / TILE, u.y / TILE, v.x / TILE, v.y / TILE, origin.x, origin.y);

  board.cells.forEach((tile, i) => {
    const col = i % board.cols;
    const row = Math.floor(i / board.cols);
    if (tile) drawTile(tile, col, row);
    else drawEmptyCell(col, row);
  });

  // Ombrage pour donner du relief au cube
  if (board.shade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${board.shade})`;
    ctx.fillRect(0, 0, board.cols * TILE, board.rows * TILE);
  }

  if (board.cube) drawGhostNeighbors(board);

  hint
    .filter((h) => h.board === board)
    .forEach((h) => outlineCell(h.index, board.cols, h.color));
  if (selected && selected.board === board) {
    outlineCell(selected.index, board.cols, "#fff");
  }
  if (rejected && rejected.board === board && performance.now() < rejected.until) {
    outlineCell(rejected.index, board.cols, "#ff3030");
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function draw() {
  const { L, labels } = layout();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  boards.forEach(drawBoard);

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
}

// ---------------------------------------------------------------------------
// Interaction : un clic sélectionne une tuile, un second clic la pose
// (déplacement vers une case vide, ou échange avec la tuile présente).
// ---------------------------------------------------------------------------

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(event.clientX - rect.left, event.clientY - rect.top);

  if (!hit) {
    selected = null;
  } else if (!selected) {
    if (hit.board.cells[hit.index]) selected = hit;
  } else if (selected.board === hit.board && selected.index === hit.index) {
    selected = null;
  } else if (tryMove(selected, hit)) {
    saveGame();
    selected = null;
    hint = [];
    message = isSolved() ? "Bravo, le cube est résolu !" : "";
  } else {
    rejected = { ...hit, until: performance.now() + 500 };
    message = "Mouvement refusé : les nombres ne correspondent pas.";
    setTimeout(draw, 500);
  }
  draw();
});

document.getElementById("hint").addEventListener("click", () => {
  const result = computeHint();
  hint = result.cells;
  message = result.text;
  draw();
});

// Lance une partie avec la taille et le mode choisis dans les listes
function startNewGame() {
  const size = Number(document.getElementById("size").value);
  const faceCount = Number(document.getElementById("mode").value);
  newGame(size, faceCount);
  saveGame();
}

document.getElementById("new-game").addEventListener("click", () => {
  startNewGame();
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
} else {
  startNewGame();
}
resize();
