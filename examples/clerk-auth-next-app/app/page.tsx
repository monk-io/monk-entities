import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <nav>
        <div>
          <Link href="/">Clerk + MonkEC</Link>
        </div>
        <div>
          <SignedOut>
            <Link href="/sign-in" className="btn btn-outline">
              Sign In
            </Link>
            <Link href="/sign-up" className="btn">
              Sign Up
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/protected" style={{ marginRight: "1rem" }}>
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </nav>

      <div className="hero">
        <h1>Next.js + Clerk + MonkEC</h1>
        <p>
          A production-ready authentication stack. Clerk handles sign-in, sign-up,
          and session management. MonkEC provisions and wires the credentials.
        </p>
        <SignedOut>
          <Link href="/sign-up" className="btn">
            Get Started
          </Link>
          <Link href="/sign-in" className="btn btn-outline">
            Sign In
          </Link>
        </SignedOut>
        <SignedIn>
          <Link href="/protected" className="btn">
            Go to Dashboard
          </Link>
        </SignedIn>
      </div>

      <div className="container">
        <div className="card">
          <h2>How it works</h2>
          <ol style={{ lineHeight: "2" }}>
            <li>
              <strong>MonkEC</strong> validates your Clerk API key and exposes
              credentials to the app
            </li>
            <li>
              <strong>Clerk middleware</strong> protects routes and manages
              sessions
            </li>
            <li>
              <strong>Clerk components</strong> provide sign-in/sign-up UI
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
