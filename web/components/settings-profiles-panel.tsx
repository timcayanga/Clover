"use client";

import { useState } from "react";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

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
  isPending: boolean;
  profileMessage: string | null;
  profileListMessage: string | null;
  onNewProfileNameChange: (value: string) => void;
  onRenameDraftChange: (profileId: string, value: string) => void;
  onCreateProfile: () => void;
  onRenameProfile: (profileId: string) => void;
  onSwitchProfile: (profileId: string) => void;
  onRemoveProfile: (profileId: string, profileName: string) => void;
};

export function SettingsProfilesPanel({
  workspaceName,
  userImageUrl,
  activeProfileId,
  profileList,
  profilesLoading,
  newProfileName,
  profileRenameDrafts,
  isPending,
  profileMessage,
  profileListMessage,
  onNewProfileNameChange,
  onRenameDraftChange,
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
        {profilesLoading && profileList.length === 0 ? (
          <article className="settings-action-card">
            <div>
              <h5>Loading profiles</h5>
              <p>Fetching your workspace list now.</p>
            </div>
          </article>
        ) : null}

        {profileList.map((profile) => {
          const isActive = profile.id === activeProfileId;
          const renameDraft = profileRenameDrafts[profile.id] ?? profile.name;
          const profileAvatar = profile.type === "personal" ? userImageUrl : null;
          const avatarFallback = profile.name || workspaceName;

          return (
            <article key={profile.id} className={`settings-action-card settings-profile-card${isActive ? " is-active" : ""}`}>
              <div className="settings-profile-summary settings-profile-summary--with-avatar">
                <span className="settings-profile-summary__avatar" style={profileAvatar ? undefined : getAvatarBackgroundStyle(avatarFallback)}>
                  {profileAvatar ? <img src={profileAvatar} alt="" /> : <span>{getAvatarInitials(avatarFallback)}</span>}
                </span>
                <div className="settings-profile-summary__copy">
                  <strong>{profile.name}</strong>
                  <p>{profile.type === "shared" ? "Shared" : "Personal"}</p>
                </div>
              </div>
              <div className="settings-profile-card__actions">
                <label className="settings-inline-field">
                  <span>Rename</span>
                  <input value={renameDraft} onChange={(event) => onRenameDraftChange(profile.id, event.target.value)} />
                </label>
                <div className="settings-profile-card__buttons">
                  <button type="button" className="button button-secondary button-small" disabled={isPending} onClick={() => onRenameProfile(profile.id)}>
                    Save name
                  </button>
                  <button type="button" className="button button-secondary button-small" disabled={isPending || isActive} onClick={() => onSwitchProfile(profile.id)}>
                    {isActive ? "Active" : "Switch"}
                  </button>
                  <button type="button" className="button button-danger button-small" disabled={isPending} onClick={() => onRemoveProfile(profile.id, profile.name)}>
                    Remove
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

      {profileMessage || profileListMessage ? <p className="settings-helper">{profileMessage ?? profileListMessage}</p> : null}
    </section>
  );
}
