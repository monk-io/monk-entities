// A fake EKS API for the aws-eks package's tests: clusters, node groups,
// add-ons and access entries. Clusters and node groups become ACTIVE after
// a couple of reads, as on AWS some minutes after they are created.
import { fakeApi, json, Request, Response } from "monk/test";

export const EKS = "https://eks.us-east-1.amazonaws.com";

export interface EKSState {
    clusters: Map<string, any>;
    nodegroups: Map<string, any>; // cluster/name
    addons: Map<string, any>; // cluster/name
    entries: Map<string, any>; // cluster principal
    policies: Map<string, Map<string, any>>; // cluster principal -> policy ARN -> association
    reads: Map<string, number>;
    /** Request tokens seen, so a create sent again is carried out once. */
    tokens: Map<string, any>;
    /** Updates started: "cluster version 1.33", "nodegroup config web", ... */
    updates: string[];
}

function error(status: number, type: string, message: string): Response {
    return json(status, { message }, { "x-amzn-ErrorType": `${type}:http://internal.amazon.com/coral/com.amazon.eks/` });
}

/** Moves a resource on from a transitional status after a couple of reads. */
function progress(s: EKSState, key: string, obj: any, after = 2): void {
    const reads = (s.reads.get(key) ?? 0) + 1;
    s.reads.set(key, reads);
    if (reads < after) return;
    if (obj.status === "CREATING" || obj.status === "UPDATING") obj.status = "ACTIVE";
}

/**
 * Gives an add-on Pod Identity roles; EKS reports them only as association
 * ARNs, kept by service account in podIdentity.
 */
function setPodIdentity(s: EKSState, a: any, list: { serviceAccount: string; roleArn: string }[]): void {
    a.podIdentity = {};
    a.podIdentityAssociations = [];
    for (const p of list) {
        a.podIdentity[p.serviceAccount] = p.roleArn;
        a.podIdentityAssociations.push(`arn:aws:eks:us-east-1:123456789012:podidentityassociation/${a.clusterName}/a-${p.serviceAccount}`);
    }
}

function token(s: EKSState, req: Request, make: () => Response): Response {
    const t = req.json().clientRequestToken;
    if (t !== undefined && (t.length < 33 || t.length > 126)) return error(400, "InvalidParameterException", "The client request token parameter must be between 33 and 126 characters.");
    if (t && s.tokens.has(t)) return s.tokens.get(t);
    const res = make();
    if (t && res.status < 300) s.tokens.set(t, res);
    return res;
}

function clusterRoute(s: EKSState, req: Request): Response {
    const name = req.params.name;
    const found = s.clusters.get(name);
    if (req.method === "GET") {
        if (!found) return error(404, "ResourceNotFoundException", `No cluster found for name: ${name}.`);
        if (found.status === "DELETING") {
            s.clusters.delete(name);
            return json(200, { cluster: found });
        }
        progress(s, `cluster/${name}`, found);
        return json(200, { cluster: found });
    }
    if (req.method === "DELETE") {
        if (!found) return error(404, "ResourceNotFoundException", `No cluster found for name: ${name}.`);
        if ([...s.nodegroups.keys()].some((k) => k.startsWith(`${name}/`))) {
            return error(409, "ResourceInUseException", `Cluster has nodegroups attached`);
        }
        found.status = "DELETING";
        return json(200, { cluster: found });
    }
    return error(405, "InvalidRequestException", req.method);
}

function nodegroup(s: EKSState, req: Request): Response {
    const key = `${req.params.name}/${req.params.ng}`;
    const found = s.nodegroups.get(key);
    if (!found) return error(404, "ResourceNotFoundException", `No node group found for name: ${req.params.ng}.`);
    if (req.method === "GET") {
        progress(s, `nodegroup/${key}`, found);
        return json(200, { nodegroup: found });
    }
    if (req.method === "DELETE") {
        s.nodegroups.delete(key);
        return json(200, { nodegroup: { ...found, status: "DELETING" } });
    }
    return error(405, "InvalidRequestException", req.method);
}

