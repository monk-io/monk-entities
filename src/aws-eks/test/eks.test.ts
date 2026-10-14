// Tests for the aws-eks entities, run by `monk entity test src/aws-eks`,
// against the fake EKS API in fake-eks.ts.
import { test, expect, Test } from "monk/test";
import { Cluster } from "../cluster.ts";
import { NodeGroup } from "../node-group.ts";
import { Addon } from "../addon.ts";
import { AccessEntry } from "../access-entry.ts";
import { eks, EKS } from "./fake-eks.ts";

const CLUSTER = {
    region: "us-east-1",
    name: "shop",
    role_arn: "arn:aws:iam::123456789012:role/shop-eks",
    subnet_ids: ["subnet-a", "subnet-b"],
    version: "1.32",
};

const NODES = {
    region: "us-east-1",
    cluster_name: "shop",
    name: "general",
    node_role_arn: "arn:aws:iam::123456789012:role/shop-nodes",
    subnet_ids: ["subnet-a", "subnet-b"],
    instance_types: ["t3.large"],
    desired_size: 3,
    max_size: 5,
    labels: { pool: "general", "node.kubernetes.io/lifecycle": "normal" },
};

function aws(t: Test) {
    t.provider("aws", { Access: "AKIAEXAMPLE", Secret: "secret" });
}

/** A cluster that is ACTIVE. */
function activeCluster(t: Test) {
    const c = t.entity(Cluster, CLUSTER);
    c.create();
    c.waitReady();
    return c;
}

test("a cluster is created, becomes active and reports how to reach it", (t) => {
    aws(t);
    const api = t.use(eks);
    const c = t.entity(Cluster, CLUSTER);
    c.create();
    expect(c.state.status).toBe("CREATING");
    const live = api.state.clusters.get("shop");
    expect(live.accessConfig).toEqual({ authenticationMode: "API", bootstrapClusterCreatorAdminPermissions: true });
    expect(live.resourcesVpcConfig.endpointPublicAccess).toBe(true);
    expect(live.tags["monk.io/owner"]).toContain("cluster");

    c.waitReady();
    expect(c.state.status).toBe("ACTIVE");
    expect(c.state.name).toBe("shop");
    expect(c.state.region).toBe("us-east-1");
    expect(c.state.endpoint).toBe("https://SHOP.gr7.us-east-1.eks.amazonaws.com");
    expect(c.state.oidc_issuer).toContain("oidc.eks.us-east-1.amazonaws.com");
    expect(c.state.cluster_security_group_id).toBe("sg-eks1");
    if (!t.exploring) {
        expect(t.http.requests()[0]).toBe(`GET ${EKS}/clusters/shop -> 404`);
    }
});

test("a cluster that exists is refused unless adopted, and an adopted one stays", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const other = t.entity(Cluster, CLUSTER);
    expect(() => other.create()).toThrow(/already exists; set adopt: true/);

    const adopter = t.entity(Cluster, { ...CLUSTER, adopt: true });
    adopter.create();
    expect(adopter.state.adopted).toBe(true);
    adopter.delete();
    expect(api.state.clusters.has("shop")).toBe(true);
}, { explore: false });

test("a cluster whose create response was lost is not created twice", (t) => {
    aws(t);
    const api = t.use(eks);
    api.fault("POST /clusters", "lost", { times: 1 });
    const c = t.entity(Cluster, CLUSTER);
    // The retry sends the same request token, so AWS makes one cluster.
    c.create();
    expect(api.state.clusters.size).toBe(1);
    expect(c.state.adopted).toBe(false);
}, { explore: false });

test("too few subnets are refused before anything is made", (t) => {
    aws(t);
    t.use(eks);
    const c = t.entity(Cluster, { ...CLUSTER, subnet_ids: ["subnet-a"] });
    expect(() => c.create()).toThrow(/at least two availability zones/);
}, { explore: false });

test("raising the version upgrades the cluster, and other changes wait for it", (t) => {
    aws(t);
    const api = t.use(eks);
    const c = activeCluster(t);
    c.redefine({ ...CLUSTER, version: "1.33", endpoint_private_access: true });
    c.update();
    expect(api.state.updates).toEqual(["cluster version 1.33"]);
    // Readiness starts the change the upgrade held back, and waits for it.
    c.waitReady();
    expect(api.state.updates).toEqual(["cluster version 1.33", "cluster config endpointPrivateAccess,endpointPublicAccess"]);
    expect(api.state.clusters.get("shop").resourcesVpcConfig.endpointPrivateAccess).toBe(true);

    c.redefine({ ...CLUSTER, version: "1.33", endpoint_private_access: true, logging: ["api", "audit"] });
    c.update();
    expect(api.state.updates[2]).toBe("cluster logging");
    c.waitReady();
    expect(api.state.updates.length).toBe(3);
    expect(api.state.clusters.get("shop").logging.clusterLogging).toEqual([
        { types: ["api", "audit"], enabled: true },
        { types: ["authenticator", "controllerManager", "scheduler"], enabled: false },
    ]);
});

