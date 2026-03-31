import { withAuth, signOut } from "@workos-inc/authkit-nextjs";
import Link from "next/link";

export default async function ProtectedPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  return (
    <>
      <nav>
        <div>
          <Link href="/">WorkOS + MonkEC</Link>
        </div>
        <div>
          <Link href="/" style={{ marginRight: "1rem" }}>
            Home
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
            style={{ display: "inline" }}
          >
            <button
              type="submit"
              style={{
                background: "none",
                border: "1px solid #ccc",
                padding: "0.4rem 1rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      <div className="container">
        <h1>Protected Dashboard</h1>
        <p>This page is only visible to authenticated users.</p>

        <div className="card">
          <h2>Your Profile</h2>
          <div className="user-details">
            <pre>
              {JSON.stringify(
                {
                  id: user.id,
                  email: user.email,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  profilePictureUrl: user.profilePictureUrl,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        <div className="card">
          <h2>Environment</h2>
          <p>
            WorkOS credentials are managed by MonkEC. The API key and client ID
            are wired from the <code>workos/credentials</code> entity into this
            application via environment variables.
          </p>
          {process.env.WORKOS_MODE && (
            <p>
              Mode: <code>{process.env.WORKOS_MODE}</code>
            </p>
          )}
          {process.env.WORKOS_DEFAULT_ORG_ID && (
            <p>
              Default Organization:{" "}
              <code>{process.env.WORKOS_DEFAULT_ORG_ID}</code>
              <br />
              <small>
                Provisioned by the <code>workos/organization</code> entity
              </small>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
