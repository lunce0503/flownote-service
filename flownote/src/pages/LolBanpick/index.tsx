import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Trophy, ShieldAlert, X } from 'lucide-react';

// --- Types ---
interface Champion {
  id: string;
  name: string;
  image: {
    full: string;
  };
}

interface PickOrder {
  team: 'blue' | 'red';
  type: 'ban' | 'pick';
}

interface BanPickState {
  blue: { ban: (Champion | null)[]; pick: (Champion | null)[] };
  red: { ban: (Champion | null)[]; pick: (Champion | null)[] };
}

// --- Constants ---
const PICK_ORDER: PickOrder[] = [
  { team: 'blue', type: 'ban' }, { team: 'red', type: 'ban' },
  { team: 'blue', type: 'ban' }, { team: 'red', type: 'ban' },
  { team: 'blue', type: 'ban' }, { team: 'red', type: 'ban' },
  { team: 'blue', type: 'pick' }, { team: 'red', type: 'pick' },
  { team: 'red', type: 'pick' }, { team: 'blue', type: 'pick' },
  { team: 'blue', type: 'pick' }, { team: 'red', type: 'pick' },
  { team: 'red', type: 'ban' }, { team: 'blue', type: 'ban' },
  { team: 'red', type: 'ban' }, { team: 'blue', type: 'ban' },
  { team: 'red', type: 'pick' }, { team: 'blue', type: 'pick' },
  { team: 'blue', type: 'pick' }, { team: 'red', type: 'pick' },
];

const ROLE_MAP: Record<string, string[]> = {
  "TOP": ["그라가스", "크산테", "가렌", "갱플랭크", "그웬", "나르", "나서스", "다리우스", "럼블", "레넥톤", "리븐", "말파이트", "모데카이저", "문도 박사", "볼리베어", "브라디미르", "사이온", "세트", "쉔", "신지드", "아트록스", "암베사", "야스오", "오른", "올라프", "요네", "요릭", "이렐리아", "일라오이", "잭스", "제이스", "초가스", "카밀", "케넨", "케일", "퀸", "클레드", "트린다미어", "티모", "판테온", "피오라", "하이머링거"],
  "JUN": ["녹턴", "리신", "스카너", "신 짜오", "판테온", "그레이브즈", "나피리", "누누와 월럼프", "니달리", "다이애나", "람머스", "렉사이", "렝가", "릴리아", "마스터 이", "바이", "벨베스", "볼리베어", "브라이어", "비에고", "사일러스", "샤코", "세주아니", "쉬바나", "아무무", "아이번", "에코", "엘리스", "오공", "우디르", "워윅", "이블린", "자르반 4세", "자크", "잭스", "제드", "카서스", "케인", "키아나", "킨드레드", "탈론", "트런들", "피들스틱", "헤카림"],
  "MID": ["갈리오", "빅토르", "아리", "오로라", "다이에나", "라이즈", "럭스", "르블랑", "리산드라", "말자하", "멜", "모르가나", "베이가", "벡스", "블라디미르", "사일러스", "신드라", "아우렐리온 솔", "아지르", "아칼리", "아크샨", "애니", "애니비아", "야스오", "에코", "오리아나", "요네", "이렐리아", "제드", "제라스", "조이", "카서스", "카시오페아", "카타리나", "키아나", "탈리아", "트위스티드 페이트", "피즈", "흐웨이"],
  "ADC": ["미스 포츈", "애쉬", "이즈리얼", "카이사", "닐라", "드레이븐", "루시안", "바루스", "베인", "사미라", "세나", "스몰더", "시비르", "아펠리오스", "유나라", "자야", "제리", "직스", "진", "징크스", "칼리스타", "케이틀린", "코그모", "코르키", "트리스타나", "트위치"],
  "SUP": ["바드", "나미", "노틸러스", "니코", "라칸", "럭스", "레나타 글라스크", "레오나", "렐", "룰루", "마오카이", "멜", "모르가나", "밀리오", "벨코즈", "브라움", "브랜드", "블리츠크랭크", "뽀삐", "샤코", "세나", "세라핀", "소나", "소라카", "스웨인", "스레쉬", "알리스타", "유미", "자이라", "잔나", "제라스", "질리언", "카르마", "타릭", "탐 켄치", "파이크", "판테온"]
};

