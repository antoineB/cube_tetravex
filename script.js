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
// Plateaux : les 3 faces du cube et la grille de départ.
// Chaque face est placée dans l'espace 3D du cube (coordonnées 0..grid) :
// la case (col, row) a pour coin origin + col * u + row * v.
// Les dimensions sont fixées par setupBoards() au début de chaque partie.
// ---------------------------------------------------------------------------

const faces = [
  { name: "top", shade: 0, corner: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { name: "left", shade: 0.2, corner: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1] },
  { name: "right", shade: 0.35, corner: [1, 1, 1], u: [0, -1, 0], v: [0, 0, -1] },
].map((face) => ({ ...face, cube: true }));

// Grille de départ : 3*grid colonnes x grid lignes = toutes les tuiles du cube
const startBoard = { name: "start", shade: 0, cube: false };

const boards = [...faces, startBoard];

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

function setupBoards(n) {
  grid = n;
  faces.forEach((face) => {
    face.origin = face.corner.map((k) => k * n);
    face.cols = n;
    face.rows = n;
    face.cells = Array(n * n).fill(null);
  });
  startBoard.cols = 3 * n;
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

function newGame(n) {
  setupBoards(n);
  faces.forEach((face) => (face.solution = []));
  startBoard.cells = generateTiles();
  selected = null;
  rejected = null;
  hint = [];
  message = "";
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

  // Le cube en haut (hauteur 2*grid cases), la grille de départ en bas
  // (grid lignes), avec des marges.
  const L = Math.min(h / (2 * grid + startBoard.rows + 2), w / (startBoard.cols + 1));
  const margin = L / 2;

  // Projection isométrique : le coin caché du cube se projette sur center
  const cos30 = Math.cos(Math.PI / 6);
  const axes = [
    { x: L * cos30, y: L / 2 },  // axe x du cube (vers la droite-bas)
    { x: -L * cos30, y: L / 2 }, // axe y du cube (vers la gauche-bas)
    { x: 0, y: -L },             // axe z du cube (vers le haut)
  ];
  const center = { x: w / 2, y: margin + grid * L };
  const project = (p, base) => ({
    x: base.x + p[0] * axes[0].x + p[1] * axes[1].x + p[2] * axes[2].x,
    y: base.y + p[0] * axes[0].y + p[1] * axes[1].y + p[2] * axes[2].y,
  });
  const zero = { x: 0, y: 0 };

  faces.forEach((face) => {
    face.screen = {
      origin: project(face.origin, center),
      u: project(face.u, zero),
      v: project(face.v, zero),
    };
  });

  startBoard.screen = {
    origin: { x: (w - startBoard.cols * L) / 2, y: center.y + grid * L + L },
    u: { x: L, y: 0 },
    v: { x: 0, y: L },
  };

  return { L, margin };
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
  const { L, margin } = layout();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  boards.forEach(drawBoard);

  if (message) {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(L * 0.4)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(message, margin, margin);
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

document.getElementById("new-game").addEventListener("click", () => {
  newGame(Number(document.getElementById("size").value));
  draw();
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

window.addEventListener("resize", resize);
newGame(Number(document.getElementById("size").value));
resize();
