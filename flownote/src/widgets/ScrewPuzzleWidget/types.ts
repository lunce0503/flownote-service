export type Point = [number, number];

export type ScrewSpec = {
  id: string;
  x: number;
  y: number;
};

export type Plate = {
  id: string;
  name: string;
  layer: number;
  color: string;
  points: Point[];
  screws: ScrewSpec[];
};

export type Stage = {
  id: string;
  name: string;
  difficulty: string;
  traySize: number;
  description: string;
  plates: Plate[];
};

export type ScrewModel = ScrewSpec & {
  globalId: string;
  plateId: string;
  plateName: string;
  layer: number;
};

export type PuzzleState = {
  active: Set<string>;
  remaining: Set<string>;
  tray: string[];
  moveCount: number;
};

export type SolveResult = {
  solvable: boolean;
  steps: string[];
  visited: number;
  exhausted: boolean;
  checkedAt: number;
};