export default function BanPickPage() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [version, setVersion] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [error, setError] = useState("");
  
  const [state, setState] = useState<BanPickState>({
    blue: { ban: Array(5).fill(null), pick: Array(5).fill(null) },
    red: { ban: Array(5).fill(null), pick: Array(5).fill(null) }
  });

  // Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        const vRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions = await vRes.json();
        const currentVersion = versions[0];
        setVersion(currentVersion);

        const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${currentVersion}/data/ko_KR/champion.json`);
        const cData = await cRes.json();
        setChampions(Object.values(cData.data));
      } catch (err) {
        setError("챔피언 데이터를 불러오지 못했습니다.");
      }
    };
    fetchData();
  }, []);

  const pickedIds = useMemo(() => {
    const ids = new Set<string>();
    [state.blue, state.red].forEach(t => {
      [...t.ban, ...t.pick].forEach(c => {
        if (c) ids.add(c.id);
      });
    });
    return ids;
  }, [state]);

  const filteredChampions = useMemo(() => {
    return champions.filter(c => {
      const nameMatch = c.name.includes(search) || c.id.toLowerCase().includes(search.toLowerCase());
      const roleMatch = roleFilter === "ALL" || ROLE_MAP[roleFilter]?.includes(c.name);
      return nameMatch && roleMatch;
    });
  }, [champions, search, roleFilter]);

  const handleSelect = (champ: Champion) => {
    if (pickedIds.has(champ.id)) {
      setError(`"${champ.name}"은(는) 이미 선택되었습니다.`);
      return;
    }
    if (currentStep >= PICK_ORDER.length) return;

    setError("");
    const order = PICK_ORDER[currentStep];
    const newState = { ...state };
    
    // Find first empty slot
    const slots = newState[order.team][order.type];
    const emptyIndex = slots.findIndex(s => s === null);
    
    if (emptyIndex !== -1) {
      slots[emptyIndex] = champ;
      setState(newState);
      setCurrentStep(prev => prev + 1);
    }
  };

  const getPhaseInfo = () => {
    if (currentStep >= PICK_ORDER.length) return "밴픽 완료";
    const order = PICK_ORDER[currentStep];
    const teamName = order.team === 'blue' ? "블루팀" : "레드팀";
    const typeName = order.type === 'ban' ? "밴" : "픽";
    return `${teamName} ${typeName} 단계`;
  };

  const reset = () => {
    setState({
      blue: { ban: Array(5).fill(null), pick: Array(5).fill(null) },
      red: { ban: Array(5).fill(null), pick: Array(5).fill(null) }
    });
    setCurrentStep(0);
    setError("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <header className="max-w-6xl mx-auto text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-transparent mb-2">
          League of Legends 밴픽 시뮬레이터
        </h1>
        <div className="flex items-center justify-center gap-4 text-lg">
          <span className={`px-4 py-1 rounded-full border ${currentStep >= PICK_ORDER.length ? 'bg-green-500/20 border-green-500' : 'bg-slate-800 border-slate-700'}`}>
            {getPhaseInfo()}
          </span>
          <button 
            onClick={reset}
            className="text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded transition-colors"
          >
            초기화
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Blue Team Side */}
        <div className="lg:col-span-3 space-y-6">
          <TeamSection team="blue" data={state.blue} active={PICK_ORDER[currentStep]?.team === 'blue'} />
        </div>

        {/* Champion Selection Center */}
        <div className="lg:col-span-6 space-y-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="챔피언 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {["ALL", "TOP", "JUN", "MID", "ADC", "SUP"].map(role => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    roleFilter === role ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {role === "ALL" ? "전체" : role}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg flex items-center gap-2 text-sm animate-pulse">
              <ShieldAlert className="w-4 h-4" /> {error}
            </div>
          )}

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 max-h-[500px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700">
            {filteredChampions.map(champ => (
              <div 
                key={champ.id}
                onClick={() => handleSelect(champ)}
                className={`relative group cursor-pointer aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  pickedIds.has(champ.id) 
                  ? 'border-slate-800 grayscale opacity-40 cursor-not-allowed' 
                  : 'border-transparent hover:border-yellow-500 hover:scale-105 active:scale-95'
                }`}
              >
                <img 
                  src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.image.full}`}
                  alt={champ.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-1">
                  <span className="text-[10px] font-medium truncate">{champ.name}</span>
                </div>
                {pickedIds.has(champ.id) && (
                   <div className="absolute inset-0 flex items-center justify-center">
                     <X className="text-white/50 w-8 h-8" />
                   </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Red Team Side */}
        <div className="lg:col-span-3 space-y-6">
          <TeamSection team="red" data={state.red} active={PICK_ORDER[currentStep]?.team === 'red'} />
        </div>
      </main>

      <footer className="mt-12 text-center text-slate-500 text-sm">
        <p>LoL BanPick Simulator - Data from Riot Data Dragon</p>
      </footer>
    </div>
  );
}

// --- Sub Components ---

function TeamSection({ team, data, active }: { 
  team: 'blue' | 'red'; 
  data: BanPickState['blue'];
  active: boolean;
}) {
  const isBlue = team === 'blue';
  const colorClass = isBlue ? 'text-blue-400' : 'text-red-400';
  const borderColor = isBlue ? 'border-blue-500/30' : 'border-red-500/30';
  const activeBg = isBlue ? 'bg-blue-500/5' : 'bg-red-500/5';

  return (
    <div className={`p-4 rounded-2xl border ${borderColor} ${active ? `${activeBg} ring-2 ring-opacity-50 ${isBlue ? 'ring-blue-500' : 'ring-red-500'}` : 'bg-slate-900/30'} transition-all duration-500`}>
      <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
        <Trophy className="w-5 h-5" />
        {isBlue ? "블루팀" : "레드팀"}
      </h2>

      <div className="space-y-6">
        {/* Bans */}
        <div>
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2 font-bold">Bans</h3>
          <div className="flex gap-2">
            {data.ban.map((champ, i) => (
              <div key={i} className="w-12 h-12 bg-slate-800 rounded border border-slate-700 overflow-hidden flex items-center justify-center relative group">
                {champ ? (
                  <>
                    <img src={`https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champ.id}_0.jpg`} className="w-full h-full object-cover grayscale" alt="banned" />
                    <div className="absolute inset-0 bg-red-900/40" />
                  </>
                ) : (
                  <span className="text-slate-600 text-xs">{i + 1}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Picks */}
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-1 font-bold">Picks</h3>
          {data.pick.map((champ, i) => (
            <div key={i} className={`h-16 rounded-lg border flex items-center gap-3 overflow-hidden transition-all ${
              champ ? 'bg-slate-800 border-slate-700' : 'bg-slate-900/50 border-slate-800 border-dashed'
            }`}>
              {champ ? (
                <>
                  <div className="w-16 h-16 bg-slate-700 flex-shrink-0">
                    <img src={`https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champ.id}_0.jpg`} className="w-full h-full object-cover" alt="picked" />
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold ${colorClass}`}>{champ.name}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter">Slot {i + 1}</div>
                  </div>
                </>
              ) : (
                <div className="flex-1 text-center text-slate-700 text-sm font-medium italic">Empty Slot</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}