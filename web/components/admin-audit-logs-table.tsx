import Link from "next/link";
import type { AdminAuditLogResponse } from "@/lib/admin-analytics";

const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

export function AdminAuditLogsTable({ data, query }: { data: AdminAuditLogResponse; query: string }) {
  const hrefForPage = (page: number) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/admin/logs?${search}` : "/admin/logs";
  };

  return (
    <section className="admin-audit-logs">
      <div className="admin-analytics-workspace__hero table-panel">
        <div>
          <p className="eyebrow">Traceability</p>
          <h2>Audit activity across production workspaces.</h2>
          <p className="panel-muted">Use this for user-impacting changes, Adviser actions, transaction edits, imports, and other durable records.</p>
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat"><strong>{data.totalCount.toLocaleString()}</strong><span>Total audit entries</span></div>
          <div className="admin-users__stat"><strong>{data.logs.length.toLocaleString()}</strong><span>Loaded on page</span></div>
        </div>
      </div>
      <form className="admin-error-logs__toolbar" action="/admin/logs" method="get">
        <label className="admin-users__search"><span>Search audit logs</span><input type="search" name="query" placeholder="Action, entity, user id..." defaultValue={query} /></label>
        <button className="button button-secondary button-small" type="submit">Search</button>
        <Link className="button button-secondary button-small" href="/admin/logs">Clear</Link>
      </form>
      <div className="table-panel admin-error-logs__table-panel">
        <div className="admin-users__table-wrap">
          <table className="admin-users__table admin-audit-logs__table">
            <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>User</th><th>Workspace</th><th>Actor</th><th>Metadata</th></tr></thead>
            <tbody>
              {data.logs.length ? data.logs.map((log) => (
                <tr key={log.id}>
                  <td className="admin-users__mono">{dateFormatter.format(new Date(log.createdAt))}</td>
                  <td><strong>{log.action}</strong></td>
                  <td>{log.entity}{log.entityId ? <div className="admin-error-logs__subtle admin-users__mono">{log.entityId}</div> : null}</td>
                  <td>{log.userEmail}</td>
                  <td>{log.workspaceName}</td>
                  <td className="admin-users__mono">{log.actorUserId}</td>
                  <td><details className="admin-error-logs__details"><summary>View</summary><pre>{log.metadata ? JSON.stringify(log.metadata, null, 2) : "No metadata."}</pre></details></td>
                </tr>
              )) : <tr><td className="admin-error-logs__empty" colSpan={7}>No production audit entries match this search.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="admin-users__pager"><span>Page {data.page} of {data.totalPages}</span><div><Link className="button button-secondary button-small" href={hrefForPage(Math.max(1, data.page - 1))}>Previous</Link><Link className="button button-secondary button-small" href={hrefForPage(Math.min(data.totalPages, data.page + 1))}>Next</Link></div></div>
    </section>
  );
}
