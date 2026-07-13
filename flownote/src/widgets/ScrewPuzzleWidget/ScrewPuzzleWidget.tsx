import { Lightbulb, Play, RotateCcw, SearchCheck, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocalStorageStringSet } from "../../shared/lib/useLocalStorageStringSet";
import { applyMove, cloneState, createInitialState, getModel, getVisibleScrews, isSolved, solve } from "./solver";
import { screwPuzzleStages } from "./stages";
import type { Plate, PuzzleState, SolveResult, Stage } from "./types";
import "./ScrewPuzzleWidget.css";

const COMPLETED_STORAGE_KEY = "screw-puzzle-completed";

type BadgeTone = "ok" | "warn" | "danger" | "checking";

const pointsToAttr = (points: Plate["points"]) => points.map((point) => point.join(",")).join(" ");

const getTotalScrews = (stage: Stage) => {
  return stage.plates.reduce((sum, plate) => sum + plate.screws.length, 0);
};

const createSolvedResult = (): SolveResult => ({
  solvable: true,
  steps: [],
  visited: 0,
  exhausted: false,
  checkedAt: Date.now(),
});

const getBadge = (stage: Stage, state: PuzzleState, solution: SolveResult): { tone: BadgeTone; text: string } => {
  if (isSolved(stage, state)) return { tone: "ok", text: "해결 완료" };
  if (solution.exhausted && !solution.solvable) return { tone: "warn", text: "검사 제한" };
  if (solution.solvable) return { tone: "ok", text: "풀이 가능" };

  return { tone: "danger", text: "풀이 불가" };
};

const getSolverText = (stage: Stage, state: PuzzleState, solution: SolveResult) => {
  if (isSolved(stage, state)) return "모든 판이 분리되었습니다.";

  if (solution.exhausted && !solution.solvable) {
    return `탐색 제한에 도달했습니다. 방문 상태 ${solution.visited.toLocaleString()}개 기준으로 확정하지 못했습니다.`;
  }

  if (solution.solvable) {
    return `현재 상태는 풀이 가능합니다. ${solution.steps.length}번의 나사 제거 순서를 찾았습니다. 탐색 상태: ${solution.visited.toLocaleString()}개.`;
  }

  return `현재 상태에서는 모든 판을 분리할 수 없습니다. 탐색 상태: ${solution.visited.toLocaleString()}개.`;
};

