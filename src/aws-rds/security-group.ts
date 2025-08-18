import { makeEC2Request } from "./common.ts";
import cli from "cli";

/**
 * Converts a single IP address to CIDR notation if needed
 * Examples: "192.168.1.1" -> "192.168.1.1/32", "10.0.0.0/16" -> "10.0.0.0/16"
 */
function normalizeToCidr(ipOrCidr: string): string {
    if (ipOrCidr.includes('/')) {
        return ipOrCidr; // Already CIDR notation
    }
    
    // Check if it's a valid IP address
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(ipOrCidr)) {
        return `${ipOrCidr}/32`; // Convert single IP to /32 CIDR
    }
    
    return ipOrCidr; // Return as-is if not recognizable
}

/**
 * Normalizes an array of IP addresses and CIDR blocks to proper CIDR notation
 */
function normalizeCidrArray(ipAddresses: string[]): string[] {
    return ipAddresses.map(ip => normalizeToCidr(ip.trim()));
}

export function getDefaultVpc(region: string): string | null {
    try {
        const response = makeEC2Request(region, 'DescribeVpcs', {
            'Filter.1.Name': 'isDefault',
            'Filter.1.Value.1': 'true'
        });
        
        // Check if the response has VpcId and IsDefault flag
        if (response.VpcId && response.IsDefault) {

            return response.VpcId;
        }

        return null;
    } catch (error) {
        console.log(`Warning: Could not retrieve default VPC: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}

export function resolveSecurityGroupNames(region: string, groupNames: string[], vpcId?: string): string[] {
    if (groupNames.length === 0) {
        return [];
    }
    
    try {
        const params: Record<string, any> = {};
        
        // Add group name filters (use single filter with multiple values)
        params['Filter.1.Name'] = 'group-name';
        groupNames.forEach((name, index) => {
            params[`Filter.1.Value.${index + 1}`] = name;
        });
        
        // If VPC ID is specified, filter by VPC
        if (vpcId) {
            params['Filter.2.Name'] = 'vpc-id';
            params['Filter.2.Value.1'] = vpcId;
        } else {
            // Try to get the default VPC if no VPC ID is specified
            const defaultVpcId = getDefaultVpc(region);
            if (defaultVpcId) {
                params['Filter.2.Name'] = 'vpc-id';
                params['Filter.2.Value.1'] = defaultVpcId;
            } else {
            }
        }
        const response = makeEC2Request(region, 'DescribeSecurityGroups', params);
        // Parse security groups from response
        const sgIds: string[] = [];
        const sgMatches = response.SecurityGroups || [];
        
        if (Array.isArray(sgMatches)) {
            sgMatches.forEach((sg: any) => {
                if (sg.GroupId) {
                    sgIds.push(sg.GroupId);
                }
            });
        } else {
            // Fallback to XML parsing if structured response not available
            const xmlMatches = response.match ? response.match(/<groupId>(.*?)<\/groupId>/g) : [];
            if (xmlMatches) {
                xmlMatches.forEach((match: string) => {
                    const idMatch = /<groupId>(.*?)<\/groupId>/.exec(match);
                    if (idMatch) {
                        sgIds.push(idMatch[1]);
                    }
                });
            } else {
            }
        }
        
        // If we didn't find any security groups and we were using a VPC filter, try without VPC filter
        if (sgIds.length === 0 && (vpcId || getDefaultVpc(region))) {
            // Also list all security groups for debugging
            try {
                const allSgsResponse = makeEC2Request(region, 'DescribeSecurityGroups', {});
                if (allSgsResponse.SecurityGroups && Array.isArray(allSgsResponse.SecurityGroups)) {
                    // Removed debug logging
                } else {
                }
            } catch (_listError) {
                // Ignore error - this was for debugging
            }
            
            // Create new parameters without VPC filter
            const noVpcParams: Record<string, any> = {};
            noVpcParams['Filter.1.Name'] = 'group-name';
            groupNames.forEach((name, index) => {
                noVpcParams[`Filter.1.Value.${index + 1}`] = name;
            });
            const noVpcResponse = makeEC2Request(region, 'DescribeSecurityGroups', noVpcParams);
            // Parse the no-VPC response
            const noVpcMatches = noVpcResponse.SecurityGroups || [];
            if (Array.isArray(noVpcMatches)) {
                noVpcMatches.forEach((sg: any) => {
                    if (sg.GroupId) {
                        sgIds.push(sg.GroupId);
                    }
                });
            }
        }
        
        // Return the found security group IDs
        
        return sgIds;
    } catch (error) {
        throw new Error(`Failed to resolve security group names: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function createSecurityGroup(region: string, groupName: string, description: string, vpcId?: string): string {
    const params: Record<string, any> = {
        GroupName: groupName,
        GroupDescription: description
    };
    
    // If vpcId is provided, use it; otherwise, let AWS use the default VPC
    if (vpcId) {
        params.VpcId = vpcId;
    }
    
    const response = makeEC2Request(region, 'CreateSecurityGroup', params);
    if (!response.GroupId) {
        throw new Error('Failed to create security group: No GroupId in response');
    }
    
    return response.GroupId;
}

export function checkSecurityGroupExists(region: string, groupId: string): boolean {
    try {
        makeEC2Request(region, 'DescribeSecurityGroups', {
            'GroupId.1': groupId
        });
        return true;
    } catch (error) {
        // Security group doesn't exist if we get a InvalidGroupId.NotFound error
        if (error instanceof Error && error.message.includes('InvalidGroupId.NotFound')) {
            return false;
        }
        throw error;
    }
}

export function findSecurityGroupByName(region: string, groupName: string, vpcId?: string): string | null {
    try {
        const params: Record<string, any> = {
            'Filter.1.Name': 'group-name',
            'Filter.1.Value.1': groupName
        };
        
        // If VPC ID is not provided, try to get the default VPC
        const targetVpcId = vpcId || getDefaultVpc(region);
        
        // Filter by VPC ID (either provided or default)
        if (targetVpcId) {
            params['Filter.2.Name'] = 'vpc-id';
            params['Filter.2.Value.1'] = targetVpcId;
        }

        const response = makeEC2Request(region, 'DescribeSecurityGroups', params);
        
        // Check if we have any security groups in the response
        // AWS EC2 API returns SecurityGroups (plural) array
        if (response.SecurityGroups && response.SecurityGroups.length > 0) {
            const securityGroups = Array.isArray(response.SecurityGroups) ? 
                response.SecurityGroups : [response.SecurityGroups];
            
            if (securityGroups.length > 0) {
                return securityGroups[0].GroupId;
            }
        }
        
        return null; // No security group found with this name
    } catch (error) {
        // If there's an error describing security groups, return null
        console.log(`Error finding security group by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}

export function authorizeSecurityGroupIngress(region: string, groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
    // Normalize CIDR blocks to ensure proper format
    const normalizedCidrs = normalizeCidrArray(cidrBlocks);
    const params: Record<string, any> = {
        GroupId: groupId
    };
    
    let permissionIndex = 1;
    
    // Add IP permissions for each CIDR block
    normalizedCidrs.forEach((cidr) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
        permissionIndex++;
    });
    
    // Add permissions for each source security group
    sourceSecurityGroupIds.forEach((sgId) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.Groups.1.GroupId`] = sgId;
        permissionIndex++;
    });
    try {
        makeEC2Request(region, 'AuthorizeSecurityGroupIngress', params);
    } catch (error) {
        // Ignore errors for rules that already exist (duplicate rules)
        if (error instanceof Error && !error.message.includes('InvalidPermission.Duplicate')) {
            cli.output(`[ERROR] AuthorizeSecurityGroupIngress failed: ${error.message}`);
            throw error;
        }
    }
}

export function revokeSecurityGroupIngress(region: string, groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
    // Normalize CIDR blocks to ensure proper format
    const normalizedCidrs = normalizeCidrArray(cidrBlocks);
    const params: Record<string, any> = {
        GroupId: groupId
    };
    
    let permissionIndex = 1;
    
    // Add IP permissions for each CIDR block to revoke
    normalizedCidrs.forEach((cidr) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
        permissionIndex++;
    });
    
    // Add permissions for each source security group to revoke
    sourceSecurityGroupIds.forEach((sgId) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.Groups.1.GroupId`] = sgId;
        permissionIndex++;
    });
    try {
        makeEC2Request(region, 'RevokeSecurityGroupIngress', params);
    } catch (error) {
        // Ignore errors for rules that don't exist (already removed)
        if (error instanceof Error && !error.message.includes('InvalidPermission.NotFound')) {
            cli.output(`[ERROR] RevokeSecurityGroupIngress failed: ${error.message}`);
            throw error;
        }
    }
}

export function updateSecurityGroupRules(region: string, groupId: string, port: number, allowedCidrs: string[], allowedSgNames: string[], vpcId?: string): void {
    try {
        // Normalize IP addresses to proper CIDR format (e.g., "192.168.1.1" -> "192.168.1.1/32")
        const normalizedCidrs = normalizeCidrArray(allowedCidrs);
        
        // API-ONLY APPROACH: Query current AWS rules directly
        const currentAwsRules = getCurrentSecurityGroupRules(region, groupId, port);
        
        // Resolve template security group names to IDs
        const allowedSgIds = allowedSgNames.length > 0 ?
            resolveSecurityGroupNames(region, [...allowedSgNames], vpcId) : [];
        // Compare template vs AWS reality
        const cidrsToAdd = normalizedCidrs.filter(cidr => !currentAwsRules.cidrs.includes(cidr));
        const cidrsToRemove = currentAwsRules.cidrs.filter(cidr => !normalizedCidrs.includes(cidr));
        const sgIdsToAdd = allowedSgIds.filter(sgId => !currentAwsRules.sgIds.includes(sgId));
        const sgIdsToRemove = currentAwsRules.sgIds.filter(sgId => !allowedSgIds.includes(sgId));
        // Check if there are actually changes to make
        if (cidrsToAdd.length === 0 && cidrsToRemove.length === 0 &&
            sgIdsToAdd.length === 0 && sgIdsToRemove.length === 0) {
            return;
        }

        // Remove old rules first
        if (cidrsToRemove.length > 0 || sgIdsToRemove.length > 0) {
            revokeSecurityGroupIngress(region, groupId, 'tcp', port, port, cidrsToRemove, sgIdsToRemove);
        }

        // Add new rules
        if (cidrsToAdd.length > 0 || sgIdsToAdd.length > 0) {
            authorizeSecurityGroupIngress(region, groupId, 'tcp', port, port, cidrsToAdd, sgIdsToAdd);
        }
    } catch (error) {
        throw new Error(`Failed to update security group rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function getCurrentSecurityGroupRules(region: string, groupId: string, port: number): { cidrs: string[]; sgIds: string[] } {
    try {
        // Get actual rules from AWS
        const response = makeEC2Request(region, 'DescribeSecurityGroups', {
            'GroupId.1': groupId
        });
        const actualCidrs: string[] = [];
        const actualSgIds: string[] = [];

        // Parse ingress rules from the response
        if (response.SecurityGroups && response.SecurityGroups.length > 0) {
            const securityGroup = response.SecurityGroups[0];
            // Look for rules on our specific port
            if (securityGroup.IpPermissions) {
                const permissions = Array.isArray(securityGroup.IpPermissions) ?
                    securityGroup.IpPermissions : [securityGroup.IpPermissions];

                permissions.forEach((permission: any) => {
                    if (permission.IpProtocol === 'tcp' &&
                        parseInt(permission.FromPort) === port &&
                        parseInt(permission.ToPort) === port) {

                        // Collect CIDR blocks
                        if (permission.IpRanges) {
                            const ipRanges = Array.isArray(permission.IpRanges) ?
                                permission.IpRanges : [permission.IpRanges];
                            ipRanges.forEach((range: any) => {
                                if (range.CidrIp) {
                                    actualCidrs.push(range.CidrIp);
                                }
                            });
                        }

                        // Collect security group IDs
                        if (permission.UserIdGroupPairs) {
                            const groups = Array.isArray(permission.UserIdGroupPairs) ?
                                permission.UserIdGroupPairs : [permission.UserIdGroupPairs];
                            groups.forEach((group: any) => {
                                if (group.GroupId) {
                                    actualSgIds.push(group.GroupId);
                                }
                            });
                        }
                    }
                });
            }
        }
        return { cidrs: actualCidrs, sgIds: actualSgIds };
        
    } catch (error) {
        // Return empty arrays as fallback
        return { cidrs: [], sgIds: [] };
    }
}

export function deleteSecurityGroup(region: string, groupId: string): void {
    makeEC2Request(region, 'DeleteSecurityGroup', {
        GroupId: groupId
    });
}

