import type { Plate, PuzzleState, ScrewModel, SolveResult, Stage } from "./types";

type StageModel = {
  platesById: Map<string, Plate>;
  platesByLayer: Plate[];
  screwsById: Map<string, ScrewModel>;
  screwsByPlate: Map<string, string[]>;
};

type MoveResult =
  | {
      ok: true;
      state: PuzzleState;
      removedPlates: string[];
      screw: ScrewModel;
    }
  | {
      ok: false;
      reason: string;
      state: PuzzleState;
    };

export const screwId = (plateId: string, localScrewId: string) => `${plateId}:${localScrewId}`;

export const getModel = (stage: Stage): StageModel => {
  const platesById = new Map<string, Plate>();
  const screwsById = new Map<string, ScrewModel>();
  const screwsByPlate = new Map<string, string[]>();

  for (const plate of stage.plates) {
    platesById.set(plate.id, plate);
    screwsByPlate.set(plate.id, []);

    for (const screw of plate.screws) {
      const id = screwId(plate.id, screw.id);
      const normalized: ScrewModel = {
        ...screw,
        globalId: id,
        plateId: plate.id,
        plateName: plate.name,
        layer: plate.layer,
      };
      screwsById.set(id, normalized);
      screwsByPlate.get(plate.id)?.push(id);
    }
  }

  const platesByLayer = [...stage.plates].sort((a, b) => a.layer - b.layer);
  return { platesById, platesByLayer, screwsById, screwsByPlate };
};

export const createInitialState = (stage: Stage): PuzzleState => {
  const model = getModel(stage);

  return {
    active: new Set(stage.plates.map((plate) => plate.id)),
    remaining: new Set(model.screwsById.keys()),
    tray: [],
    moveCount: 0,
  };
};

export const cloneState = (state: PuzzleState): PuzzleState => ({
  active: new Set(state.active),
  remaining: new Set(state.remaining),
  tray: [...state.tray],
  moveCount: state.moveCount,
});

const pointInPolygon = (point: { x: number; y: number }, polygon: Stage["plates"][number]["points"]) => {
  const x = point.x;
  const y = point.y;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
};

const isScrewVisible = (stage: Stage, state: PuzzleState, screwIdValue: string) => {
  const model = getModel(stage);
  const screw = model.screwsById.get(screwIdValue);

  if (!screw) return false;
  if (!state.remaining.has(screwIdValue)) return false;
  if (!state.active.has(screw.plateId)) return false;

  for (const plate of stage.plates) {
    if (!state.active.has(plate.id)) continue;
    if (plate.id === screw.plateId) continue;
    if (plate.layer <= screw.layer) continue;

    if (pointInPolygon({ x: screw.x, y: screw.y }, plate.points)) {
      return false;
    }
  }

  return true;
};

export const getVisibleScrews = (stage: Stage, state: PuzzleState) => {
  const model = getModel(stage);

  return [...state.remaining]
    .filter((id) => isScrewVisible(stage, state, id))
    .map((id) => model.screwsById.get(id))
    .filter((screw): screw is ScrewModel => Boolean(screw));
};

const isPlateCleared = (model: StageModel, state: PuzzleState, plateId: string) => {
  const screwIds = model.screwsByPlate.get(plateId) || [];
  return screwIds.every((id) => !state.remaining.has(id));
};

const cascadeRemoveClearedPlates = (stage: Stage, state: PuzzleState) => {
  const model = getModel(stage);
  const removedPlates: string[] = [];
  let changed = true;

  while (changed) {
    changed = false;

    for (const plate of stage.plates) {
      if (!state.active.has(plate.id)) continue;
      if (!isPlateCleared(model, state, plate.id)) continue;

      state.active.delete(plate.id);
      state.tray = state.tray.filter((id) => {
        const screw = model.screwsById.get(id);
        return screw && screw.plateId !== plate.id;
      });
      removedPlates.push(plate.id);
      changed = true;
    }
  }

  return removedPlates;
};

export const applyMove = (stage: Stage, state: PuzzleState, screwIdValue: string): MoveResult => {
  const next = cloneState(state);
  const model = getModel(stage);
  const screw = model.screwsById.get(screwIdValue);

  if (!screw) {
    return { ok: false, reason: "없는 나사입니다.", state };
  }

  if (next.tray.length >= stage.traySize) {
    return { ok: false, reason: "보관 슬롯이 가득 찼습니다.", state };
  }

  if (!isScrewVisible(stage, next, screwIdValue)) {
    return { ok: false, reason: "다른 판에 가려진 나사입니다.", state };
  }

  next.remaining.delete(screwIdValue);
  next.tray.push(screwIdValue);
  next.moveCount += 1;

  const removedPlates = cascadeRemoveClearedPlates(stage, next);
  return { ok: true, state: next, removedPlates, screw };
};

export const isSolved = (stage: Stage, state: PuzzleState) => state.active.size === 0 && stage.plates.length > 0;

const stateKey = (state: PuzzleState) => {
  const active = [...state.active].sort().join(",");
  const remaining = [...state.remaining].sort().join(",");
  const tray = [...state.tray].sort().join(",");
  return `${active}|${remaining}|${tray}`;
};

const countRemainingForPlate = (model: StageModel, state: PuzzleState, plateId: string) => {
  return (model.screwsByPlate.get(plateId) || []).filter((id) => state.remaining.has(id)).length;
};

const orderedActions = (stage: Stage, state: PuzzleState) => {
  const model = getModel(stage);
  const visible = getVisibleScrews(stage, state);

  return visible.sort((a, b) => {
    const plateA = model.platesById.get(a.plateId);
    const plateB = model.platesById.get(b.plateId);
    const remainingDelta =
      countRemainingForPlate(model, state, a.plateId) - countRemainingForPlate(model, state, b.plateId);

    if (remainingDelta !== 0) return remainingDelta;

    return (plateB?.layer || 0) - (plateA?.layer || 0);
  });
};

export const solve = (stage: Stage, startState: PuzzleState, options: { maxNodes?: number; deadlineMs?: number } = {}): SolveResult => {
  const maxNodes = options.maxNodes || 140000;
  const deadlineMs = options.deadlineMs || 250;
  const started = performance.now();
  const memo = new Map<string, string[] | null>();
  let visited = 0;
  let exhausted = false;

  const dfs = (state: PuzzleState): string[] | null => {
    if (isSolved(stage, state)) return [];

    visited += 1;
    if (visited > maxNodes || performance.now() - started > deadlineMs) {
      exhausted = true;
      return null;
    }

    const key = stateKey(state);
    if (memo.has(key)) return memo.get(key) || null;

    if (state.tray.length >= stage.traySize) {
      memo.set(key, null);
      return null;
    }

    const actions = orderedActions(stage, state);
    if (actions.length === 0) {
      memo.set(key, null);
      return null;
    }

    for (const screw of actions) {
      const result = applyMove(stage, state, screw.globalId);
      if (!result.ok) continue;

      const tail = dfs(result.state);
      if (tail) {
        const answer = [screw.globalId, ...tail];
        memo.set(key, answer);
        return answer;
      }
    }

    memo.set(key, null);
    return null;
  };

  const steps = dfs(cloneState(startState));

  return {
    solvable: Array.isArray(steps),
    steps: steps || [],
    visited,
    exhausted,
    checkedAt: Date.now(),
  };
};