const ScrewPuzzleWidget = () => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [puzzleState, setPuzzleState] = useState(() => createInitialState(screwPuzzleStages[0]));
  const [history, setHistory] = useState<PuzzleState[]>([]);
  const [highlightedScrew, setHighlightedScrew] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [checkRun, setCheckRun] = useState(0);
  const [completedStages, setCompletedStages] = useLocalStorageStringSet(COMPLETED_STORAGE_KEY);
  const autoTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const stage = screwPuzzleStages[currentStageIndex];

  const stopAutoSolve = useCallback(() => {
    if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    setIsAutoSolving(false);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const model = useMemo(() => getModel(stage), [stage]);
  const visibleScrews = useMemo(() => {
    return getVisibleScrews(stage, puzzleState).sort((a, b) => a.layer - b.layer);
  }, [stage, puzzleState]);
  const activePlates = useMemo(() => {
    return stage.plates
      .filter((plate) => puzzleState.active.has(plate.id))
      .sort((a, b) => a.layer - b.layer);
  }, [stage, puzzleState]);
  const solution = useMemo(() => {
    if (isSolved(stage, puzzleState)) return createSolvedResult();
    return solve(stage, puzzleState, { maxNodes: 160000, deadlineMs: 420 });
  }, [stage, puzzleState, checkRun]);
  const badge = useMemo(() => getBadge(stage, puzzleState, solution), [stage, puzzleState, solution]);
  const solverText = useMemo(() => getSolverText(stage, puzzleState, solution), [stage, puzzleState, solution]);
  const progress = useMemo(() => {
    const total = getTotalScrews(stage);
    const removed = total - puzzleState.remaining.size;
    return Math.round((removed / total) * 100);
  }, [stage, puzzleState]);

  const markCompleted = useCallback(() => {
    setCompletedStages((current) => {
      const next = new Set(current);
      next.add(stage.id);
      return next;
    });
  }, [setCompletedStages, stage.id]);

  const loadStage = useCallback((index: number) => {
    const nextStage = screwPuzzleStages[index];
    if (!nextStage) return;

    stopAutoSolve();
    setCurrentStageIndex(index);
    setPuzzleState(createInitialState(nextStage));
    setHistory([]);
    setHighlightedScrew(null);
    setCheckRun((current) => current + 1);
  }, [stopAutoSolve]);

  const resetStage = useCallback(() => {
    loadStage(currentStageIndex);
  }, [currentStageIndex, loadStage]);

  const undo = useCallback(() => {
    stopAutoSolve();

    const previous = history[history.length - 1];
    if (!previous) return;

    setPuzzleState(previous);
    setHistory(history.slice(0, -1));
    setHighlightedScrew(null);
    setCheckRun((current) => current + 1);
  }, [history, stopAutoSolve]);

  const handleScrewMove = useCallback((screwId: string) => {
    stopAutoSolve();

    const result = applyMove(stage, puzzleState, screwId);
    if (!result.ok) {
      showToast(result.reason);
      return;
    }

    setHistory((current) => [...current, cloneState(puzzleState)]);
    setPuzzleState(result.state);
    setHighlightedScrew(null);

    if (result.removedPlates.length > 0) {
      const names = result.removedPlates
        .map((plateId) => stage.plates.find((plate) => plate.id === plateId)?.name || plateId)
        .join(", ");
      showToast(`${names} 분리`);
    }

    if (isSolved(stage, result.state)) {
      setCompletedStages((current) => {
        const next = new Set(current);
        next.add(stage.id);
        return next;
      });
      showToast("스테이지 해결 완료");
    }
  }, [puzzleState, setCompletedStages, showToast, stage, stopAutoSolve]);

  const showHint = useCallback(() => {
    const [nextScrew] = solution.steps;

    if (!solution.solvable || !nextScrew) {
      showToast("현재 상태에서 표시할 힌트가 없습니다.");
      return;
    }

    const screw = model.screwsById.get(nextScrew);
    setHighlightedScrew(nextScrew);
    showToast(`${screw?.plateName || "강조된"} 나사를 먼저 제거하세요.`);

    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
    }

    hintTimerRef.current = window.setTimeout(() => setHighlightedScrew(null), 2200);
  }, [model, showToast, solution]);

  const autoSolve = useCallback(() => {
    stopAutoSolve();

    if (!solution.solvable || solution.steps.length === 0) {
      showToast(isSolved(stage, puzzleState) ? "이미 해결된 상태입니다." : "자동 풀이 경로가 없습니다.");
      return;
    }

    const steps = [...solution.steps];
    let workingState = cloneState(puzzleState);
    setIsAutoSolving(true);

    autoTimerRef.current = window.setInterval(() => {
      const nextScrew = steps.shift();

      if (!nextScrew) {
        stopAutoSolve();
        setCheckRun((current) => current + 1);
        return;
      }

      const move = applyMove(stage, workingState, nextScrew);
      if (!move.ok) {
        stopAutoSolve();
        showToast(move.reason);
        setCheckRun((current) => current + 1);
        return;
      }

      setHistory((current) => [...current, cloneState(workingState)]);
      workingState = move.state;
      setPuzzleState(workingState);
      setHighlightedScrew(nextScrew);

      if (isSolved(stage, workingState)) {
        markCompleted();
        stopAutoSolve();
        setCheckRun((current) => current + 1);
        showToast("자동 풀이 완료");
      }
    }, 520);
  }, [markCompleted, puzzleState, showToast, solution, stage, stopAutoSolve]);

  return (
    <main className="screw-puzzle">
      <div className="screw-puzzle-shell">
        <header className="screw-puzzle-header">
          <div>
            <p className="screw-puzzle-kicker">Web Puzzle Prototype</p>
            <h1 className="screw-puzzle-title">나사 풀기 퍼즐</h1>
            <p className="screw-puzzle-subtitle">나사를 제거하고 겹친 금속판을 순서대로 분리하세요.</p>
          </div>
          <div className="screw-puzzle-header-actions">
            <button className="screw-puzzle-control is-secondary" onClick={resetStage} type="button">
              <RotateCcw size={18} />
              초기화
            </button>
            <button className="screw-puzzle-control is-secondary" disabled={history.length === 0} onClick={undo} type="button">
              <Undo2 size={18} />
              되돌리기
            </button>
          </div>
        </header>

        <nav className="screw-puzzle-stage-tabs" aria-label="스테이지 선택">
          {screwPuzzleStages.map((stageItem, index) => (
            <button
              className={`screw-puzzle-stage-tab${index === currentStageIndex ? " is-active" : ""}`}
              key={stageItem.id}
              onClick={() => loadStage(index)}
              title={`${stageItem.difficulty} / 슬롯 ${stageItem.traySize}개`}
              type="button"
            >
              {stageItem.name}
              {completedStages.has(stageItem.id) && <span className="screw-puzzle-stage-tab-status">완료</span>}
            </button>
          ))}
        </nav>

        <div className="screw-puzzle-layout">
          <section className="screw-puzzle-board" aria-label="퍼즐 보드">
            <div className="screw-puzzle-board-toolbar">
              <div>
                <h2>{stage.name}</h2>
                <p className="screw-puzzle-stage-desc">
                  {stage.description} 난이도: {stage.difficulty}
                </p>
              </div>
              <div className="screw-puzzle-badges">
                <span className={`screw-puzzle-badge is-${badge.tone}`}>{badge.text}</span>
                <span className="screw-puzzle-badge">{progress}%</span>
              </div>
            </div>

            <div className="screw-puzzle-svg-wrap">
              <svg className="screw-puzzle-svg" viewBox="0 0 1000 720" role="img" aria-label="나사 퍼즐 보드">
                <defs>
                  <pattern id="screwPuzzleMetalLines" width="10" height="10" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="1" x2="10" y2="1" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                    <line x1="0" y1="6" x2="10" y2="6" stroke="rgba(0,0,0,0.13)" strokeWidth="1" />
                  </pattern>
                  <filter id="screwPuzzleSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#000" floodOpacity="0.3" />
                  </filter>
                </defs>
                <rect x="0" y="0" width="1000" height="720" fill="transparent" />

                {activePlates.map((plate) => (
                  <g className="screw-puzzle-plate" data-plate-id={plate.id} key={plate.id}>
                    <polygon className="screw-puzzle-plate-outline" fill={plate.color} points={pointsToAttr(plate.points)} />
                    <polygon className="screw-puzzle-plate-inner" fill="url(#screwPuzzleMetalLines)" opacity="0.7" points={pointsToAttr(plate.points)} />
                    <polygon className="screw-puzzle-plate-inner" fill="none" points={pointsToAttr(plate.points)} />
                    {plate.screws.map((screw) => {
                      const globalId = `${plate.id}:${screw.id}`;
                      if (!puzzleState.remaining.has(globalId)) return null;

                      return (
                        <circle
                          className="screw-puzzle-hole"
                          cx={screw.x}
                          cy={screw.y}
                          key={globalId}
                          r="23"
                        />
                      );
                    })}
                  </g>
                ))}

                <g>
                  {visibleScrews.map((screw) => (
                    <g
                      aria-label={`${screw.plateName} 나사 제거`}
                      className={`screw-puzzle-screw${highlightedScrew === screw.globalId ? " is-highlighted" : ""}`}
                      data-screw-id={screw.globalId}
                      key={screw.globalId}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        handleScrewMove(screw.globalId);
                      }}
                      onPointerUp={(event) => {
                        event.preventDefault();
                        handleScrewMove(screw.globalId);
                      }}
                      role="button"
                      tabIndex={0}
                      transform={`translate(${screw.x} ${screw.y})`}
                    >
                      <circle className="screw-puzzle-screw-head" cx="0" cy="0" r="21" />
                      <line className="screw-puzzle-screw-slot" x1="-10" y1="0" x2="10" y2="0" />
                      <line className="screw-puzzle-screw-slot" x1="0" y1="-10" x2="0" y2="10" />
                      <title>{`${screw.plateName} / ${screw.id}`}</title>
                    </g>
                  ))}
                </g>
              </svg>
            </div>
          </section>

          <aside className="screw-puzzle-side">
            <section className="screw-puzzle-panel">
              <h3>나사 보관 슬롯</h3>
              <div
                className="screw-puzzle-tray"
                style={{ gridTemplateColumns: `repeat(${Math.min(stage.traySize, 5)}, minmax(0, 1fr))` }}
                aria-label="나사 보관 슬롯"
              >
                {Array.from({ length: stage.traySize }, (_, index) => {
                  const screwId = puzzleState.tray[index];
                  const screw = screwId ? model.screwsById.get(screwId) : undefined;

                  return (
                    <div
                      className={`screw-puzzle-tray-slot${screwId ? " is-filled" : ""}`}
                      key={`${stage.id}-slot-${index}`}
                      title={screw?.plateName || "빈 슬롯"}
                    >
                      {screw ? screw.plateName.slice(0, 2) : index + 1}
                    </div>
                  );
                })}
              </div>
              <p className="screw-puzzle-muted">
                {puzzleState.tray.length} / {stage.traySize} 슬롯 사용 중
              </p>
            </section>

            <section className="screw-puzzle-panel">
              <h3>풀이 가능성 검사</h3>
              <p className="screw-puzzle-solver-text">{solverText}</p>
              <div className="screw-puzzle-action-row">
                <button className="screw-puzzle-control" onClick={() => setCheckRun((current) => current + 1)} type="button">
                  <SearchCheck size={18} />
                  다시 검사
                </button>
                <button className="screw-puzzle-control is-secondary" onClick={showHint} type="button">
                  <Lightbulb size={18} />
                  힌트
                </button>
              </div>
              <button className="screw-puzzle-control is-wide" disabled={isAutoSolving} onClick={autoSolve} type="button">
                <Play size={18} />
                {isAutoSolving ? "자동 풀이 중" : "현재 상태에서 자동 풀이"}
              </button>
            </section>

            <section className="screw-puzzle-panel">
              <h3>규칙</h3>
              <ol className="screw-puzzle-rules">
                <li>위쪽 판에 가려지지 않은 나사만 누를 수 있습니다.</li>
                <li>나사를 누르면 보관 슬롯으로 이동합니다.</li>
                <li>한 판의 나사가 모두 제거되면 판이 분리됩니다.</li>
                <li>보관 슬롯이 가득 차면 더 이상 나사를 뺄 수 없습니다.</li>
              </ol>
            </section>
          </aside>
        </div>
      </div>

      <div className={`screw-puzzle-toast${toast ? " is-showing" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
};

export default ScrewPuzzleWidget;
