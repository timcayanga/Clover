"use client";

import { useMemo, useState } from "react";

type FieldKind = "text" | "select" | "textarea" | "toggle";

export type SettingField = {
  label: string;
  helper?: string;
  kind: FieldKind;
  value?: string;
  options?: string[];
  checked?: boolean;
  rows?: number;
};

export type SettingSection = {
  group: string;
  title: string;
  eyebrow: string;
  summary: string;
  fields: SettingField[];
};

type SettingsCenterProps = {
  sections: SettingSection[];
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function renderField(field: SettingField) {
  if (field.kind === "toggle") {
    return (
      <label className="settings-toggle">
        <span className="settings-toggle__copy">
          <strong>{field.label}</strong>
          {field.helper ? <span>{field.helper}</span> : null}
        </span>
        <span className="settings-switch">
          <input type="checkbox" defaultChecked={field.checked ?? false} />
          <span aria-hidden="true" />
        </span>
      </label>
    );
  }

  return (
    <label className="settings-field">
      <span>{field.label}</span>
      {field.kind === "select" ? (
        <select defaultValue={field.value}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea defaultValue={field.value} rows={field.rows ?? 3} />
      ) : (
        <input defaultValue={field.value} />
      )}
      {field.helper ? <small>{field.helper}</small> : null}
    </label>
  );
}

export function SettingsCenter({ sections }: SettingsCenterProps) {
  const [query, setQuery] = useState("");

  const visibleSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return sections;
    }

    return sections.filter((section) => {
      const haystacks = [
        section.group,
        section.eyebrow,
        section.title,
        section.summary,
        ...section.fields.flatMap((field) => [
          field.label,
          field.helper ?? "",
          field.value ?? "",
          ...(field.options ?? []),
        ]),
      ];

      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, sections]);

  const groups = useMemo(() => {
    const map = new Map<string, SettingSection[]>();

    sections.forEach((section) => {
      const bucket = map.get(section.group) ?? [];
      bucket.push(section);
      map.set(section.group, bucket);
    });

    return Array.from(map.entries()).map(([group, items]) => ({
      group,
      items,
      visibleItems: items.filter((section) => visibleSections.includes(section)),
    }));
  }, [sections, visibleSections]);

  const jumpLinks = visibleSections;

  return (
    <section className="settings-layout">
      <aside className="settings-sidebar glass">
        <label className="settings-search" htmlFor="settings-search">
          <span>Search settings</span>
          <input
            id="settings-search"
            type="search"
            placeholder="Search sections, controls, or notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <nav className="settings-submenu" aria-label="Settings submenus">
          {groups.map((group) => (
            <div key={group.group} className="settings-submenu__group">
              <span className="settings-submenu__title">{group.group}</span>
              <div className="settings-submenu__links">
                {group.visibleItems.map((section) => {
                  const id = slugify(section.title);

                  return (
                    <a key={id} className="settings-submenu__link" href={`#${id}`}>
                      {section.title}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="settings-jump">
          <span className="settings-jump__label">Jump To</span>
          <div className="settings-jump__items">
            {jumpLinks.map((section) => {
              const id = slugify(section.title);

              return (
                <a key={id} className="settings-jump__item" href={`#${id}`}>
                  {section.title}
                </a>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="settings-main">
        {visibleSections.length ? (
          visibleSections.map((section) => {
            const id = slugify(section.title);

            return (
              <article key={section.title} id={id} className="settings-card glass">
                <div className="settings-card__head">
                  <div>
                    <p className="eyebrow">{section.eyebrow}</p>
                    <h4>{section.title}</h4>
                  </div>
                  <p className="settings-card__summary">{section.summary}</p>
                </div>

                <div className="settings-section-grid">
                  {section.fields.map((field) => (
                    <div key={field.label} className="settings-section-grid__item">
                      {renderField(field)}
                    </div>
                  ))}
                </div>

                <div className="settings-card__footer">
                  <span>Changes are surfaced here first, then wired to persistence next.</span>
                  <div className="settings-card__actions">
                    <button className="button button-secondary button-small" type="button">
                      Reset section
                    </button>
                    <button className="button button-primary button-small" type="button">
                      Save section
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="settings-empty glass">
            <h4>No settings match your search.</h4>
            <p>Try a broader keyword, or clear the search to see every section again.</p>
          </div>
        )}
      </div>
    </section>
  );
}
