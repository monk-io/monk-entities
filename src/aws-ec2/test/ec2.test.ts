// Tests for the aws-ec2 entities, run by `monk entity test src/aws-ec2`,
// against the fake EC2 API in fake-ec2.ts.
import { test, expect, Test } from "monk/test";
import { VPC } from "../vpc.ts";
import { Subnet } from "../subnet.ts";
import { SecurityGroup } from "../security-group.ts";
import { InternetGateway } from "../internet-gateway.ts";
import { RouteTable } from "../route-table.ts";
import { ec2, EC2State } from "./fake-ec2.ts";

const REGION = "us-east-1";

function aws(t: Test) {
    t.provider("aws", { Access: "AKIAEXAMPLE", Secret: "secret" });
}

/** A VPC and two public subnets, made directly in the fake. */
function network(s: EC2State): { vpc: string; a: string; b: string } {
    s.vpcs.set("vpc-1", { cidr: "10.0.0.0/16", dnsSupport: true, dnsHostnames: true });
    s.subnets.set("subnet-a", { vpc: "vpc-1", cidr: "10.0.1.0/24", az: "us-east-1a", publicIp: true });
    s.subnets.set("subnet-b", { vpc: "vpc-1", cidr: "10.0.2.0/24", az: "us-east-1b", publicIp: true });
    return { vpc: "vpc-1", a: "subnet-a", b: "subnet-b" };
}

test("a VPC is created, reports its state, and its attributes update", (t) => {
    aws(t);
    const api = t.use(ec2);
    const v = t.entity(VPC, { region: REGION, cidr_block: "10.1.0.0/16", enable_dns_hostnames: true, tags: { Name: "shop" } });
    v.create();
    const id = v.state.vpc_id ?? "";
    expect(api.state.vpcs.get(id)?.dnsHostnames).toBe(true);
    expect(api.state.tags.get(id)?.Name).toBe("shop");
    expect(api.state.tags.get(id)?.["monk.io/owner"]).toContain("vpc");
    v.waitReady();
    expect(v.state.state).toBe("available");

    v.redefine({ region: REGION, cidr_block: "10.1.0.0/16", enable_dns_hostnames: false, tags: { Name: "shop", Team: "web" } });
    v.update();
    expect(api.state.vpcs.get(id)?.dnsHostnames).toBe(false);
    expect(api.state.tags.get(id)?.Team).toBe("web");

    v.delete();
    expect(api.state.vpcs.size).toBe(0);
});

test("an EC2 error carries its code", (t) => {
    aws(t);
    const api = t.use(ec2);
    const v = t.entity(VPC, { region: REGION, cidr_block: "10.1.0.0/16" });
    v.create();
    api.state.subnets.set("subnet-x", { vpc: v.state.vpc_id ?? "", cidr: "10.1.1.0/24", az: "us-east-1a", publicIp: false });
    expect(() => v.delete()).toThrow(/has dependencies.*\(DependencyViolation\)/);
}, { explore: false });

test("a subnet reports its availability zone and its public IP setting updates", (t) => {
    aws(t);
    const api = t.use(ec2);
    const net = network(api.state);
    const s = t.entity(Subnet, { region: REGION, vpc_id: net.vpc, cidr_block: "10.0.3.0/24", availability_zone: "us-east-1c", tags: { "kubernetes.io/role/elb": "1" } });
    s.create();
    s.waitReady();
    expect(s.state.availability_zone).toBe("us-east-1c");
    expect(api.state.tags.get(s.state.subnet_id ?? "")?.["kubernetes.io/role/elb"]).toBe("1");

    s.redefine({ region: REGION, vpc_id: net.vpc, cidr_block: "10.0.3.0/24", availability_zone: "us-east-1c", map_public_ip_on_launch: true });
    s.update();
    expect(api.state.subnets.get(s.state.subnet_id ?? "")?.publicIp).toBe(true);
});

