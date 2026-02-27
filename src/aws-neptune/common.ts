/**
 * Common types and utilities for AWS Neptune entities
 */

import aws from "cloud/aws";

/**
 * Neptune cluster status values
 */
export type ClusterStatus = 
    | 'available'
    | 'backing-up'
    | 'creating'
    | 'deleting'
    | 'failing-over'
    | 'maintenance'
    | 'migrating'
    | 'modifying'
    | 'rebooting'
    | 'resetting-master-credentials'
    | 'renaming'
    | 'starting'
    | 'stopped'
    | 'stopping'
    | 'upgrading';

/**
 * Neptune instance status values
 */
export type InstanceStatus =
    | 'available'
    | 'backing-up'
    | 'creating'
    | 'deleting'
    | 'failed'
    | 'maintenance'
    | 'modifying'
    | 'rebooting'
    | 'renaming'
    | 'resetting-master-credentials'
    | 'starting'
    | 'stopped'
    | 'stopping'
    | 'storage-optimization'
    | 'upgrading';

/**
 * Neptune engine types
 */
export type NeptuneEngine = 'neptune';

/**
 * Neptune instance classes
 */
export type InstanceClass =
    | 'db.r5.large'
    | 'db.r5.xlarge'
    | 'db.r5.2xlarge'
    | 'db.r5.4xlarge'
    | 'db.r5.8xlarge'
    | 'db.r5.12xlarge'
    | 'db.r5.16xlarge'
    | 'db.r5.24xlarge'
    | 'db.r6g.large'
    | 'db.r6g.xlarge'
    | 'db.r6g.2xlarge'
    | 'db.r6g.4xlarge'
    | 'db.r6g.8xlarge'
    | 'db.r6g.12xlarge'
    | 'db.r6g.16xlarge'
    | 'db.t3.medium'
    | 'db.t4g.medium'
    | 'db.serverless';

/**
 * Validates a Neptune cluster identifier
 * @param identifier The cluster identifier to validate
 * @returns True if valid, false otherwise
 */
export function validateClusterIdentifier(identifier: string): boolean {
    // Must be 1-63 characters
    // Must start with a letter
    // Can only contain letters, numbers, and hyphens
    // Cannot end with a hyphen or contain two consecutive hyphens
    if (!identifier || identifier.length < 1 || identifier.length > 63) {
        return false;
    }
    if (!/^[a-zA-Z]/.test(identifier)) {
        return false;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(identifier)) {
        return false;
    }
    if (identifier.endsWith('-') || identifier.includes('--')) {
        return false;
    }
    return true;
}

/**
 * Validates a Neptune instance identifier
 * @param identifier The instance identifier to validate
 * @returns True if valid, false otherwise
 */
export function validateInstanceIdentifier(identifier: string): boolean {
    return validateClusterIdentifier(identifier);
}

/**
 * Default port for Neptune
 */
export const NEPTUNE_DEFAULT_PORT = 8182;

/**
 * Default engine for Neptune
 */
export const NEPTUNE_ENGINE = 'neptune';

// ==================== EC2 API Functions for Security Groups ====================

/**
 * Helper to add parameters to form data for EC2 API
 */
function addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix: string = ''): void {
    for (const [key, value] of Object.entries(params)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === 'object' && item !== null) {
                    addParamsToFormData(formParams, item, `${fullKey}.${index + 1}`);
                } else {
                    formParams[`${fullKey}.${index + 1}`] = String(item);
                }
            });
        } else if (typeof value === 'object') {
            addParamsToFormData(formParams, value, fullKey);
        } else {
            formParams[fullKey] = String(value);
        }
    }
}

/**
 * Makes a request to the EC2 API
 */
