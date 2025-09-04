# AWS EC2 Networking Entities

This module provides basic EC2 networking entities for composing AWS stacks:

- VPC (create/adopt, attributes, tags)
- Subnet (create, attributes, tags)
- Security Group (create/adopt, ingress/egress rules, tags)

These entities use the EC2 Query API directly via the built-in HTTP client.

## Examples

```yaml
namespace: net-demo

my-vpc:
  defines: aws-ec2/vpc
  region: us-east-1
  cidr_block: 10.0.0.0/16
  enable_dns_support: true
  enable_dns_hostnames: true
  tags:
    Name: demo-vpc

public-subnet-a:
  defines: aws-ec2/subnet
  region: us-east-1
  vpc_id: <- connection-target("vpc") entity-state get-member("vpc_id")
  cidr_block: 10.0.1.0/24
  availability_zone: us-east-1a
  map_public_ip_on_launch: true
  tags:
    Name: public-a

app-sg:
  defines: aws-ec2/security-group
  region: us-east-1
  vpc_id: <- connection-target("vpc") entity-state get-member("vpc_id")
  group_name: app-sg
  description: App security group
  ingress:
    - ip_protocol: tcp
      from_port: 5432
      to_port: 5432
      cidr_blocks:
        - 10.0.0.0/16
  egress:
    - ip_protocol: -1
      cidr_blocks: [ "0.0.0.0/0" ]
```