function addon(s: EKSState, req: Request): Response {
    const key = `${req.params.name}/${req.params.addon}`;
    const found = s.addons.get(key);
    if (!found) return error(404, "ResourceNotFoundException", `No addon: ${req.params.addon} found in cluster: ${req.params.name}`);
    if (req.method === "GET") {
        progress(s, `addon/${key}`, found, 1);
        return json(200, { addon: found });
    }
    if (req.method === "DELETE") {
        s.addons.delete(key);
        return json(200, { addon: { ...found, status: "DELETING" } });
    }
    return error(405, "InvalidRequestException", req.method);
}

function createEntry(s: EKSState, req: Request): Response {
    return token(s, req, () => {
        if (!s.clusters.has(req.params.name)) return error(404, "ResourceNotFoundException", "no cluster");
        const b = req.json();
        const key = `${req.params.name} ${b.principalArn}`;
        if (s.entries.has(key)) return error(409, "ResourceInUseException", "The specified access entry resource is already in use on this cluster.");
        const entry = {
            principalArn: b.principalArn,
            accessEntryArn: `arn:aws:eks:us-east-1:123456789012:access-entry/${req.params.name}/x`,
            kubernetesGroups: b.kubernetesGroups ?? [],
            username: `${b.principalArn.replace(":role/", ":assumed-role/")}/{{SessionName}}`,
        };
        s.entries.set(key, entry);
        return json(200, { accessEntry: entry });
    });
}

