import React,{ useRef, useState }from "react";
import MagicCircle from "./magicCircle";
import { Atom, Circle, Cross, Hexagon, LifeBuoy, Plus, Triangle, TriangleDashed } from "lucide-react";

interface Rune {
  id: number;
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
}


const Magic = () => {
    
    const runetype: Rune[] = [
        {id:1, name:"기초", icon: Circle, color: "#ffcc00", description:"기초 룬입니다."},
        {id:2, name:"증폭", icon: Triangle, color: "#ff4400", description:"마법의 위력을 증폭시킵니다."},
        {id:3, name:"치유", icon: Cross, color: "#0088ff", description:"상처를 치유합니다."},
        {id:4, name:"소환", icon: Atom, color: "#88ff00", description:"대상을 소환합니다"},
        {id:5, name:"보호", icon: Hexagon, color: "#cc00ff", description:"대상을 보호합니다."}
    ];
    const handeRune = (rune : Rune) => {
        console.log("룬 버튼 클릭됨");
    }
    return (
        <div className="flex flex-row p-4 gap-6">
            <div className="controls-panel">
                {/* 컨트롤 패널 */}
                <h2 className="title-header">마법진 제어판</h2>
                {/* 기본 조작 */}
                <div>
                    <h3>기본 조작</h3>
                    <button className="control-button">초기화 (Reset)</button>
                    <p className="text-xs text-gray-400 mt-1 mb-3">Shift 키: 원 생성 / 마법 발동</p>
                </div>
                {/* 룬 팔레트 */}
                <div>
                    <h3>룬 목록</h3>
                    <div className="rune-palette">
                        {runetype.map((rune) => (
                            <button key={rune.id} className="flex flex-row items-center gap-2 p-2 rounded-md hover:bg-gray-700 transition-colors"
                                onClick={() => handeRune(rune)}
                            >
                                {rune.icon && <rune.icon size={20} />} {rune.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {/* 마법진 디스플레이 영역 */}
            <MagicCircle />
        </div>
    );
};

export default Magic;
