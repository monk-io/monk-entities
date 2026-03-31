import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <nav>
        <div>
          <Link href="/">WorkOS + MonkEC</Link>
        </div>
        <div>
          <Link href="/login" className="btn btn-outline">
            Sign In
          </Link>
        </div>
      </nav>

      <div className="hero">
        <h1>Next.js + WorkOS AuthKit + MonkEC</h1>
        <p>
          A production-ready B2B authentication stack. WorkOS AuthKit handles
          sign-in, sign-up, SSO, and session management. MonkEC provisions and
          wires the credentials and organizations.
        </p>
        <Link href="/login" className="btn">
          Sign In with AuthKit
        </Link>
      </div>

      <div className="container">
        <div className="card">
          <h2>How it works</h2>
          <ol style={{ lineHeight: "2" }}>
            <li>
              <strong>MonkEC</strong> validates your WorkOS API key and
              provisions a B2B organization
            </li>
            <li>
              <strong>AuthKit middleware</strong> protects routes and manages
              sessions with encrypted cookies
            </li>
            <li>
              <strong>WorkOS hosted auth</strong> provides sign-in/sign-up UI
              with SSO support
            </li>
            <li>
              <strong>Protected pages</strong> are only accessible to
              authenticated users
            </li>
          </ol>
        </div>
      </div>
    </>
  );
}