test("a VPC whose create response was lost is not created twice", (t) => {
    aws(t);
    const api = t.use(ec2);
    api.fault("POST /", "lost", { times: 1, when: (req) => req.body.indexOf("Action=CreateVpc") >= 0 });
    const v = t.entity(VPC, { region: REGION, cidr_block: "10.1.0.0/16" });
    expect(() => v.create()).toThrow();
    v.create();
    expect(api.state.vpcs.size).toBe(1);
    v.delete();
    // Deleting what is gone already is done.
    v.delete();
    expect(api.state.vpcs.size).toBe(0);
}, { explore: false });

test("security group rules are sent in EC2's form, and the default egress is not repeated", (t) => {
    aws(t);
    const api = t.use(ec2);
    const net = network(api.state);
    const g = t.entity(SecurityGroup, {
        region: REGION, vpc_id: net.vpc, group_name: "web", group_description: "web servers",
        ingress: [
            { ip_protocol: "tcp", from_port: 80, to_port: 80, cidr_blocks: ["0.0.0.0/0"] },
            { ip_protocol: "tcp", from_port: 5432, to_port: 5432, source_security_group_id: "sg-app" },
        ],
        egress: [{ ip_protocol: "-1", cidr_blocks: ["0.0.0.0/0"] }],
    });
    g.create();
    const live = api.state.groups.get(g.state.group_id ?? "");
    expect(live?.ingress).toEqual(["tcp 80-80 0.0.0.0/0", "tcp 5432-5432 sg-app"]);
    expect(live?.egress).toEqual(["-1 - 0.0.0.0/0"]);
});

test("an internet gateway is attached, and a lost create does not make two", (t) => {
    aws(t);
    const api = t.use(ec2);
    const net = network(api.state);
    api.fault("POST /", "lost", { times: 1, when: (req) => req.body.indexOf("Action=CreateInternetGateway") >= 0 });
    const g = t.entity(InternetGateway, { region: REGION, vpc_id: net.vpc });
    expect(() => g.create()).toThrow();
    // The next reconcile finds the gateway by its owner tag.
    g.create();
    expect(api.state.igws.size).toBe(1);
    g.waitReady();
    expect(api.state.igws.get(g.state.internet_gateway_id ?? "")?.vpc).toBe(net.vpc);

    g.delete();
    expect(api.state.igws.size).toBe(0);
}, { explore: false });

test("a route table routes to the gateway, follows its definition, and lets go of its subnets", (t) => {
    aws(t);
    const api = t.use(ec2);
    const net = network(api.state);
    const g = t.entity(InternetGateway, { region: REGION, vpc_id: net.vpc });
    g.create();
    const igw = g.state.internet_gateway_id ?? "";

    const rt = t.entity(RouteTable, {
        region: REGION, vpc_id: net.vpc,
        routes: [{ destination_cidr_block: "0.0.0.0/0", gateway_id: igw }, { destination_cidr_block: "192.168.0.0/16", gateway_id: igw }],
        subnet_ids: [net.a, net.b],
    });
    rt.create();
    rt.waitReady();
    const id = rt.state.route_table_id ?? "";
    const live = () => api.state.tables.get(id);
    expect(live()?.routes.map((r) => `${r.destination} ${r.gateway}`)).toEqual(["10.0.0.0/16 local", `0.0.0.0/0 ${igw}`, `192.168.0.0/16 ${igw}`]);
    expect([...(live()?.associations.values() ?? [])].sort()).toEqual([net.a, net.b]);
    expect(rt.state.associations?.length).toBe(2);

    rt.redefine({ region: REGION, vpc_id: net.vpc, routes: [{ destination_cidr_block: "0.0.0.0/0", gateway_id: igw }], subnet_ids: [net.a] });
    rt.update();
    expect(live()?.routes.map((r) => r.destination)).toEqual(["10.0.0.0/16", "0.0.0.0/0"]);
    expect([...(live()?.associations.values() ?? [])]).toEqual([net.a]);

    rt.delete();
    expect(api.state.tables.size).toBe(0);
});