test("a node group joins an active cluster and scales in place", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const n = t.entity(NodeGroup, NODES);
    n.create();
    const live = api.state.nodegroups.get("shop/general");
    expect(live.scalingConfig).toEqual({ desiredSize: 3, minSize: 1, maxSize: 5 });
    expect(live.instanceTypes).toEqual(["t3.large"]);
    expect(live.labels).toEqual({ pool: "general", "node.kubernetes.io/lifecycle": "normal" });
    n.waitReady();
    expect(n.state.status).toBe("ACTIVE");
    expect(n.state.autoscaling_group).toBe("eks-general-x");

    n.redefine({ ...NODES, desired_size: 4, labels: { pool: "big", team: "shop" } });
    n.update();
    expect(api.state.nodegroups.get("shop/general").scalingConfig.desiredSize).toBe(4);
    expect(api.state.nodegroups.get("shop/general").labels).toEqual({ pool: "big", team: "shop" });
    n.waitReady();

    n.redefine({ ...NODES, desired_size: 4, labels: { team: "shop" } });
    n.update();
    expect(api.state.nodegroups.get("shop/general").labels).toEqual({ team: "shop" });
    n.waitReady();

    // An upgrade first; readiness then starts the resize it held back.
    n.redefine({ ...NODES, desired_size: 2, labels: { team: "shop" }, version: "1.33" });
    n.update();
    expect(api.state.nodegroups.get("shop/general").version).toBe("1.33");
    expect(api.state.nodegroups.get("shop/general").scalingConfig.desiredSize).toBe(4);
    n.waitReady();
    expect(api.state.nodegroups.get("shop/general").scalingConfig.desiredSize).toBe(2);
});

test("bad node group sizes are refused", (t) => {
    aws(t);
    t.use(eks);
    const n = t.entity(NodeGroup, { ...NODES, desired_size: 6 });
    expect(() => n.create()).toThrow(/min_size <= desired_size <= max_size/);
}, { explore: false });

test("a cluster with node groups is deleted after them", (t) => {
    aws(t);
    const api = t.use(eks);
    const c = activeCluster(t);
    const n = t.entity(NodeGroup, NODES);
    n.create();
    n.waitReady();
    expect(() => c.delete()).toThrow(/still has node groups/);
    n.delete();
    c.delete();
    expect(api.state.clusters.get("shop")?.status ?? "gone").toBe("DELETING");
});

test("an add-on is installed, updated, and one that came with the cluster stays", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const ebs = t.entity(Addon, { region: "us-east-1", cluster_name: "shop", name: "aws-ebs-csi-driver" });
    ebs.create();
    ebs.waitReady();
    expect(ebs.state.status).toBe("ACTIVE");
    ebs.redefine({ region: "us-east-1", cluster_name: "shop", name: "aws-ebs-csi-driver", version: "v1.41.0-eksbuild.1" });
    ebs.update();
    expect(api.state.addons.get("shop/aws-ebs-csi-driver").addonVersion).toBe("v1.41.0-eksbuild.1");
    ebs.delete();
    expect(api.state.addons.has("shop/aws-ebs-csi-driver")).toBe(false);

    const cni = t.entity(Addon, { region: "us-east-1", cluster_name: "shop", name: "vpc-cni" });
    cni.create();
    expect(cni.state.adopted).toBe(true);
    cni.delete();
    expect(api.state.addons.has("shop/vpc-cni")).toBe(true);
});

test("an add-on's service accounts get their roles through Pod Identity", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const role = (n: string) => `arn:aws:iam::123456789012:role/${n}`;
    const def = (roles?: Record<string, string>) => ({ region: "us-east-1", cluster_name: "shop", name: "aws-ebs-csi-driver", service_account_roles: roles });
    const ebs = t.entity(Addon, def({ "ebs-csi-controller-sa": role("ebs") }));
    ebs.create();
    const live = () => api.state.addons.get("shop/aws-ebs-csi-driver");
    expect(live().podIdentity).toEqual({ "ebs-csi-controller-sa": role("ebs") });
    ebs.waitReady();

    ebs.redefine(def({ "ebs-csi-controller-sa": role("ebs-2") }));
    ebs.update();
    ebs.waitReady();
    expect(live().podIdentity).toEqual({ "ebs-csi-controller-sa": role("ebs-2") });
    expect(live().status).toBe("ACTIVE");

    ebs.redefine(def());
    ebs.update();
    ebs.waitReady();
    expect(live().podIdentity).toEqual({});
});

test("a change to an add-on that is still being created follows once it is done", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const ebs = t.entity(Addon, { region: "us-east-1", cluster_name: "shop", name: "aws-ebs-csi-driver" });
    ebs.create();
    // Created without roles, and failing for it.
    api.state.addons.get("shop/aws-ebs-csi-driver").status = "CREATE_FAILED";
    ebs.redefine({ region: "us-east-1", cluster_name: "shop", name: "aws-ebs-csi-driver", service_account_roles: { "ebs-csi-controller-sa": "arn:aws:iam::123456789012:role/ebs" } });
    ebs.update();
    ebs.waitReady();
    expect(api.state.addons.get("shop/aws-ebs-csi-driver").podIdentity).toEqual({ "ebs-csi-controller-sa": "arn:aws:iam::123456789012:role/ebs" });
    expect(ebs.state.status).toBe("ACTIVE");
});

test("an access entry grants one policy, scoped to namespaces", (t) => {
    aws(t);
    const api = t.use(eks);
    activeCluster(t);
    const role = "arn:aws:iam::123456789012:role/dev-team";
    const a = t.entity(AccessEntry, { region: "us-east-1", cluster_name: "shop", principal_arn: role, policy: "AmazonEKSEditPolicy", namespaces: ["shop"] });
    a.create();
    a.waitReady();
    const granted = (): Map<string, any> => api.state.policies.get(`shop ${role}`) ?? new Map<string, any>();
    const policies = Array.from(granted().values());
    expect(policies).toEqual([{ policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy", accessScope: { type: "namespace", namespaces: ["shop"] } }]);

    a.redefine({ region: "us-east-1", cluster_name: "shop", principal_arn: role, policy: "AmazonEKSViewPolicy" });
    a.update();
    const now = Array.from(granted().keys());
    expect(now).toEqual(["arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"]);

    a.delete();
    expect(api.state.entries.size).toBe(0);
});
