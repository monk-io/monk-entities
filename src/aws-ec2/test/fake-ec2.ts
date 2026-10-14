// A fake EC2 Query API for the aws-ec2 package's tests: VPCs, subnets,
// security groups, internet gateways and route tables, answering in EC2's
// XML. Resources are available as soon as they are made.
import { fakeApi, Request, Response } from "monk/test";

export const EC2 = "https://ec2.us-east-1.amazonaws.com";

export interface Route {
    destination: string;
    gateway?: string;
    nat?: string;
    origin: string;
}

export interface EC2State {
    vpcs: Map<string, { cidr: string; dnsSupport: boolean; dnsHostnames: boolean }>;
    subnets: Map<string, { vpc: string; cidr: string; az: string; publicIp: boolean }>;
    groups: Map<string, { vpc: string; name: string; ingress: string[]; egress: string[] }>;
    igws: Map<string, { vpc?: string }>;
    tables: Map<string, { vpc: string; routes: Route[]; associations: Map<string, string> }>; // association ID -> subnet
    tags: Map<string, Record<string, string>>;
    next: number;
    /** The actions called, in order. */
    actions: string[];
}

/** The form body of a Query API request. */
export function form(req: Request): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of req.body.split("&")) {
        if (!pair) continue;
        const at = pair.indexOf("=");
        const k = decodeURIComponent(at < 0 ? pair : pair.slice(0, at));
        out[k] = at < 0 ? "" : decodeURIComponent(pair.slice(at + 1));
    }
    return out;
}

function xml(action: string, inner: string): Response {
    return {
        status: 200,
        headers: { "Content-Type": "text/xml;charset=UTF-8" },
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<${action}Response xmlns="http://ec2.amazonaws.com/doc/2016-11-15/"><requestId>r-1</requestId>${inner}</${action}Response>`,
    };
}

function fail(code: string, message: string, status = 400): Response {
    return {
        status,
        headers: { "Content-Type": "text/xml;charset=UTF-8" },
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Errors><Error><Code>${code}</Code><Message>${message}</Message></Error></Errors><RequestID>r-1</RequestID></Response>`,
    };
}

function tagSet(s: EC2State, id: string): string {
    const tags = s.tags.get(id) ?? {};
    return `<tagSet>${Object.entries(tags).map(([k, v]) => `<item><key>${k}</key><value>${v}</value></item>`).join("")}</tagSet>`;
}

/** Tags from TagSpecification.1.Tag.N params. */
function specTags(p: Record<string, string>): Record<string, string> {
    const tags: Record<string, string> = {};
    for (let i = 1; p[`TagSpecification.1.Tag.${i}.Key`] !== undefined; i++) {
        tags[p[`TagSpecification.1.Tag.${i}.Key`]] = p[`TagSpecification.1.Tag.${i}.Value`] ?? "";
    }
    return tags;
}

/** The IDs a request names (Name.1, Name.2, ...), or those a tag filter matches. */
function wanted(s: EC2State, p: Record<string, string>, idParam: string, all: string[]): string[] {
    const ids: string[] = [];
    for (let i = 1; p[`${idParam}.${i}`] !== undefined; i++) ids.push(p[`${idParam}.${i}`]);
    if (ids.length > 0) return ids;
    const filter = p["Filter.1.Name"];
    if (filter?.startsWith("tag:")) {
        const key = filter.slice(4);
        return all.filter((id) => (s.tags.get(id) ?? {})[key] === p["Filter.1.Value.1"]);
    }
    return all;
}

function id(s: EC2State, prefix: string): string {
    s.next++;
    return `${prefix}-${String(s.next).padStart(8, "0")}`;
}

/** IpPermissions.N.* params, as "proto from-to cidr|group" strings. */
function permissions(p: Record<string, string>): string[] {
    const out: string[] = [];
    for (let i = 1; p[`IpPermissions.${i}.IpProtocol`] !== undefined; i++) {
        const proto = p[`IpPermissions.${i}.IpProtocol`];
        const ports = `${p[`IpPermissions.${i}.FromPort`] ?? ""}-${p[`IpPermissions.${i}.ToPort`] ?? ""}`;
        for (let j = 1; p[`IpPermissions.${i}.IpRanges.${j}.CidrIp`] !== undefined; j++) out.push(`${proto} ${ports} ${p[`IpPermissions.${i}.IpRanges.${j}.CidrIp`]}`);
        if (p[`IpPermissions.${i}.UserIdGroupPairs.1.GroupId`]) out.push(`${proto} ${ports} ${p[`IpPermissions.${i}.UserIdGroupPairs.1.GroupId`]}`);
    }
    return out;
}

