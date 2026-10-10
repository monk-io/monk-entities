// End-to-end: a Neon branch, a role and a database on it, and an app that
// connects, all run by Monk from e2e/branch-app.yaml.
//
//   NEON_API_KEY=... NEON_PROJECT_ID=... monk entity test --e2e src/neon
//
// The branch is made in an existing project, and deleted with the rest when
// the test ends.
import { e2e, expect } from "monk/e2e";
import { Branch } from "../branch.ts";
import { Role } from "../role.ts";
import { Database } from "../database.ts";

e2e("a branch serves an app that connects to it", (c) => {
    c.secret("neon-api-key", c.env("NEON_API_KEY", { secret: true }));
    c.load("e2e/branch-app.yaml", { vars: { project_id: c.env("NEON_PROJECT_ID") } });
    c.run("neon-e2e/stack");
    c.waitReady("neon-e2e/stack", { timeout: 900 });

    const branch = c.entity(Branch, "neon-e2e/branch");
    expect(branch.state.name).toBe(`e2e-${c.id}`);
    expect(branch.state.current_state).toBe("ready");
    expect(branch.state.existing).toBe(false);
    expect(c.entity(Role, "neon-e2e/role").state.name).toBe("app_user");
    expect(c.entity(Database, "neon-e2e/database").state.name).toBe("appdb");

    c.waitLogs("neon-e2e/probe", "db-ok", { timeout: 600 });
    c.do("neon-e2e/branch", "get-branch-details");
});
