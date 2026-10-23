import { useState, useEffect, useRef } from 'react';
import {
  LogIn,
  LogOut,
  User,
  Download,
  Trash2,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { api, setToken } from './api';
import type { UserProfile } from '../server/auth/types';

interface AuthConfig {
  googleClientId: string;
  hasGoogleAuth: boolean;
  cloudStorage: boolean;
}

interface LegacyDataStatus {
  hasLegacy: boolean;
  chatsCount: number;
  memoriesCount: number;
  remindersCount: number;
  goalsCount: number;
}

export function GoogleAuthManager({
  user,
  onUserChange,
  legacyStatus,
  onLegacyMigrated,
}: {
  user: UserProfile | null;
  onUserChange: (user: UserProfile | null) => void;
  legacyStatus?: LegacyDataStatus;
  onLegacyMigrated?: () => void;
}) {
  const [config, setAuthConfig] = useState<AuthConfig | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationSuccess, setMigrationSuccess] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [testLoginEmail, setTestLoginEmail] = useState('');
  const [testLoginName, setTestLoginName] = useState('');

  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch auth config
    api<AuthConfig>('/auth/config')
      .then((cfg) => setAuthConfig(cfg))
      .catch((err) => console.warn('[GoogleAuth] Could not load auth config:', err));
  }, []);

  // Initialize Google Identity Services
  useEffect(() => {
    if (!config?.googleClientId) return;

    const loadScript = () => {
      if (document.getElementById('google-gsi-script')) return;
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initializeGsi();
      document.head.appendChild(script);
    };

    const initializeGsi = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;

      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      if (googleBtnRef.current) {
        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 250,
        });
      }
    };

    if ((window as any).google?.accounts?.id) {
      initializeGsi();
    } else {
      loadScript();
    }
  }, [config?.googleClientId, showModal]);

  const handleGoogleCredentialResponse = async (response: any) => {
    setAuthError(null);
    try {
      const result = await api<{
        ok: boolean;
        token: string;
        user: UserProfile;
        legacyDataFound?: LegacyDataStatus;
      }>('/auth/google', 'POST', {
        credential: response.credential,
      });

      if (result.ok && result.token) {
        setToken(result.token);
        onUserChange(result.user);
        setShowModal(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Google sign-in failed. Please try again.');
    }
  };

  const handleDevTestLogin = async () => {
    setAuthError(null);
    const email = testLoginEmail.trim() || 'test.user@opendots.local';
    const name = testLoginName.trim() || 'Test Explorer';
    const mockToken = `test-mock-token:${email}:${name}:${Date.now()}`;

    try {
      const result = await api<{
        ok: boolean;
        token: string;
        user: UserProfile;
      }>('/auth/google', 'POST', {
        credential: mockToken,
      });

      if (result.ok && result.token) {
        setToken(result.token);
        onUserChange(result.user);
        setShowModal(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Test login failed.');
    }
  };

  const handleSignOut = async () => {
    try {
      await api('/auth/logout', 'POST');
    } catch {}
    setToken('');
    onUserChange(null);
    setShowAccountModal(false);
  };

  const handleMigrate = async () => {
    setIsMigrating(true);
    setMigrationSuccess(null);
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        migrated: {
          migratedChats: number;
          migratedMemories: number;
          migratedReminders: number;
          migratedGoals: number;
        };
      }>('/auth/migrate-legacy', 'POST');

      if (res.ok) {
        setMigrationSuccess(
          `Successfully migrated ${res.migrated.migratedChats} conversations and ${res.migrated.migratedMemories} memories!`,
        );
        onLegacyMigrated?.();
      }
    } catch (err: any) {
      alert(`Migration error: ${err.message || 'Could not migrate data.'}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await api<any>('/auth/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opendots-export-${user?.name?.replace(/\s+/g, '_') || 'user'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message || 'Could not export data.'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (confirmEmailInput.trim().toLowerCase() !== user.email.toLowerCase()) {
      alert('Please enter your exact email address to confirm deletion.');
      return;
    }

    try {
      await api('/auth/account', 'DELETE', {
        confirmEmail: confirmEmailInput.trim(),
      });
      alert('Your account and all associated data have been deleted.');
      setToken('');
      onUserChange(null);
      setDeleteConfirmOpen(false);
      setShowAccountModal(false);
    } catch (err: any) {
      alert(`Deletion error: ${err.message || 'Could not delete account.'}`);
    }
  };

  return (
    <>
      {/* Sidebar Profile / Sign-in Badge */}
      <div className="sidebar-auth-section">
        {user ? (
          <button
            className="sidebar-user-badge"
            onClick={() => setShowAccountModal(true)}
            title="Account & Storage Settings"
          >
            <div className="user-avatar-wrap">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="user-avatar-img"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="user-avatar-initials">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="user-cloud-indicator" title="Permanent Cloud Storage Enabled">
                <Cloud size={10} />
              </span>
            </div>
            <div className="user-badge-info">
              <span className="user-badge-name">{user.name}</span>
              <span className="user-badge-email">{user.email}</span>
            </div>
          </button>
        ) : (
          <button
            className="sidebar-signin-button"
            onClick={() => setShowModal(true)}
          >
            <LogIn size={15} />
            <span>Sign in with Google</span>
          </button>
        )}
      </div>

      {/* Sign-In Modal */}
      {showModal && (
        <div className="opendots-modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="opendots-modal-card auth-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="opendots-modal-header">
              <div className="modal-title-with-icon">
                <Shield size={20} className="modal-title-icon" />
                <h3>Sign in to OpenDots</h3>
              </div>
              <button
                className="icon-button close-modal-button"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="auth-modal-body">
              <p className="auth-modal-desc">
                Connect your Google account to unlock <strong>permanent cloud memory</strong>, multi-device synchronization, and keep all your chat history and reminders safe across server redeployments.
              </p>

              {authError && (
                <div className="auth-error-banner">
                  <AlertCircle size={16} />
                  <span>{authError}</span>
                </div>
              )}

              {config?.googleClientId ? (
                <div className="google-btn-container">
                  <div ref={googleBtnRef}></div>
                </div>
              ) : (
                <div className="auth-setup-notice">
                  <div className="notice-icon">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h4>Google OAuth Setup</h4>
                    <p>
                      <code>GOOGLE_CLIENT_ID</code> is not yet configured in server environment.
                      You can test sign-in below or add your client ID in Render.
                    </p>
                  </div>
                </div>
              )}

              {/* Developer / Testing sign-in fallback */}
              {(!config?.googleClientId || process.env.NODE_ENV !== 'production') && (
                <div className="dev-test-auth-box">
                  <span className="dev-test-label">Instant Explorer Login:</span>
                  <div className="dev-test-inputs">
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={testLoginName}
                      onChange={(e) => setTestLoginName(e.target.value)}
                      className="dev-input"
                    />
                    <input
                      type="email"
                      placeholder="you@gmail.com"
                      value={testLoginEmail}
                      onChange={(e) => setTestLoginEmail(e.target.value)}
                      className="dev-input"
                    />
                    <button
                      className="cta-button primary-btn"
                      onClick={handleDevTestLogin}
                    >
                      Continue with Account
                    </button>
                  </div>
                </div>
              )}

              <div className="auth-benefits-list">
                <div className="benefit-item">
                  <CheckCircle2 size={15} className="benefit-check" />
                  <span>Permanent cloud storage that survives server restarts</span>
                </div>
                <div className="benefit-item">
                  <CheckCircle2 size={15} className="benefit-check" />
                  <span>Access conversations & reminders from any phone or browser</span>
                </div>
                <div className="benefit-item">
                  <CheckCircle2 size={15} className="benefit-check" />
                  <span>Isolated personal workspace & zero data leakage</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {showAccountModal && user && (
        <div className="opendots-modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div
            className="opendots-modal-card account-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="opendots-modal-header">
              <div className="modal-title-with-icon">
                <User size={20} className="modal-title-icon" />
                <h3>Account & Storage</h3>
              </div>
              <button
                className="icon-button close-modal-button"
                onClick={() => setShowAccountModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="account-modal-body">
              <div className="account-user-card">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="account-large-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="account-large-initials">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="account-card-details">
                  <h4>{user.name}</h4>
                  <p className="account-email-text">{user.email}</p>
                  <span className="account-badge-verified">
                    <CheckCircle2 size={13} /> Verified Google Account
                  </span>
                </div>
              </div>

              {/* Cloud Storage Posture */}
              <div className="storage-status-card">
                <div className="storage-status-header">
                  <Database size={16} />
                  <span>Cloud Persistence Status</span>
                </div>
                <p className="storage-status-desc">
                  {config?.cloudStorage ? (
                    <span className="status-green">
                      ● Active — Connected to durable Cloud PostgreSQL. All conversations, preferences, and reminders are safely backed up.
                    </span>
                  ) : (
                    <span className="status-amber">
                      ● Local Storage — Active on SQLite. To enable permanent storage across Render restarts, set <code>DATABASE_URL</code> in Render dashboard.
                    </span>
                  )}
                </p>
              </div>

              {/* Data Migration Option (if legacy data exists) */}
              {legacyStatus?.hasLegacy && (
                <div className="migration-card">
                  <div className="migration-header">
                    <RefreshCw size={16} />
                    <span>Import Local OpenDots History</span>
                  </div>
                  <p className="migration-desc">
                    Found {legacyStatus.chatsCount} local conversation(s) and {legacyStatus.memoriesCount} memory record(s) from before you signed in.
                  </p>
                  {migrationSuccess ? (
                    <div className="migration-success-msg">
                      <CheckCircle2 size={15} />
                      <span>{migrationSuccess}</span>
                    </div>
                  ) : (
                    <button
                      className="cta-button secondary-btn"
                      onClick={handleMigrate}
                      disabled={isMigrating}
                    >
                      {isMigrating ? 'Migrating...' : 'Sync Local History into My Account'}
                    </button>
                  )}
                </div>
              )}

              {/* Actions: Export Data */}
              <div className="account-actions-section">
                <h4>Data Portability & Actions</h4>
                <div className="action-buttons-row">
                  <button
                    className="account-action-btn"
                    onClick={handleExportData}
                    disabled={isExporting}
                  >
                    <Download size={15} />
                    <span>{isExporting ? 'Exporting...' : 'Export My Data (JSON)'}</span>
                  </button>

                  <button
                    className="account-action-btn signout-btn"
                    onClick={handleSignOut}
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Danger Zone: Account Deletion */}
              <div className="danger-zone-section">
                <h4>Danger Zone</h4>
                {!deleteConfirmOpen ? (
                  <button
                    className="danger-button"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={15} />
                    <span>Delete Account & Data</span>
                  </button>
                ) : (
                  <div className="delete-confirm-box">
                    <p className="delete-warning-text">
                      This will permanently delete your account, memories, chats, and reminders. Type <strong>{user.email}</strong> to confirm:
                    </p>
                    <input
                      type="email"
                      value={confirmEmailInput}
                      onChange={(e) => setConfirmEmailInput(e.target.value)}
                      placeholder={user.email}
                      className="confirm-delete-input"
                    />
                    <div className="delete-actions-row">
                      <button
                        className="danger-button confirm-delete-btn"
                        onClick={handleDeleteAccount}
                      >
                        Permanently Delete Everything
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setConfirmEmailInput('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function LegacySyncBanner({
  legacyStatus,
  onMigrate,
  onDismiss,
}: {
  legacyStatus: LegacyDataStatus;
  onMigrate: () => void;
  onDismiss: () => void;
}) {
  if (!legacyStatus.hasLegacy) return null;

  return (
    <div className="legacy-sync-banner">
      <div className="legacy-banner-content">
        <Cloud size={16} className="legacy-banner-icon" />
        <span>
          Found {legacyStatus.chatsCount} chat(s) and {legacyStatus.memoriesCount} memory record(s) from before sign-in. Would you like to sync them to your account?
        </span>
      </div>
      <div className="legacy-banner-actions">
        <button className="banner-sync-btn" onClick={onMigrate}>
          Sync to Account
        </button>
        <button className="banner-dismiss-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
