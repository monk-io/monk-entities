import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="sign-in-container">
      <SignUp />
    </div>
  );
}
