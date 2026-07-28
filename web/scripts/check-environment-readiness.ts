import { buildProductionReadinessReport } from "@/lib/production-readiness";

const report = buildProductionReadinessReport(process.env);

console.log(
  JSON.stringify(
    {
      ready: report.ready,
      environment: report.environment,
      generatedAt: report.generatedAt,
      checks: report.checks,
    },
    null,
    2
  )
);

if (!report.ready) {
  process.exitCode = 1;
}
