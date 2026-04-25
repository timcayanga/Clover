"use client";

import { useMemo, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

type FieldKind = "text" | "select" | "textarea" | "toggle";

export type SettingOption = {
  label: string;
  helper?: string;
};

export type SettingField = {
  label: string;
  helper?: string;
  kind: FieldKind;
  tier?: "primary" | "advanced";
  value?: string;
  options?: SettingOption[];
  checked?: boolean;
  rows?: number;
  showAsCards?: boolean;
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

function getFieldValue(field: SettingField) {
  if (field.kind !== "select") {
    return "";
  }

  return field.value ?? field.options?.[0]?.label ?? "";
}

function renderField(field: SettingField, section: SettingSection) {
  const trackSettingsUpdated = (detail: Record<string, string | number | boolean | null>) => {
    capturePostHogClientEvent("settings_updated", {
      setting_group: section.group,
      setting_title: section.title,
      setting_label: field.label,
      setting_kind: field.kind,
      ...detail,
    });
  };

  if (field.kind === "toggle") {
    return (
      <label className="settings-toggle">
        <span className="settings-toggle__copy">
          <strong>{field.label}</strong>
          {field.helper ? <span>{field.helper}</span> : null}
        </span>
        <span className="settings-switch">
          <input
            type="checkbox"
            defaultChecked={field.checked ?? false}
            onChange={(event) => {
              trackSettingsUpdated({
                checked: event.target.checked,
              });
            }}
          />
          <span aria-hidden="true" />
        </span>
      </label>
    );
  }

  if (field.kind === "select" && field.showAsCards) {
    const name = `${slugify(section.group)}-${slugify(section.title)}-${slugify(field.label)}`;
    const selectedValue = getFieldValue(field);

    return (
      <fieldset className="settings-choice">
        <legend>
          <span>{field.label}</span>
          {field.helper ? <small>{field.helper}</small> : null}
        </legend>
        <div className="settings-choice__options">
          {(field.options ?? []).map((option) => (
            <label
              key={option.label}
              className={`settings-choice__option${selectedValue === option.label ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.label}
                defaultChecked={selectedValue === option.label}
                onChange={(event) => {
                  trackSettingsUpdated({
                    value: event.target.value,
                  });
                }}
              />
              <span className="settings-choice__label">{option.label}</span>
              {option.helper ? <span className="settings-choice__helper">{option.helper}</span> : null}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <label className="settings-field">
      <span>{field.label}</span>
      {field.kind === "select" ? (
        <select
          defaultValue={getFieldValue(field)}
          onChange={(event) => {
            trackSettingsUpdated({
              value: event.target.value,
            });
          }}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.label} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea
          defaultValue={field.value}
          rows={field.rows ?? 3}
          onBlur={(event) => {
            trackSettingsUpdated({
              value: event.target.value,
            });
          }}
        />
      ) : (
        <input
          defaultValue={field.value}
          onBlur={(event) => {
            trackSettingsUpdated({
              value: event.target.value,
            });
          }}
        />
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
          ...(field.options ?? []).map((option) => option.label),
        ]),
      ];

      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, sections]);

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

        <nav className="settings-submenu" aria-label="Settings sections">
          {visibleSections.map((section) => {
            const id = slugify(section.title);

            return (
              <a key={id} className="settings-submenu__link" href={`#${id}`}>
                <span className="settings-submenu__link-title">{section.title}</span>
                <span className="settings-submenu__link-summary">{section.summary}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="settings-main">
        {visibleSections.length ? (
          visibleSections.map((section) => {
            const id = slugify(section.title);
            const primaryFields = section.fields.filter((field) => field.tier !== "advanced");
            const advancedFields = section.fields.filter((field) => field.tier === "advanced");

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
                  {primaryFields.map((field) => (
                    <div key={field.label} className="settings-section-grid__item">
                      {renderField(field, section)}
                    </div>
                  ))}
                </div>

                {advancedFields.length ? (
                  <details className="settings-advanced">
                    <summary>
                      <span>More options</span>
                      <small>For power users who want finer control</small>
                    </summary>
                    <div className="settings-advanced__grid">
                      {advancedFields.map((field) => (
                        <div key={field.label} className="settings-section-grid__item">
                          {renderField(field, section)}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
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
