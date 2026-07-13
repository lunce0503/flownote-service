import { useCallback, useEffect, useState } from "react";
import { Activity, Database, HardDrive, RefreshCw, Server } from "lucide-react";
import { Navigate } from "react-router-dom";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import { useAuth } from "@/features/auth";
import { readCanvasDeviceDiagnostics, type CanvasDeviceDiagnostic } from "@/features/canvas";

type Summary = {
  database?: string;
  requestQueue?: { active?: number; queued?: number; capacity?: number; workers?: number };
  storageJobs?: { counts?: Array<{ status: string; count: number }> };
  retentionDays?: number;
  checkedAt?: string;
};

type OperationEvent = {
  id: number;
  request_id: string;
  canvas_id?: string;
  operation_type: string;
  trigger_type: string;
  priority: number;
  status: string;
  error_code?: string;
  queue_ms?: number;
  total_ms?: number;
  created_at: string;
};

const AdminCanvasRoute = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<OperationEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deviceEvents, setDeviceEvents] = useState<CanvasDeviceDiagnostic[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    void readCanvasDeviceDiagnostics().then(setDeviceEvents);
    if (!API_CORE_BASE_URL) {
      setError("Core API URL이 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    try {
      const [summaryResponse, eventsResponse] = await Promise.all([
        fetch(`${API_CORE_BASE_URL}/api/admin/canvas/summary`, { headers: authHeaders() }),
        fetch(`${API_CORE_BASE_URL}/api/admin/canvas/events?limit=100`, { headers: authHeaders() }),
      ]);
      if (!summaryResponse.ok || !eventsResponse.ok) {
        throw new Error("관리자 진단 정보를 불러오지 못했습니다.");
      }
      setSummary(await summaryResponse.json() as Summary);
      setEvents(await eventsResponse.json() as OperationEvent[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "진단 정보 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  const jobCounts = summary?.storageJobs?.counts ?? [];
  return (
    <main className="min-h-[calc(100vh-64px)] bg-stone-100 text-stone-900">
      <section className="border-b border-stone-300 bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">캔버스 운영 진단</h1>
            <p className="mt-1 text-sm text-stone-500">최근 30일의 익명화된 요청 상태</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            title="새로고침" aria-label="새로고침">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-stone-300 md:grid-cols-4">
        {[
          { label: "PostgreSQL", value: summary?.database ?? "확인 중", icon: Database },
          { label: "실행 중", value: summary?.requestQueue?.active ?? 0, icon: Activity },
          { label: "대기 요청", value: summary?.requestQueue?.queued ?? 0, icon: Server },
          { label: "R2 작업", value: jobCounts.reduce((sum, item) => sum + Number(item.count), 0), icon: HardDrive },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-500"><Icon size={16} />{label}</div>
            <div className="mt-2 truncate text-2xl font-bold">{value}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-5 md:px-8">
        {error && <div className="mb-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <div className="overflow-x-auto border border-stone-300 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-stone-900 text-stone-100">
              <tr>{["시간", "작업", "트리거", "우선도", "상태", "큐", "전체", "오류"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-stone-200">
                  <td className="whitespace-nowrap px-3 py-3">{new Date(event.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3 font-semibold">{event.operation_type}</td>
                  <td className="px-3 py-3">{event.trigger_type}</td>
                  <td className="px-3 py-3">{event.priority}</td>
                  <td className="px-3 py-3">{event.status}</td>
                  <td className="px-3 py-3">{event.queue_ms ?? 0}ms</td>
                  <td className="px-3 py-3">{event.total_ms ?? 0}ms</td>
                  <td className="max-w-56 truncate px-3 py-3 text-red-700">{event.error_code ?? "-"}</td>
                </tr>
              ))}
              {!loading && events.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-stone-500">기록된 작업이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <h2 className="mt-6 text-base font-bold">이 기기의 최근 오류</h2>
        <div className="mt-2 overflow-x-auto border border-stone-300 bg-white">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-stone-200"><tr>{["시간", "작업", "그림판", "오류"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>
              {deviceEvents.map((event) => <tr key={event.id} className="border-t border-stone-200">
                <td className="whitespace-nowrap px-3 py-3">{new Date(event.createdAt).toLocaleString()}</td>
                <td className="px-3 py-3 font-semibold">{event.operation}</td>
                <td className="max-w-44 truncate px-3 py-3">{event.canvasId ?? "기본"}</td>
                <td className="max-w-96 truncate px-3 py-3 text-red-700">{event.message}</td>
              </tr>)}
              {deviceEvents.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-stone-500">이 기기에 기록된 오류가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};

export default AdminCanvasRoute;
