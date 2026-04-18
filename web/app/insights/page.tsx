export { dynamic } from "../reports/page";

import { ReportsPageView } from "../reports/page";

export default async function InsightsPage() {
  return <ReportsPageView active="insights" />;
}