export function makeEC2Request(region: string, action: string, params: Record<string, any> = {}): any {
    const url = `https://ec2.${region}.amazonaws.com/`;
    
    const formParams: Record<string, string> = {
        'Action': action,
        'Version': '2016-11-15'
    };
    
    addParamsToFormData(formParams, params);
    
    const formBody = Object.entries(formParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    const response = aws.post(url, {
        service: 'ec2',
        region: region,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody
    });
    
    if (response.statusCode >= 400) {
        let errorMessage = `EC2 API error: ${response.statusCode} ${response.status}`;
        try {
            // Parse XML error response
            const msgMatch = /<Message>(.*?)<\/Message>/.exec(response.body);
            if (msgMatch) {
                errorMessage += ` - ${msgMatch[1]}`;
            }
            const codeMatch = /<Code>(.*?)<\/Code>/.exec(response.body);
            if (codeMatch) {
                errorMessage += ` (${codeMatch[1]})`;
            }
        } catch (_parseError) {
            errorMessage += ` - Raw: ${response.body}`;
        }
        throw new Error(errorMessage);
    }
    
    return response.body;
}

/**
 * Converts a single IP address to CIDR notation if needed
 */
function normalizeToCidr(ipOrCidr: string): string {
    if (ipOrCidr.includes('/')) {
        return ipOrCidr;
    }
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(ipOrCidr)) {
        return `${ipOrCidr}/32`;
    }
    return ipOrCidr;
}

/**
 * Normalizes an array of IP addresses and CIDR blocks to proper CIDR notation
 */
function normalizeCidrArray(ipAddresses: string[]): string[] {
    return ipAddresses.map(ip => normalizeToCidr(ip.trim()));
}

/**
 * Gets the default VPC for a region
 */
export function getDefaultVpc(region: string): string | null {
    try {
        const response = makeEC2Request(region, 'DescribeVpcs', {
            'Filter.1.Name': 'isDefault',
            'Filter.1.Value.1': 'true'
        });
        
        // Parse VPC ID from XML response
        const vpcIdMatch = /<vpcId>(vpc-[a-z0-9]+)<\/vpcId>/i.exec(response);
        if (vpcIdMatch) {
            return vpcIdMatch[1];
        }
        return null;
    } catch (_error) {
        return null;
    }
}

/**
 * Finds a VPC by its Name tag
 */
export function findVpcByName(region: string, vpcName: string): string | null {
    try {
        const response = makeEC2Request(region, 'DescribeVpcs', {
            'Filter.1.Name': 'tag:Name',
            'Filter.1.Value.1': vpcName
        });
        
        // Parse VPC ID from response
        const vpcIdMatch = /<vpcId>(vpc-[a-z0-9]+)<\/vpcId>/i.exec(response);
        if (vpcIdMatch) {
            return vpcIdMatch[1];
        }
        return null;
    } catch (_error) {
        return null;
    }
}

/**
 * Resolves security group names to IDs
 */
