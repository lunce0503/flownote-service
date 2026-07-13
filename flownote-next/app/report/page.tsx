import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const REPORT_PATH =
  process.env.REPORT_PATH ??
  path.resolve(process.cwd(), "..", "report", "server-db-role-report.html");

const readReport = async () => {
  try {
    return await readFile(REPORT_PATH, "utf-8");
  } catch {
    return `<!doctype html>
<html lang="ko">
  <body style="font-family: system-ui, sans-serif; padding: 32px;">
    <h1>보고서 파일을 찾을 수 없습니다.</h1>
    <p>REPORT_PATH: ${REPORT_PATH}</p>
  </body>
</html>`;
  }
};

const ReportPage = async () => {
  const report = await readReport();

  return (
    <main
      style={{
        background: "#050505",
        minHeight: "100vh",
        margin: 0,
      }}
    >
      <iframe
        title="Flownote 서버별 DB 역할 정리"
        srcDoc={report}
        style={{
          border: 0,
          display: "block",
          minHeight: "100vh",
          width: "100%",
        }}
      />
    </main>
  );
};

export default ReportPage;
