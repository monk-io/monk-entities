import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default async function ProtectedPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <>
      <nav>
        <div>
          <Link href="/">Clerk + MonkEC</Link>
        </div>
        <div>
          <Link href="/" style={{ marginRight: "1rem" }}>
            Home
          </Link>
          <UserButton />
        </div>
      </nav>

      <div className="container">
        <h1>Protected Dashboard</h1>
        <p>This page is only visible to authenticated users.</p>

        <div className="card">
          <h2>Your Profile</h2>
          <div className="user-details">
            <pre>{JSON.stringify({
              id: user.id,
              email: user.emailAddresses[0]?.emailAddress,
              firstName: user.firstName,
              lastName: user.lastName,
              createdAt: user.createdAt,
            }, null, 2)}</pre>
          </div>
        </div>

        <div className="card">
          <h2>Environment</h2>
          <p>
            Clerk credentials are managed by MonkEC. The publishable key and
            secret key are wired from the <code>clerk/credentials</code> entity
            into this application via environment variables.
          </p>
        </div>
      </div>
    </>
  );
}
