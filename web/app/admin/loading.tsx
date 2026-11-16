const navItems = ["Home", "Users", "Support", "Operations", "Analytics", "Audit logs", "Errors", "Inquiries", "Data QA"];

export default function AdminLoading() {
  return (
    <div className="admin-page-shell admin-page-shell--loading" aria-busy="true" aria-label="Loading Admin">
      <header className="admin-page-header">
        <div className="admin-loading-block admin-loading-block--title" />
      </header>
      <nav className="admin-section-nav" aria-label="Admin sections">
        {navItems.map((item) => (
          <span className="admin-section-nav__link" key={item}>{item}</span>
        ))}
      </nav>
      <div className="admin-page__content admin-loading-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="admin-loading-card" key={index}>
            <span className="admin-loading-block admin-loading-block--label" />
            <span className="admin-loading-block admin-loading-block--value" />
            <span className="admin-loading-block admin-loading-block--line" />
          </div>
        ))}
      </div>
    </div>
  );
}