function handle(s: EC2State, req: Request): Response {
    const p = form(req);
    const action = p.Action;
    s.actions.push(action);
    switch (action) {
        case "CreateVpc": {
            const v = id(s, "vpc");
            s.vpcs.set(v, { cidr: p.CidrBlock, dnsSupport: true, dnsHostnames: false });
            s.tags.set(v, specTags(p));
            return xml(action, `<vpc><vpcId>${v}</vpcId><state>pending</state><cidrBlock>${p.CidrBlock}</cidrBlock></vpc>`);
        }
        case "DescribeVpcs": {
            const ids = wanted(s, p, "VpcId", [...s.vpcs.keys()]);
            for (const v of ids) if (!s.vpcs.has(v)) return fail("InvalidVpcID.NotFound", `The vpc ID '${v}' does not exist`);
            return xml(action, `<vpcSet>${ids.map((v) => `<item><vpcId>${v}</vpcId><ownerId>1</ownerId><state>available</state><cidrBlock>${s.vpcs.get(v)!.cidr}</cidrBlock><cidrBlockAssociationSet><item><cidrBlock>${s.vpcs.get(v)!.cidr}</cidrBlock><cidrBlockState><state>associated</state></cidrBlockState></item></cidrBlockAssociationSet>${tagSet(s, v)}</item>`).join("")}</vpcSet>`);
        }
        case "ModifyVpcAttribute": {
            const v = s.vpcs.get(p.VpcId);
            if (!v) return fail("InvalidVpcID.NotFound", "no vpc");
            if (p["EnableDnsSupport.Value"] !== undefined) v.dnsSupport = p["EnableDnsSupport.Value"] === "true";
            if (p["EnableDnsHostnames.Value"] !== undefined) v.dnsHostnames = p["EnableDnsHostnames.Value"] === "true";
            return xml(action, "<return>true</return>");
        }
        case "DeleteVpc": {
            if (!s.vpcs.has(p.VpcId)) return fail("InvalidVpcID.NotFound", "no vpc");
            const used = [...s.subnets.values()].some((x) => x.vpc === p.VpcId) || [...s.igws.values()].some((g) => g.vpc === p.VpcId);
            if (used) return fail("DependencyViolation", `The vpc '${p.VpcId}' has dependencies and cannot be deleted.`);
            s.vpcs.delete(p.VpcId);
            return xml(action, "<return>true</return>");
        }
        case "CreateTags": {
            const r = p["ResourceId.1"];
            const tags = { ...(s.tags.get(r) ?? {}) };
            for (let i = 1; p[`Tag.${i}.Key`] !== undefined; i++) tags[p[`Tag.${i}.Key`]] = p[`Tag.${i}.Value`] ?? "";
            s.tags.set(r, tags);
            return xml(action, "<return>true</return>");
        }
        case "CreateSubnet": {
            if (!s.vpcs.has(p.VpcId)) return fail("InvalidVpcID.NotFound", "no vpc");
            const sn = id(s, "subnet");
            s.subnets.set(sn, { vpc: p.VpcId, cidr: p.CidrBlock, az: p.AvailabilityZone ?? "us-east-1a", publicIp: false });
            s.tags.set(sn, specTags(p));
            return xml(action, `<subnet><subnetId>${sn}</subnetId><state>pending</state></subnet>`);
        }
        case "DescribeSubnets": {
            const ids = wanted(s, p, "SubnetId", [...s.subnets.keys()]);
            for (const x of ids) if (!s.subnets.has(x)) return fail("InvalidSubnetID.NotFound", `The subnet ID '${x}' does not exist`);
            return xml(action, `<subnetSet>${ids.map((x) => {
                const sn = s.subnets.get(x)!;
                return `<item><subnetId>${x}</subnetId><state>available</state><vpcId>${sn.vpc}</vpcId><cidrBlock>${sn.cidr}</cidrBlock><availabilityZone>${sn.az}</availabilityZone><mapPublicIpOnLaunch>${sn.publicIp}</mapPublicIpOnLaunch></item>`;
            }).join("")}</subnetSet>`);
        }
        case "ModifySubnetAttribute": {
            const sn = s.subnets.get(p.SubnetId);
            if (!sn) return fail("InvalidSubnetID.NotFound", "no subnet");
            sn.publicIp = p["MapPublicIpOnLaunch.Value"] === "true";
            return xml(action, "<return>true</return>");
        }
        case "DeleteSubnet": {
            if (!s.subnets.delete(p.SubnetId)) return fail("InvalidSubnetID.NotFound", "no subnet");
            return xml(action, "<return>true</return>");
        }
        case "CreateSecurityGroup": {
            const g = id(s, "sg");
            if ([...s.groups.values()].some((x) => x.vpc === p.VpcId && x.name === p.GroupName)) return fail("InvalidGroup.Duplicate", `The security group '${p.GroupName}' already exists for VPC '${p.VpcId}'`);
            s.groups.set(g, { vpc: p.VpcId, name: p.GroupName, ingress: [], egress: ["-1 - 0.0.0.0/0"] });
            s.tags.set(g, specTags(p));
            return xml(action, `<return>true</return><groupId>${g}</groupId>`);
        }
        case "AuthorizeSecurityGroupIngress":
        case "AuthorizeSecurityGroupEgress": {
            const g = s.groups.get(p.GroupId);
            if (!g) return fail("InvalidGroup.NotFound", "no group");
            const perms = permissions(p);
            if (perms.length === 0) return fail("MissingParameter", "IpPermissions is required");
            const list = action === "AuthorizeSecurityGroupIngress" ? g.ingress : g.egress;
            for (const x of perms) {
                if (list.indexOf(x) >= 0) return fail("InvalidPermission.Duplicate", `the specified rule "${x}" already exists`);
            }
            list.push(...perms);
            return xml(action, "<return>true</return>");
        }
        case "DescribeSecurityGroups": {
            const ids = wanted(s, p, "GroupId", [...s.groups.keys()]);
            for (const g of ids) if (!s.groups.has(g)) return fail("InvalidGroup.NotFound", `The security group '${g}' does not exist`);
            return xml(action, `<securityGroupInfo>${ids.map((g) => `<item><groupId>${g}</groupId><groupName>${s.groups.get(g)!.name}</groupName><vpcId>${s.groups.get(g)!.vpc}</vpcId>${tagSet(s, g)}</item>`).join("")}</securityGroupInfo>`);
        }
        case "DeleteSecurityGroup": {
            if (!s.groups.delete(p.GroupId)) return fail("InvalidGroup.NotFound", "no group");
            return xml(action, "<return>true</return>");
        }
        case "CreateInternetGateway": {
            const g = id(s, "igw");
            s.igws.set(g, {});
            s.tags.set(g, specTags(p));
            return xml(action, `<internetGateway><internetGatewayId>${g}</internetGatewayId><attachmentSet/>${tagSet(s, g)}</internetGateway>`);
        }
        case "DescribeInternetGateways": {
            const ids = wanted(s, p, "InternetGatewayId", [...s.igws.keys()]);
            for (const g of ids) if (!s.igws.has(g)) return fail("InvalidInternetGatewayID.NotFound", "no gateway");
            return xml(action, `<internetGatewaySet>${ids.map((g) => {
                const gw = s.igws.get(g)!;
                const attach = gw.vpc ? `<item><vpcId>${gw.vpc}</vpcId><state>available</state></item>` : "";
                return `<item><internetGatewayId>${g}</internetGatewayId><attachmentSet>${attach}</attachmentSet>${tagSet(s, g)}</item>`;
            }).join("")}</internetGatewaySet>`);
        }
        case "AttachInternetGateway": {
            const gw = s.igws.get(p.InternetGatewayId);
            if (!gw) return fail("InvalidInternetGatewayID.NotFound", "no gateway");
            if (gw.vpc) return fail("Resource.AlreadyAssociated", `resource ${p.InternetGatewayId} is already attached to network ${gw.vpc}`);
            gw.vpc = p.VpcId;
            return xml(action, "<return>true</return>");
        }
        case "DetachInternetGateway": {
            const gw = s.igws.get(p.InternetGatewayId);
            if (!gw) return fail("InvalidInternetGatewayID.NotFound", "no gateway");
            if (gw.vpc !== p.VpcId) return fail("Gateway.NotAttached", "not attached");
            gw.vpc = undefined;
            return xml(action, "<return>true</return>");
        }
        case "DeleteInternetGateway": {
            const gw = s.igws.get(p.InternetGatewayId);
            if (!gw) return fail("InvalidInternetGatewayID.NotFound", "no gateway");
            if (gw.vpc) return fail("DependencyViolation", "The internetGateway has dependencies and cannot be deleted.");
            s.igws.delete(p.InternetGatewayId);
            return xml(action, "<return>true</return>");
        }
        case "CreateRouteTable": {
            const t = id(s, "rtb");
            s.tables.set(t, { vpc: p.VpcId, routes: [{ destination: s.vpcs.get(p.VpcId)?.cidr ?? "10.0.0.0/16", gateway: "local", origin: "CreateRouteTable" }], associations: new Map() });
            s.tags.set(t, specTags(p));
            return xml(action, `<routeTable><routeTableId>${t}</routeTableId><vpcId>${p.VpcId}</vpcId></routeTable>`);
        }
        case "DescribeRouteTables": {
            const ids = wanted(s, p, "RouteTableId", [...s.tables.keys()]);
            for (const t of ids) if (!s.tables.has(t)) return fail("InvalidRouteTableID.NotFound", `The routeTable ID '${t}' does not exist`);
            return xml(action, `<routeTableSet>${ids.map((t) => {
                const rt = s.tables.get(t)!;
                const routes = rt.routes.map((r) => `<item><destinationCidrBlock>${r.destination}</destinationCidrBlock>${r.gateway ? `<gatewayId>${r.gateway}</gatewayId>` : ""}${r.nat ? `<natGatewayId>${r.nat}</natGatewayId>` : ""}<state>active</state><origin>${r.origin}</origin></item>`).join("");
                const assocs = [...rt.associations].map(([a, sn]) => `<item><routeTableAssociationId>${a}</routeTableAssociationId><routeTableId>${t}</routeTableId><subnetId>${sn}</subnetId><main>false</main><associationState><state>associated</state></associationState></item>`).join("");
                return `<item><routeTableId>${t}</routeTableId><vpcId>${rt.vpc}</vpcId><routeSet>${routes}</routeSet><associationSet>${assocs}</associationSet>${tagSet(s, t)}</item>`;
            }).join("")}</routeTableSet>`);
        }
        case "CreateRoute":
        case "ReplaceRoute": {
            const rt = s.tables.get(p.RouteTableId);
            if (!rt) return fail("InvalidRouteTableID.NotFound", "no table");
            const have = rt.routes.find((r) => r.destination === p.DestinationCidrBlock);
            if (action === "CreateRoute" && have) return fail("RouteAlreadyExists", `The route identified by ${p.DestinationCidrBlock} already exists.`);
            if (action === "ReplaceRoute" && !have) return fail("InvalidRoute.NotFound", "no route");
            if (p.GatewayId && !s.igws.has(p.GatewayId)) return fail("InvalidGatewayID.NotFound", `The gateway ID '${p.GatewayId}' does not exist`);
            rt.routes = rt.routes.filter((r) => r.destination !== p.DestinationCidrBlock);
            rt.routes.push({ destination: p.DestinationCidrBlock, gateway: p.GatewayId, nat: p.NatGatewayId, origin: "CreateRoute" });
            return xml(action, "<return>true</return>");
        }
        case "DeleteRoute": {
            const rt = s.tables.get(p.RouteTableId);
            if (!rt) return fail("InvalidRouteTableID.NotFound", "no table");
            rt.routes = rt.routes.filter((r) => r.destination !== p.DestinationCidrBlock);
            return xml(action, "<return>true</return>");
        }
        case "AssociateRouteTable": {
            const rt = s.tables.get(p.RouteTableId);
            if (!rt) return fail("InvalidRouteTableID.NotFound", "no table");
            if (!s.subnets.has(p.SubnetId)) return fail("InvalidSubnetID.NotFound", "no subnet");
            const a = id(s, "rtbassoc");
            rt.associations.set(a, p.SubnetId);
            return xml(action, `<associationId>${a}</associationId>`);
        }
        case "DisassociateRouteTable": {
            for (const rt of s.tables.values()) if (rt.associations.delete(p.AssociationId)) return xml(action, "<return>true</return>");
            return fail("InvalidAssociationID.NotFound", "no association");
        }
        case "DeleteRouteTable": {
            const rt = s.tables.get(p.RouteTableId);
            if (!rt) return fail("InvalidRouteTableID.NotFound", "no table");
            if (rt.associations.size > 0) return fail("DependencyViolation", "The routeTable has dependencies and cannot be deleted.");
            s.tables.delete(p.RouteTableId);
            return xml(action, "<return>true</return>");
        }
    }
    return fail("InvalidAction", `The action ${action} is not valid for this web service.`);
}

export const ec2 = fakeApi<EC2State>(EC2, () => {
    const st: EC2State = { vpcs: new Map(), subnets: new Map(), groups: new Map(), igws: new Map(), tables: new Map(), tags: new Map(), next: 0, actions: [] };
    return { state: st, routes: { "POST /": (req) => handle(st, req) } };
});
