import Link from "next/link";
import type { AdminErrorLogListResponse } from "@/lib/admin-error-logs";

type AdminErrorLogsTableProps = {
  data: AdminErrorLogListResponse;
  query: string;
};

const formatDateTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatValue = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return value;
};

export function AdminErrorLogsTable({ data, query }: AdminErrorLogsTableProps) {
  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("query", query.trim());
    }

    if (page > 1) {
      params.set("page", String(page));
    }

    const search = params.toString();
    return search ? `/admin/errors?${search}` : "/admin/errors";
  };

  const buildIds = Array.from(new Set(data.logs.map((log) => log.buildId))).slice(0, 5);

  return (
    <section className="admin-error-logs">
      <div className="admin-error-logs__summary table-panel">
        <div className="admin-users__hero-copy">
          <p className="eyebrow">Production only</p>
          <h2>Running error log</h2>
          <p>Search the exact message, capture time, build, route, and deployment context for every production error.</p>
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{data.totalCount.toLocaleString()}</strong>
            <span>Total logs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.logs.length.toLocaleString()}</strong>
            <span>Loaded on page</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.totalPages.toLocaleString()}</strong>
            <span>Pages</span>
          </div>
          <div className="admin-users__stat">
            <strong>{buildIds.length}</strong>
            <span>Recent builds</span>
          </div>
        </div>
      </div>

      <form className="admin-error-logs__toolbar" action="/admin/errors" method="get">
        <label className="admin-users__search">
          <span>Search error logs</span>
          <input type="search" name="query" placeholder="Search exact message, route, build..." defaultValue={query} />
        </label>
        <button className="button button-secondary button-small" type="submit">
          Search
        </button>
        <Link className="button button-secondary button-small" href="/admin/errors">
          Clear
        </Link>
      </form>

      <div className="admin-error-logs__pills">
        {buildIds.map((buildId) => (
          <span key={buildId} className="admin-users__pill admin-users__pill--locked">
            {buildId}
          </span>
        ))}
      </div>

      <div className="table-panel admin-error-logs__table-panel">
        <div className="admin-users__table-wrap">
          <table className="admin-users__table admin-error-logs__table">
            <thead>
              <tr>
                <th>Exact time</th>
                <th>Message</th>
                <th>Source</th>
                <th>Route</th>
                <th>Build</th>
                <th>Deployment</th>
                <th>Status</th>
                <th>User</th>
                <th>Workspace</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length ? (
                data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="admin-users__mono">{formatDateTime.format(new Date(log.occurredAt))}</span>
                    </td>
                    <td>
                      <strong>{log.message}</strong>
                      {log.name ? <div className="admin-error-logs__subtle">{log.name}</div> : null}
                    </td>
                    <td>{log.source}</td>
                    <td>{formatValue(log.route)}</td>
                    <td className="admin-users__mono">{log.buildId}</td>
                    <td className="admin-users__mono">{formatValue(log.deploymentId)}</td>
                    <td>{formatValue(log.statusCode !== null ? String(log.statusCode) : null)}</td>
                    <td>{formatValue(log.clerkUserId ?? log.userId)}</td>
                    <td>{formatValue(log.workspaceId)}</td>
                    <td>
                      <details className="admin-error-logs__details">
                        <summary>View stack</summary>
                        <div className="admin-error-logs__detail-body">
                          <div>
                            <span>URL</span>
                            <strong>{formatValue(log.url)}</strong>
                          </div>
                          <div>
                            <span>User agent</span>
                            <strong>{formatValue(log.userAgent)}</strong>
                          </div>
                          <div>
                            <span>Environment</span>
                            <strong>{log.environment}</strong>
                          </div>
                          <pre>{log.stack ?? "No stack available."}</pre>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="admin-error-logs__empty" colSpan={10}>
                    No production errors match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-users__pager">
        <span>
          Page {data.page} of {data.totalPages}
        </span>
        <div>
          <Link
            className="button button-secondary button-small"
            href={buildPageHref(Math.max(1, data.page - 1))}
            prefetch={false}
            aria-disabled={data.page <= 1}
          >
            Previous
          </Link>
          <Link
            className="button button-secondary button-small"
            href={buildPageHref(Math.min(data.totalPages, data.page + 1))}
            prefetch={false}
            aria-disabled={data.page >= data.totalPages}
          >
            Next
          </Link>
        </div>
      </div>
    </section>
  );
}
