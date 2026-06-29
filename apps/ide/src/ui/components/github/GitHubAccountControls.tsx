import { useGitHub } from "@app";
import "./GitHubDialog.css";

/** Inline GitHub account affordance (#159) — signed-out shows a sign-in button,
 *  signed-in shows the username, the paired repo (or a prompt to choose one), and
 *  sign-out. Renders nothing when GitHub isn't configured for this build. Used in
 *  the Welcome header (and reusable elsewhere). `onManage` opens the repo picker. */
export function GitHubAccountControls({ onManage }: { onManage?: () => void }) {
  const gh = useGitHub();
  if (!gh.available || !gh.ready) return null;

  if (gh.signedIn && gh.user) {
    return (
      <div className="gh-acct">
        {gh.user.avatarUrl && (
          <img className="gh-acct__avatar" src={gh.user.avatarUrl} alt="" width={20} height={20} />
        )}
        <span className="gh-acct__login">{gh.user.login}</span>
        {onManage &&
          (gh.repo ? (
            <button type="button" className="gh-acct__repo" onClick={onManage} title="Change repo">
              {gh.repo}
            </button>
          ) : (
            <button type="button" className="gh-acct__btn gh-acct__btn--primary" onClick={onManage}>
              Choose repo
            </button>
          ))}
        <button type="button" className="gh-acct__btn" onClick={gh.signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="gh-acct">
      <button type="button" className="gh-acct__btn gh-acct__btn--primary" onClick={gh.signIn}>
        Sign in with GitHub
      </button>
      <a
        className="gh__help"
        href="https://madside.dev/docs/using/github/"
        target="_blank"
        rel="noopener noreferrer"
        title="What is this? Read about GitHub sync"
        aria-label="What is this? Read about GitHub sync"
      >
        ?
      </a>
      {gh.error && <span className="gh-acct__error" title={gh.error}>sign-in failed</span>}
    </div>
  );
}
