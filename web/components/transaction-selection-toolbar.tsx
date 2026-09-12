"use client";
import "./transaction-selection-toolbar.css";

type Props = {
  compact?: boolean; warningCount?: number; count: number; query: string; onQueryChange: (query: string) => void;
  filterOpen: boolean; onFilter: () => void; onEdit: () => void; onTags: () => void; onDelete: () => void; onClear: () => void;
};
export function TransactionSelectionToolbar({ compact, warningCount = 0, count, query, onQueryChange, filterOpen, onFilter, onEdit, onTags, onDelete, onClear }: Props) {
  return <div className={`transaction-selection-toolbar${compact ? " transaction-selection-toolbar--compact" : ""}${count ? " transaction-selection-toolbar--selected" : ""}`}>
    {count ? <>
      <span className="transaction-selection-toolbar__count" role="status">{count} selected</span>
      <div className="transaction-selection-toolbar__actions" role="group" aria-label="Selected transaction actions">
        <button className="button button-secondary button-small transactions-action-button" type="button" onClick={onEdit}>Edit</button>
        <button className="button button-secondary button-small transactions-action-button" type="button" onClick={onTags}>Tags</button>
        <button className="button button-secondary button-small transactions-action-button transaction-selection-toolbar__delete" type="button" onClick={onDelete}>Delete</button>
        <button className="button button-ghost button-small" type="button" onClick={onClear}>Clear</button>
      </div>
    </> : <>
      <input type="search" aria-label="Search" placeholder="Search" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      <button type="button" className="button button-secondary button-small transactions-action-button transaction-selection-toolbar__filter" onClick={onFilter} aria-label="Filter transactions" aria-expanded={filterOpen}>Filters{compact && warningCount > 0 ? <span className="transaction-filter-warning" aria-label={`${warningCount} warnings`}><span className="warning-mark warning-mark--small" aria-hidden="true" />{warningCount}</span> : null}</button>
    </>}
  </div>;
}
