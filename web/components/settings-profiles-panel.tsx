"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

type ProfileSummary = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
};

type SettingsProfilesPanelProps = {
  workspaceName: string;
  userImageUrl: string | null;
  activeProfileId: string;
  profileList: ProfileSummary[];
  profilesLoading: boolean;
  newProfileName: string;
  profileRenameDrafts: Record<string, string>;
  defaultProfileId: string;
  workspaceDefaults: {
    defaultLandingPage: "dashboard" | "transactions" | "accounts" | "reports";
    defaultImportProfileId: string;
  };
  isPending: boolean;
  profileMessage: string | null;
  profileListMessage: string | null;
  onNewProfileNameChange: (value: string) => void;
  onRenameDraftChange: (profileId: string, value: string) => void;
  onWorkspaceDefaultsChange: Dispatch<
    SetStateAction<{
      defaultLandingPage: "dashboard" | "transactions" | "accounts" | "reports";
      defaultImportProfileId: string;
    }>
  >;
  onCreateProfile: () => void;
  onRenameProfile: (profileId: string) => void;
  onSwitchProfile: (profileId: string) => void;
  onRemoveProfile: (profileId: string, profileName: string) => void;
};

export function SettingsProfilesPanel({
  workspaceName: _workspaceName,
  userImageUrl,
  activeProfileId,
  profileList,
  profilesLoading: _profilesLoading,
  newProfileName,
  profileRenameDrafts,
  defaultProfileId,
  workspaceDefaults,
  isPending,
  profileMessage,
  profileListMessage,
  onNewProfileNameChange,
  onRenameDraftChange,
  onWorkspaceDefaultsChange,
  onCreateProfile,
  onRenameProfile,
  onSwitchProfile,
  onRemoveProfile,
}: SettingsProfilesPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <section className="settings-section settings-section--swap" role="tabpanel">
      <div className="settings-section__intro settings-section__intro--single">
        <div>
          <h4>Profiles</h4>
        </div>
      </div>

      <div className="settings-profile-cards">
        {profileList.map((profile) => {
          const isActive = profile.id === activeProfileId;
          const isDefault = profile.id === defaultProfileId;
          const renameDraft = profileRenameDrafts[profile.id] ?? profile.name;
          const profileAvatar = profile.type === "personal" ? userImageUrl : null;

          return (
            <article key={profile.id} className={`settings-action-card settings-profile-card${isActive ? " is-active" : ""}`}>
              <div className="settings-profile-summary settings-profile-summary--with-avatar">
                <span className="settings-profile-summary__avatar" aria-hidden="true">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="" />
                  ) : (
                    <img className="settings-profile-summary__avatar-icon" src="/assets/3d%20icons/account.png" alt="" />
                  )}
                </span>
                <div className="settings-profile-summary__copy">
                  <strong>{profile.name}</strong>
                  <p>{isDefault ? "Personal · Default profile" : profile.type === "shared" ? "Shared" : "Personal"}</p>
                </div>
              </div>
              <div className="settings-profile-card__actions">
                <label className="settings-inline-field">
                  <span>Rename</span>
                  <input value={renameDraft} disabled={isDefault} onChange={(event) => onRenameDraftChange(profile.id, event.target.value)} />
                </label>
                <div className="settings-profile-card__buttons">
                  <button type="button" className="button button-secondary button-small" disabled={isPending || isDefault} onClick={() => onRenameProfile(profile.id)}>
                    {isDefault ? "Default" : "Save name"}
                  </button>
                  <button type="button" className="button button-secondary button-small" disabled={isPending || isActive} onClick={() => onSwitchProfile(profile.id)}>
                    {isActive ? "Active" : "Switch"}
                  </button>
                  <button type="button" className="button button-danger button-small" disabled={isPending || isDefault} onClick={() => onRemoveProfile(profile.id, profile.name)}>
                    {isDefault ? "Required" : "Remove"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="settings-profile-create">
        {isCreateOpen ? (
          <div className="settings-profile-create__form">
            <label className="settings-inline-field">
              <span>Profile name</span>
              <input
                value={newProfileName}
                onChange={(event) => onNewProfileNameChange(event.target.value)}
                placeholder="Personal, Shared, Partner..."
              />
            </label>
            <button type="button" className="button button-primary button-small" disabled={isPending} onClick={onCreateProfile}>
              Create profile
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="button button-secondary button-small settings-profile-create__toggle"
          onClick={() => setIsCreateOpen((current) => !current)}
        >
          Create Profile
        </button>
      </div>

      <article className="settings-action-card settings-profile-defaults">
        <div className="settings-account-card__head">
          <h5>Workspace Defaults</h5>
        </div>
        <div className="settings-profile-defaults__grid">
          <label className="settings-inline-field">
            <span>Default landing page</span>
            <select
              value={workspaceDefaults.defaultLandingPage}
              onChange={(event) =>
                onWorkspaceDefaultsChange((current) => ({
                  ...current,
                  defaultLandingPage: event.target.value as typeof current.defaultLandingPage,
                }))
              }
            >
              <option value="dashboard">Dashboard</option>
              <option value="transactions">Transactions</option>
              <option value="accounts">Accounts</option>
              <option value="reports">Reports</option>
            </select>
          </label>

          <label className="settings-inline-field">
            <span>Default import profile</span>
            <select
              value={workspaceDefaults.defaultImportProfileId}
              onChange={(event) =>
                onWorkspaceDefaultsChange((current) => ({
                  ...current,
                  defaultImportProfileId: event.target.value,
                }))
              }
            >
              {profileList.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.id === defaultProfileId ? " (Personal)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {profileMessage || profileListMessage ? <p className="settings-helper">{profileMessage ?? profileListMessage}</p> : null}
    </section>
  );
}
