import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, ShieldCheck, Zap, Layers, Info, 
  Sun, Moon, Flame, Droplets, Wind, Mountain, Eye, Sparkles,
  Sword, Shield, Heart, Ghost, Cloud, Star, Anchor, Compass,
  Play, Pause, SkipForward, RotateCcw
} from 'lucide-react';

/**
 * 룬 데이터 인터페이스
 */
interface Rune {
  id: number;
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

type MagicCircleStage = 'SENSING' | 'SYNC' | 'RESONANCE' | 'RENDERING' | 'PROJECTION';

// --- 서브 컴포넌트 분리 ---

const SensingRing: React.FC<{ active: boolean }> = ({ active }) => (
  <g className="origin-center animate-[spin_120s_linear_infinite]">
    <circle cx="250" cy="250" r="240" fill="none" stroke="rgba(34, 211, 238, 0.1)" strokeWidth="1" />
    <circle 
      cx="250" cy="250" r="235" 
      fill="none" 
      stroke="#22d3ee" 
      strokeWidth="1.5" 
      strokeDasharray="2, 12"
      className="transition-opacity duration-1000"
      style={{ opacity: active ? 0.6 : 0.1 }}
    />
  </g>
);

const SyncRing: React.FC<{ active: boolean }> = ({ active }) => (
  <g className="origin-center animate-[spin_40s_linear_infinite_reverse]" style={{ opacity: active ? 0.8 : 0.1 }}>
    <circle cx="250" cy="250" r="210" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="4 4" />
    <path id="syncPath" d="M 250,250 m -205,0 a 205,205 0 1,1 410,0 a 205,205 0 1,1 -410,0" fill="none" />
  </g>
);

const ResonanceCore: React.FC<{ active: boolean }> = ({ active }) => (
  <g 
    className="transition-all duration-1000 origin-center"
    style={{ 
      opacity: active ? 1 : 0.1,
      transform: `scale(${active ? 1 : 0.8})`
    }}
  >
    <path 
      d="M250 80 L380 330 L120 330 Z" 
      fill="none" stroke="#22d3ee" strokeWidth="2" 
      className={active ? "animate-pulse" : ""}
    />
    <path 
      d="M250 420 L120 170 L380 170 Z" 
      fill="none" stroke="#22d3ee" strokeWidth="2" 
      className={active ? "animate-pulse opacity-60" : "opacity-10"}
    />
    <circle cx="250" cy="250" r="50" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="4 4" />
  </g>
);

const RuneOrbit: React.FC<{ active: boolean; runes: Rune[] }> = ({ active, runes }) => (
  <g className="transition-all duration-1000 origin-center" style={{ opacity: active ? 1 : 0 }}>
    <circle cx="250" cy="250" r="155" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="10 20" className="opacity-20 origin-center animate-[spin_60s_linear_infinite]" />
    
    {runes.map((rune, index) => {
      const angle = (index * (360 / runes.length) - 90) * (Math.PI / 180);
      const x = 250 + 155 * Math.cos(angle);
      const y = 250 + 155 * Math.sin(angle);
      const Icon = rune.icon;
      
      return (
        <g key={`${rune.id}-${index}`} className="origin-center animate-in fade-in zoom-in duration-500">
          <circle cx={x} cy={y} r="24" className="fill-[#020408] stroke-cyan-500/40" strokeWidth="1.5" />
          <g transform={`translate(${x - 12}, ${y - 12})`} className="text-cyan-300">
            <Icon size={24} strokeWidth={1.5} filter="url(#rune-glow)" />
          </g>
        </g>
      );
    })}
  </g>
);

const ProjectionCore: React.FC<{ active: boolean }> = ({ active }) => (
  <g style={{ opacity: active ? 1 : 0 }} className="transition-opacity duration-700">
    <circle cx="250" cy="250" r="45" className="fill-cyan-400 opacity-20 animate-ping" />
    <circle cx="250" cy="250" r="8" className="fill-white" filter="url(#rune-glow)" />
    {[0, 45, 90, 135].map((angle) => (
      <rect 
        key={angle}
        x="249.5" y="160" width="1" height="180" 
        fill="url(#lightGradient)" 
        transform={`rotate(${angle} 250 250)`}
        className="opacity-40"
      />
    ))}
  </g>
);


// --- 메인 컴포넌트 ---


const MagicCircle: React.FC = () => {
  const [stage, setStage] = useState<MagicCircleStage>('SENSING');
  const [isPlaying, setIsPlaying] = useState(true);
  const [data, setData] = useState({ freq: 440, stability: 0 });
  
  const runeLibrary: Rune[] = [
    { id: 1, name: "Solar", icon: Sun, color: "#ffcc00", description: "태양의 에너지" },
    { id: 2, name: "Lunar", icon: Moon, color: "#aaaaaa", description: "달의 신비" },
    { id: 3, name: "Flame", icon: Flame, color: "#ff4400", description: "불의 파괴력" },
    { id: 4, name: "Ocean", icon: Droplets, color: "#0088ff", description: "물의 생명력" },
    { id: 5, name: "Gale", icon: Wind, color: "#00ffcc", description: "바람의 속도" },
    { id: 6, name: "Terra", icon: Mountain, color: "#88ff00", description: "대지의 견고함" },
    { id: 7, name: "Vision", icon: Eye, color: "#cc00ff", description: "진실의 통찰" },
    { id: 8, name: "Astral", icon: Sparkles, color: "#ffffff", description: "성좌의 가호" },
    { id: 9, name: "Sword", icon: Sword, color: "#e2e8f0", description: "공격의 의지" },
    { id: 10, name: "Shield", icon: Shield, color: "#94a3b8", description: "방어의 결계" },
    { id: 11, name: "Heart", icon: Heart, color: "#f43f5e", description: "치유의 마음" },
    { id: 12, name: "Ghost", icon: Ghost, color: "#a855f7", description: "영혼의 공명" },
    { id: 13, name: "Cloud", icon: Cloud, color: "#38bdf8", description: "은신의 안개" },
    { id: 14, name: "Star", icon: Star, color: "#fbbf24", description: "희망의 성광" },
    { id: 15, name: "Anchor", icon: Anchor, color: "#0f172a", description: "심연의 정착" },
    { id: 16, name: "Compass", icon: Compass, color: "#10b981", description: "길의 인도자" },
  ];

  const [activeRunes, setActiveRunes] = useState<Rune[]>(runeLibrary.slice(0, 8));

  const stages: MagicCircleStage[] = ['SENSING', 'SYNC', 'RESONANCE', 'RENDERING', 'PROJECTION'];
  const currentIdx = stages.indexOf(stage);

  useEffect(() => {
    let timer: number;
    if (isPlaying) {
      timer = window.setInterval(() => {
        setStage(prev => {
          const nextIdx = (stages.indexOf(prev) + 1) % stages.length;
          return stages[nextIdx];
        });
      }, 5000);
    }
    const dataTimer = window.setInterval(() => {
      setData({ freq: 432 + Math.random() * 12, stability: 98 + Math.random() * 1.9 });
    }, 1000);
    return () => { clearInterval(timer); clearInterval(dataTimer); };
  }, [isPlaying]);

  const toggleRune = (rune: Rune) => {
    setActiveRunes(prev => {
      const isAlreadyActive = prev.find(r => r.id === rune.id);
      if (isAlreadyActive) {
        if (prev.length <= 3) return prev;
        return prev.filter(r => r.id !== rune.id);
      } else {
        if (prev.length >= 8) return [...prev.slice(1), rune];
        return [...prev, rune];
      }
    });
  };

  return (
    <div className="flex-5 min-h-screen bg-[#020408] flex items-center justify-center p-4 overflow-hidden font-mono text-cyan-400">
      {/* 배경 환경광 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full transition-all duration-1000"
          style={{
            background: `radial-gradient(circle, rgba(0, 242, 255, ${0.1 * (currentIdx + 1)}) 0%, transparent 70%)`,
            filter: 'blur(80px)',
            transform: `translate(-50%, -50%) scale(${1 + currentIdx * 0.1})`,
          }}
        />
      </div>

      <div className="relative w-full max-w-7xl flex flex-col lg:flex-row items-center gap-8 z-10">
        
        {/* 좌측: 마법진 영역 */}
        <div className="relative flex-1 flex flex-col items-center justify-center w-full min-h-[550px]">
          <div className="relative w-full max-w-[550px] aspect-square">
            <svg viewBox="0 0 500 500" className="w-full h-full drop-shadow-[0_0_30px_rgba(34,211,238,0.4)] overflow-visible">
              <defs>
                <filter id="rune-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="lightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>

              <SensingRing active={currentIdx >= 0} />
              <SyncRing active={currentIdx >= 1} />
              <ResonanceCore active={currentIdx >= 2} />
              <RuneOrbit active={currentIdx >= 3} runes={activeRunes} />
              <ProjectionCore active={currentIdx >= 4} />
            </svg>

            {/* 실시간 수치 오버레이 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-6 px-6 py-2 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 rounded-full text-[10px] tracking-widest font-bold whitespace-nowrap">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                FREQ: {data.freq.toFixed(2)} HZ
              </div>
              <div className="flex items-center gap-2 border-l border-cyan-500/20 pl-6">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                STB: {data.stability.toFixed(2)} %
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 통합 제어 패널 */}
        <div className="w-full lg:w-[400px] space-y-6 flex flex-col">
          
          {/* 시연 제어 툴바 (신규) */}
          <div className="bg-[#0a1016]/90 border border-cyan-500/30 p-5 rounded-lg backdrop-blur-xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-cyan-400" />
                <span className="text-[11px] font-black tracking-widest uppercase">Sequence_Control</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`p-1.5 rounded transition-colors ${isPlaying ? 'bg-cyan-500/20 text-cyan-400' : 'bg-transparent text-cyan-700 hover:text-cyan-400'}`}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button 
                  onClick={() => setStage('SENSING')}
                  className="p-1.5 text-cyan-700 hover:text-cyan-400 transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {stages.map((s, i) => (
                <button
                  key={s}
                  onClick={() => {
                    setStage(s);
                    setIsPlaying(false);
                  }}
                  className={`
                    px-3 py-2 text-[9px] font-black tracking-tighter rounded border transition-all duration-300 flex-1 min-w-[80px]
                    ${currentIdx === i 
                      ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                      : 'border-cyan-500/10 text-cyan-900 hover:border-cyan-500/40 hover:text-cyan-600'
                    }
                  `}
                >
                  {i + 1}. {s}
                </button>
              ))}
            </div>

            {/* 단계별 상태 인디케이터 */}
            <div className="grid grid-cols-5 gap-1 pt-1">
              {stages.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i <= currentIdx ? 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,1)]' : 'bg-cyan-900/30'}`} />
              ))}
            </div>
          </div>

          {/* 룬 팔레트 툴바 */}
          <div className="bg-[#0a1016]/90 border border-cyan-500/30 p-5 rounded-lg backdrop-blur-xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-cyan-400" />
                <span className="text-[11px] font-black tracking-widest uppercase">Rune_Library</span>
              </div>
              <span className="text-[10px] opacity-40 uppercase font-bold">{activeRunes.length} SLOTS</span>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {runeLibrary.map((rune) => {
                const isActive = activeRunes.find(r => r.id === rune.id);
                const Icon = rune.icon;
                return (
                  <button
                    key={rune.id}
                    onClick={() => toggleRune(rune)}
                    className={`
                      aspect-square flex flex-col items-center justify-center rounded-md border transition-all duration-300 group
                      ${isActive 
                        ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                        : 'border-cyan-500/10 bg-transparent text-cyan-900 hover:border-cyan-500/40 hover:text-cyan-600'
                      }
                    `}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[7px] mt-1 font-black opacity-70 uppercase tracking-tighter">{rune.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 현재 활성화된 룬 상세 정보 */}
          <div className="bg-cyan-950/10 border border-cyan-500/10 p-5 rounded-lg flex-1 min-h-[120px]">
            <div className="text-[10px] text-cyan-400 font-black mb-4 flex items-center gap-2 opacity-70 tracking-[0.2em]">
              <Info size={14} /> ACTIVE_RUNE_SPEC
            </div>
            {currentIdx >= 3 ? (
              <div className="flex items-center gap-5 animate-in fade-in slide-in-from-bottom-2">
                <div className="p-4 bg-cyan-400/10 rounded-xl border border-cyan-400/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                  {(() => {
                    const ActiveIcon = activeRunes[currentIdx % activeRunes.length].icon;
                    return <ActiveIcon size={24} />;
                  })()}
                </div>
                <div>
                  <div className="text-[11px] font-black text-cyan-100 uppercase tracking-widest">
                    {activeRunes[currentIdx % activeRunes.length].name}
                  </div>
                  <div className="text-[10px] opacity-50 mt-1.5 leading-relaxed font-bold">
                    {activeRunes[currentIdx % activeRunes.length].description}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] opacity-30 italic py-4 flex items-center justify-center border border-dashed border-cyan-500/20 rounded">
                Awaiting Rendering Phase...
              </div>
            )}
          </div>

          <div className="text-[8px] opacity-20 text-center uppercase tracking-[0.8em] pt-2">
            Arcane Terminal Secure Link Established
          </div>
        </div>
      </div>
    </div>
  );
};

export default MagicCircle;