export function resolveSecurityGroupNames(region: string, groupNames: string[], vpcId?: string): string[] {
    if (groupNames.length === 0) {
        return [];
    }
    
    try {
        const params: Record<string, any> = {};
        params['Filter.1.Name'] = 'group-name';
        groupNames.forEach((name, index) => {
            params[`Filter.1.Value.${index + 1}`] = name;
        });
        
        if (vpcId) {
            params['Filter.2.Name'] = 'vpc-id';
            params['Filter.2.Value.1'] = vpcId;
        } else {
            const defaultVpcId = getDefaultVpc(region);
            if (defaultVpcId) {
                params['Filter.2.Name'] = 'vpc-id';
                params['Filter.2.Value.1'] = defaultVpcId;
            }
        }
        
        const response = makeEC2Request(region, 'DescribeSecurityGroups', params);
        const sgIds: string[] = [];
        
        // Parse all GroupIds from XML response
        const groupIdRegex = /<groupId>(sg-[a-z0-9]+)<\/groupId>/gi;
        let match;
        while ((match = groupIdRegex.exec(response)) !== null) {
            sgIds.push(match[1]);
        }
        
        // If no results with VPC filter, try without
        if (sgIds.length === 0 && (vpcId || getDefaultVpc(region))) {
            const noVpcParams: Record<string, any> = {};
            noVpcParams['Filter.1.Name'] = 'group-name';
            groupNames.forEach((name, index) => {
                noVpcParams[`Filter.1.Value.${index + 1}`] = name;
            });
            const noVpcResponse = makeEC2Request(region, 'DescribeSecurityGroups', noVpcParams);
            
            const noVpcRegex = /<groupId>(sg-[a-z0-9]+)<\/groupId>/gi;
            while ((match = noVpcRegex.exec(noVpcResponse)) !== null) {
                sgIds.push(match[1]);
            }
        }
        
        return sgIds;
    } catch (error) {
        throw new Error(`Failed to resolve security group names: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Creates a new security group
 */
export function createSecurityGroup(region: string, groupName: string, description: string, vpcId?: string): string {
    const params: Record<string, any> = {
        GroupName: groupName,
        GroupDescription: description
    };
    
    if (vpcId) {
        params.VpcId = vpcId;
    }
    
    const response = makeEC2Request(region, 'CreateSecurityGroup', params);
    
    // Parse GroupId from XML response
    const groupIdMatch = /<groupId>(sg-[a-z0-9]+)<\/groupId>/i.exec(response);
    if (!groupIdMatch) {
        throw new Error(`Failed to create security group: No GroupId in response. Raw: ${response.substring(0, 500)}`);
    }
    
    return groupIdMatch[1];
}

/**
 * Checks if a security group exists
 */
export function checkSecurityGroupExists(region: string, groupId: string): boolean {
    try {
        makeEC2Request(region, 'DescribeSecurityGroups', {
            'GroupId.1': groupId
        });
        return true;
    } catch (error) {
        if (error instanceof Error && error.message.includes('InvalidGroupId.NotFound')) {
            return false;
        }
        throw error;
    }
}

/**
 * Finds a security group by name
 */
export function findSecurityGroupByName(region: string, groupName: string, vpcId?: string): string | null {
    try {
        const params: Record<string, any> = {
            'Filter.1.Name': 'group-name',
            'Filter.1.Value.1': groupName
        };
        
        const targetVpcId = vpcId || getDefaultVpc(region);
        if (targetVpcId) {
            params['Filter.2.Name'] = 'vpc-id';
            params['Filter.2.Value.1'] = targetVpcId;
        }

        const response = makeEC2Request(region, 'DescribeSecurityGroups', params);
        
        // Parse GroupId from XML response
        const groupIdMatch = /<groupId>(sg-[a-z0-9]+)<\/groupId>/i.exec(response);
        if (groupIdMatch) {
            return groupIdMatch[1];
        }
        
        return null;
    } catch (_error) {
        return null;
    }
}

/**
 * Authorizes ingress rules on a security group
 */
export function authorizeSecurityGroupIngress(
    region: string, 
    groupId: string, 
    protocol: string, 
    fromPort: number, 
    toPort: number, 
    cidrBlocks: string[], 
    sourceSecurityGroupIds: string[] = []
): void {
    const normalizedCidrs = normalizeCidrArray(cidrBlocks);
    const params: Record<string, any> = {
        GroupId: groupId
    };
    
    let permissionIndex = 1;
    
    normalizedCidrs.forEach((cidr) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
        permissionIndex++;
    });
    
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
        if (error instanceof Error && !error.message.includes('InvalidPermission.Duplicate')) {
            throw error;
        }
    }
}

/**
 * Revokes ingress rules from a security group
 */
export function revokeSecurityGroupIngress(
    region: string, 
    groupId: string, 
    protocol: string, 
    fromPort: number, 
    toPort: number, 
    cidrBlocks: string[], 
    sourceSecurityGroupIds: string[] = []
): void {
    const normalizedCidrs = normalizeCidrArray(cidrBlocks);
    const params: Record<string, any> = {
        GroupId: groupId
    };
    
    let permissionIndex = 1;
    
    normalizedCidrs.forEach((cidr) => {
        const permissionBase = `IpPermissions.${permissionIndex}`;
        params[`${permissionBase}.IpProtocol`] = protocol;
        params[`${permissionBase}.FromPort`] = fromPort.toString();
        params[`${permissionBase}.ToPort`] = toPort.toString();
        params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
        permissionIndex++;
    });
    
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
        if (error instanceof Error && !error.message.includes('InvalidPermission.NotFound')) {
            throw error;
        }
    }
}

/**
 * Gets current security group rules for a specific port
 */
export function getCurrentSecurityGroupRules(region: string, groupId: string, port: number): { cidrs: string[]; sgIds: string[] } {
    try {
        const response = makeEC2Request(region, 'DescribeSecurityGroups', {
            'GroupId.1': groupId
        });
        const actualCidrs: string[] = [];
        const actualSgIds: string[] = [];

        if (response.SecurityGroups && response.SecurityGroups.length > 0) {
            const securityGroup = response.SecurityGroups[0];
            if (securityGroup.IpPermissions) {
                const permissions = Array.isArray(securityGroup.IpPermissions) ?
                    securityGroup.IpPermissions : [securityGroup.IpPermissions];

                permissions.forEach((permission: any) => {
                    if (permission.IpProtocol === 'tcp' &&
                        parseInt(permission.FromPort) === port &&
                        parseInt(permission.ToPort) === port) {

                        if (permission.IpRanges) {
                            const ipRanges = Array.isArray(permission.IpRanges) ?
                                permission.IpRanges : [permission.IpRanges];
                            ipRanges.forEach((range: any) => {
                                if (range.CidrIp) {
                                    actualCidrs.push(range.CidrIp);
                                }
                            });
                        }

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
        
    } catch (_error) {
        return { cidrs: [], sgIds: [] };
    }
}

/**
 * Updates security group rules to match desired state
 */
export function updateSecurityGroupRules(
    region: string, 
    groupId: string, 
    port: number, 
    allowedCidrs: string[], 
    allowedSgNames: string[], 
    vpcId?: string
): void {
    try {
        const normalizedCidrs = normalizeCidrArray(allowedCidrs);
        const currentAwsRules = getCurrentSecurityGroupRules(region, groupId, port);
        
        const allowedSgIds = allowedSgNames.length > 0 ?
            resolveSecurityGroupNames(region, [...allowedSgNames], vpcId) : [];
        
        const cidrsToAdd = normalizedCidrs.filter(cidr => !currentAwsRules.cidrs.includes(cidr));
        const cidrsToRemove = currentAwsRules.cidrs.filter(cidr => !normalizedCidrs.includes(cidr));
        const sgIdsToAdd = allowedSgIds.filter(sgId => !currentAwsRules.sgIds.includes(sgId));
        const sgIdsToRemove = currentAwsRules.sgIds.filter(sgId => !allowedSgIds.includes(sgId));
        
        if (cidrsToAdd.length === 0 && cidrsToRemove.length === 0 &&
            sgIdsToAdd.length === 0 && sgIdsToRemove.length === 0) {
            return;
        }

        if (cidrsToRemove.length > 0 || sgIdsToRemove.length > 0) {
            revokeSecurityGroupIngress(region, groupId, 'tcp', port, port, cidrsToRemove, sgIdsToRemove);
        }

        if (cidrsToAdd.length > 0 || sgIdsToAdd.length > 0) {
            authorizeSecurityGroupIngress(region, groupId, 'tcp', port, port, cidrsToAdd, sgIdsToAdd);
        }
    } catch (error) {
        throw new Error(`Failed to update security group rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Deletes a security group
 */
export function deleteSecurityGroup(region: string, groupId: string): void {
    makeEC2Request(region, 'DeleteSecurityGroup', {
        GroupId: groupId
    });
}
