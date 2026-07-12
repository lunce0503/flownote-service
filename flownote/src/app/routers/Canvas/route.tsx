import { useParams } from "react-router-dom";
import { CanvasWidget } from "@/widgets";

export default function CanvasRoute() {
    // canvasId가 바뀌면 위젯을 리마운트해 해당 캔버스를 새로 연다(URL이 곧 선택 캔버스).
    const { canvasId } = useParams<{ canvasId: string }>();
    return <CanvasWidget key={canvasId} />;
}