/** /clusters/:name/access-entries/<principal ARN>[/access-policies[/<policy ARN>]] */
function accessEntry(s: EKSState, req: Request): Response {
    const name = req.params.name;
    if (!s.clusters.has(name)) return error(404, "ResourceNotFoundException", `No cluster found for name: ${name}.`);
    const prefix = `/clusters/${name}/access-entries/`;
    const rest = req.path.slice(prefix.length);
    const at = rest.indexOf("/access-policies");
    const principal = at < 0 ? rest : rest.slice(0, at);
    const policy = at < 0 ? undefined : rest.slice(at + "/access-policies".length).replace(/^\//, "");
    if (principal === "" && req.method === "POST") return createEntry(s, req);
    const key = `${name} ${principal}`;
    const entry = s.entries.get(key);
    if (!entry) return error(404, "ResourceNotFoundException", `The specified principalArn could not be found.`);
    const policies = s.policies.get(key) ?? new Map<string, any>();
    s.policies.set(key, policies);

    if (policy === undefined) {
        if (req.method === "GET") return json(200, { accessEntry: entry });
        if (req.method === "POST") {
            entry.kubernetesGroups = req.json().kubernetesGroups ?? [];
            return json(200, { accessEntry: entry });
        }
        if (req.method === "DELETE") {
            s.entries.delete(key);
            s.policies.delete(key);
            return json(200, {});
        }
    } else if (policy === "") {
        if (req.method === "GET") return json(200, { associatedAccessPolicies: [...policies.values()] });
        if (req.method === "POST") {
            const b = req.json();
            const assoc = { policyArn: b.policyArn, accessScope: b.accessScope };
            policies.set(b.policyArn, assoc);
            return json(200, { associatedAccessPolicy: assoc });
        }
    } else if (req.method === "DELETE") {
        if (!policies.has(policy)) return error(404, "ResourceNotFoundException", "not associated");
        policies.delete(policy);
        return json(200, {});
    }
    return error(405, "InvalidRequestException", req.method);
}

export const eks = fakeApi<EKSState>(EKS, () => {
    const st: EKSState = {
        clusters: new Map(), nodegroups: new Map(), addons: new Map(), entries: new Map(), policies: new Map(),
        reads: new Map(), tokens: new Map(), updates: [],
    };
    return { state: st, routes: {
        "POST /clusters": (req) => token(st, req, () => {
            const b = req.json();
            if (st.clusters.has(b.name)) return error(409, "ResourceInUseException", `Cluster already exists with name: ${b.name}`);
            if ((b.resourcesVpcConfig?.subnetIds ?? []).length < 2) return error(400, "InvalidParameterException", "Subnets specified must be in at least two different AZs");
            const c = {
                name: b.name,
                arn: `arn:aws:eks:us-east-1:123456789012:cluster/${b.name}`,
                version: b.version ?? "1.33",
                platformVersion: "eks.5",
                roleArn: b.roleArn,
                status: "CREATING",
                endpoint: `https://${b.name.toUpperCase()}.gr7.us-east-1.eks.amazonaws.com`,
                certificateAuthority: { data: "LS0tLS1CRUdJTi1DRVJUSUZJQ0FURS0tLS0t" },
                identity: { oidc: { issuer: `https://oidc.eks.us-east-1.amazonaws.com/id/${b.name.toUpperCase()}` } },
                resourcesVpcConfig: { ...b.resourcesVpcConfig, securityGroupIds: b.resourcesVpcConfig.securityGroupIds ?? [], clusterSecurityGroupId: "sg-eks1", vpcId: "vpc-1", publicAccessCidrs: b.resourcesVpcConfig.publicAccessCidrs ?? ["0.0.0.0/0"] },
                logging: b.logging ?? { clusterLogging: [{ types: ["api", "audit", "authenticator", "controllerManager", "scheduler"], enabled: false }] },
                accessConfig: b.accessConfig,
                tags: b.tags ?? {},
            };
            st.clusters.set(b.name, c);
            // Every cluster comes with these.
            for (const a of ["vpc-cni", "coredns", "kube-proxy"]) {
                st.addons.set(`${b.name}/${a}`, { addonName: a, clusterName: b.name, status: "ACTIVE", addonVersion: "v1.0.0-eksbuild.1" });
            }
            return json(200, { cluster: c });
        }),
        "* /clusters/:name": (req) => clusterRoute(st, req),
        "POST /clusters/:name/updates": (req) => token(st, req, () => {
            const c = st.clusters.get(req.params.name);
            if (!c) return error(404, "ResourceNotFoundException", "no cluster");
            if (c.status !== "ACTIVE") return error(409, "ResourceInUseException", "An update is in progress");
            c.version = req.json().version;
            c.status = "UPDATING";
            st.reads.set(`cluster/${c.name}`, 0);
            st.updates.push(`cluster version ${c.version}`);
            return json(200, { update: { id: "u-1", status: "InProgress", type: "VersionUpdate" } });
        }),
        "GET /clusters/:name/updates": () => json(200, { updateIds: [] }),
        "POST /clusters/:name/update-config": (req) => token(st, req, () => {
            const c = st.clusters.get(req.params.name);
            if (!c) return error(404, "ResourceNotFoundException", "no cluster");
            if (c.status !== "ACTIVE") return error(409, "ResourceInUseException", "An update is in progress");
            const b = req.json();
            if (b.resourcesVpcConfig && b.logging) return error(400, "InvalidParameterException", "only one type of update can be allowed");
            if (b.resourcesVpcConfig) {
                c.resourcesVpcConfig = { ...c.resourcesVpcConfig, ...b.resourcesVpcConfig };
                st.updates.push(`cluster config ${Object.keys(b.resourcesVpcConfig).sort().join(",")}`);
            }
            if (b.logging) {
                c.logging = b.logging;
                st.updates.push("cluster logging");
            }
            c.status = "UPDATING";
            st.reads.set(`cluster/${c.name}`, 0);
            return json(200, { update: { id: "u-2", status: "InProgress" } });
        }),
        "POST /tags/*": () => json(200, {}),

        "POST /clusters/:name/node-groups": (req) => token(st, req, () => {
            const c = st.clusters.get(req.params.name);
            if (!c) return error(404, "ResourceNotFoundException", "no cluster");
            if (c.status !== "ACTIVE") return error(400, "InvalidRequestException", `Cluster '${c.name}' is not in ACTIVE status`);
            const b = req.json();
            const key = `${c.name}/${b.nodegroupName}`;
            if (st.nodegroups.has(key)) return error(409, "ResourceInUseException", "NodeGroup already exists");
            const n = {
                nodegroupName: b.nodegroupName,
                nodegroupArn: `arn:aws:eks:us-east-1:123456789012:nodegroup/${c.name}/${b.nodegroupName}/x`,
                clusterName: c.name,
                version: b.version ?? c.version,
                status: "CREATING",
                capacityType: b.capacityType ?? "ON_DEMAND",
                scalingConfig: b.scalingConfig,
                instanceTypes: b.instanceTypes,
                subnets: b.subnets,
                nodeRole: b.nodeRole,
                labels: b.labels ?? {},
                tags: b.tags ?? {},
                resources: { autoScalingGroups: [{ name: `eks-${b.nodegroupName}-x` }] },
                health: { issues: [] },
            };
            st.nodegroups.set(key, n);
            return json(200, { nodegroup: n });
        }),
        "* /clusters/:name/node-groups/:ng": (req) => nodegroup(st, req),
        "POST /clusters/:name/node-groups/:ng/update-config": (req) => token(st, req, () => {
            const n = st.nodegroups.get(`${req.params.name}/${req.params.ng}`);
            if (!n) return error(404, "ResourceNotFoundException", "no node group");
            const b = req.json();
            if (b.scalingConfig) n.scalingConfig = b.scalingConfig;
            for (const [k, v] of Object.entries(b.labels?.addOrUpdateLabels ?? {})) n.labels[k] = v;
            for (const k of b.labels?.removeLabels ?? []) delete n.labels[k];
            n.status = "UPDATING";
            st.reads.set(`nodegroup/${req.params.name}/${req.params.ng}`, 0);
            st.updates.push(`nodegroup config ${req.params.ng}`);
            return json(200, { update: { id: "u-3", status: "InProgress" } });
        }),
        "POST /clusters/:name/node-groups/:ng/update-version": (req) => token(st, req, () => {
            const n = st.nodegroups.get(`${req.params.name}/${req.params.ng}`);
            if (!n) return error(404, "ResourceNotFoundException", "no node group");
            n.version = req.json().version;
            n.status = "UPDATING";
            st.reads.set(`nodegroup/${req.params.name}/${req.params.ng}`, 0);
            st.updates.push(`nodegroup version ${req.params.ng} ${n.version}`);
            return json(200, { update: { id: "u-4", status: "InProgress" } });
        }),

        "POST /clusters/:name/addons": (req) => token(st, req, () => {
            const b = req.json();
            const key = `${req.params.name}/${b.addonName}`;
            if (!st.clusters.has(req.params.name)) return error(404, "ResourceNotFoundException", "no cluster");
            if (st.addons.has(key)) return error(409, "ResourceInUseException", "Addon already exists");
            const a = { addonName: b.addonName, clusterName: req.params.name, status: "CREATING", addonVersion: b.addonVersion ?? "v1.40.0-eksbuild.1", serviceAccountRoleArn: b.serviceAccountRoleArn, configurationValues: b.configurationValues };
            setPodIdentity(st, a, b.podIdentityAssociations ?? []);
            st.addons.set(key, a);
            return json(200, { addon: a });
        }),
        "* /clusters/:name/addons/:addon": (req) => addon(st, req),
        "POST /clusters/:name/addons/:addon/update": (req) => token(st, req, () => {
            const a = st.addons.get(`${req.params.name}/${req.params.addon}`);
            if (!a) return error(404, "ResourceNotFoundException", "no addon");
            if (a.status === "CREATING" || a.status === "UPDATING") return error(409, "ResourceInUseException", `Addon ${req.params.addon} is ${a.status}`);
            const b = req.json();
            if (b.addonVersion) a.addonVersion = b.addonVersion;
            if (b.podIdentityAssociations !== undefined) setPodIdentity(st, a, b.podIdentityAssociations);
            if (b.configurationValues !== undefined) a.configurationValues = b.configurationValues;
            if (b.serviceAccountRoleArn !== undefined) a.serviceAccountRoleArn = b.serviceAccountRoleArn;
            a.status = "UPDATING";
            st.reads.set(`addon/${req.params.name}/${req.params.addon}`, 0);
            st.updates.push(`addon ${req.params.addon}`);
            return json(200, { update: { id: "u-5", status: "InProgress" } });
        }),

        "POST /clusters/:name/access-entries": (req) => createEntry(st, req),
        "* /clusters/:name/access-entries/*": (req) => accessEntry(st, req),
    } };
});
