// Builds the maze as a grid of tiles (true = wall). No drawing in here.
const CELLS_W = 9, CELLS_H = 11;
export const W = CELLS_W * 2 + 1, H = CELLS_H * 2 + 1;
// Shortest walk through all three exits, in tiles. Keeps every maze a similar length.
const TOUR_MIN = 150, TOUR_MAX = 210;
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Small seeded random generator, so one seed always gives the same maze.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Steps from one tile to every other (-1 = unreachable).
export function distances(walls, from) {
  const d = walls.map((row) => row.map(() => -1));
  d[from.y][from.x] = 0;
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (walls[ny]?.[nx] === false && d[ny][nx] < 0) { d[ny][nx] = d[y][x] + 1; queue.push({ x: nx, y: ny }); }
    }
  }
  return d;
}

function carve(rand) {
  const walls = Array.from({ length: H }, () => Array(W).fill(true));
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const stack = [[1, 1]];
  walls[1][1] = false;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = shuffle([...STEPS], rand).find(([dx, dy]) => inside(x + 2 * dx, y + 2 * dy) && walls[y + 2 * dy][x + 2 * dx]);
    if (!next) { stack.pop(); continue; }
    const [dx, dy] = next;
    walls[y + dy][x + dx] = walls[y + 2 * dy][x + 2 * dx] = false;
    stack.push([x + 2 * dx, y + 2 * dy]);
  }
  // Open up some dead ends so getting lost is fun, not tedious.
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) {
    const closed = STEPS.filter(([dx, dy]) => walls[y + dy][x + dx]);
    if (closed.length < 3 || rand() > .35) continue;
    const pick = shuffle(closed, rand).find(([dx, dy]) => inside(x + 2 * dx, y + 2 * dy));
    if (pick) walls[y + pick[1]][x + pick[0]] = false;
  }
  return walls;
}

function attempt(seed) {
  const rand = rng(seed);
  const walls = carve(rand);
  const start = { x: 2 * Math.floor(CELLS_W / 2) + 1, y: 2 * Math.floor(CELLS_H / 2) + 1 };
  const d = distances(walls, start);

  // One exit on each of three sides, far from the start and from each other.
  const sides = {
    left: [], right: [], top: [],
  };
  for (let y = 1; y < H; y += 2) { sides.left.push({ x: 0, y, inX: 1, inY: y }); sides.right.push({ x: W - 1, y, inX: W - 2, inY: y }); }
  for (let x = 1; x < W; x += 2) sides.top.push({ x, y: 0, inX: x, inY: 1 });
  const exits = [];
  for (const name of shuffle(Object.keys(sides), rand)) {
    const pick = shuffle(sides[name], rand).find((e) => d[e.inY][e.inX] >= 20
      && exits.every((o) => Math.abs(o.x - e.x) + Math.abs(o.y - e.y) >= 9));
    if (!pick) return null;
    exits.push({ x: pick.x, y: pick.y });
  }
  for (const e of exits) walls[e.y][e.x] = false;

  const maps = exits.map((e) => distances(walls, e));
  const between = (a, b) => maps[a][exits[b].y][exits[b].x];
  let tour = Infinity;
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    tour = Math.min(tour, maps[a][start.y][start.x] + between(a, b) + between(b, c));
  }
  if (tour < TOUR_MIN || tour > TOUR_MAX) return null;
  return { seed, walls, start, exits, tour };
}

export function makeMaze(seed = Math.floor(Math.random() * 1e9)) {
  for (let i = 0; i < 5000; i++) {
    const maze = attempt(seed + i);
    if (maze) return maze;
  }
  throw new Error('no maze found');
}
