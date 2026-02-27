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
// These functions are adapted from aws-rds/security-group.ts with proper XML parsing
// that handles nested <item> tags correctly using depth-counting approach

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

function addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(params)) {
        const paramKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === 'object') {
                    addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
                } else {
                    formParams[`${paramKey}.member.${index + 1}`] = String(item);
                }
            });
        } else if (typeof value === 'object') {
            addParamsToFormData(formParams, value, paramKey);
        } else {
            formParams[paramKey] = String(value);
        }
    }
}

/**
 * Makes an EC2 API request with proper XML response parsing
 */
export function makeEC2Request(region: string, action: string, params: Record<string, any> = {}): any {
    const url = `https://ec2.${region}.amazonaws.com/`;
    
    // Build URL-encoded form data for EC2 API
    const formParams: Record<string, string> = {
        'Action': action,
        'Version': '2016-11-15'
    };
    
    // Add parameters to form data
    addParamsToFormData(formParams, params);
    
    // Convert to URL-encoded string
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
        let errorMessage = `AWS EC2 API error: ${response.statusCode} ${response.status}`;
        
        try {
            // Parse XML error response
            const errorMatch = /<message>(.*?)<\/message>/i.exec(response.body);
            if (errorMatch) {
                errorMessage += ` - ${errorMatch[1]}`;
            }
            const codeMatch = /<code>(.*?)<\/code>/i.exec(response.body);
            if (codeMatch) {
                errorMessage += ` (${codeMatch[1]})`;
            }
        } catch (_parseError) {
            errorMessage += ` - Raw: ${response.body}`;
        }
        throw new Error(errorMessage);
    }

    const parsedResponse = parseEC2Response(response.body);
    
    return parsedResponse;
}

/**
 * Parses EC2 XML response with proper handling of nested <item> tags
 * Uses depth-counting approach to correctly match opening/closing tags
 */
function parseEC2Response(xmlBody: string): any {
    const result: any = {};
    
    // Parse security group ID from CreateSecurityGroup response
    const groupIdMatch = /<groupId>(.*?)<\/groupId>/.exec(xmlBody);
    if (groupIdMatch) {
        result.GroupId = groupIdMatch[1];
    }
    
    // Parse security group info from DescribeSecurityGroups response
    const groupNameMatch = /<groupName>(.*?)<\/groupName>/.exec(xmlBody);
    if (groupNameMatch) {
        result.GroupName = groupNameMatch[1];
    }
    
    const descriptionMatch = /<groupDescription>(.*?)<\/groupDescription>/.exec(xmlBody);
    if (descriptionMatch) {
        result.Description = descriptionMatch[1];
    }
    
    const vpcIdMatch = /<vpcId>(.*?)<\/vpcId>/.exec(xmlBody);
    if (vpcIdMatch) {
        result.VpcId = vpcIdMatch[1];
    }
    
    // Parse default VPC from DescribeVpcs response
    const isDefaultMatch = /<isDefault>true<\/isDefault>/.exec(xmlBody);
    if (isDefaultMatch && vpcIdMatch) {
        result.IsDefault = true;
    }
    
    // Parse security groups with ingress rules using depth-counting approach
    const securityGroupInfoMatch = /<securityGroupInfo>(.*?)<\/securityGroupInfo>/s.exec(xmlBody);
    if (securityGroupInfoMatch) {
        const securityGroupInfoXml = securityGroupInfoMatch[1];
        const sgMatches = extractNestedItems(securityGroupInfoXml);

        if (sgMatches.length > 0) {
            result.SecurityGroups = [];
            sgMatches.forEach(sgItemXml => {
                const sgContentMatch = /<item>(.*?)<\/item>/s.exec(sgItemXml);
                if (!sgContentMatch) return;
                const sgXml = sgContentMatch[1];
                
                const sgIdMatch = /<groupId>(.*?)<\/groupId>/.exec(sgXml);
                const sgNameMatch = /<groupName>(.*?)<\/groupName>/.exec(sgXml);
                if (sgIdMatch && sgNameMatch) {
                    const sgVpcIdMatch = /<vpcId>(.*?)<\/vpcId>/.exec(sgXml);
                    const securityGroup: any = {
                        GroupId: sgIdMatch[1],
                        GroupName: sgNameMatch[1],
                        VpcId: sgVpcIdMatch ? sgVpcIdMatch[1] : undefined
                    };
                
                    // Parse ingress rules (IpPermissions)
                    const ipPermissionsMatch = /<ipPermissions>(.*?)<\/ipPermissions>/s.exec(sgItemXml);
                    if (ipPermissionsMatch) {
                        const ipPermissionsXml = ipPermissionsMatch[1];
                        const permissionItems = extractNestedItems(ipPermissionsXml);

                        if (permissionItems.length > 0) {
                            securityGroup.IpPermissions = [];
                            permissionItems.forEach(permXml => {
                                const protocolMatch = /<ipProtocol>(.*?)<\/ipProtocol>/.exec(permXml);
                                const fromPortMatch = /<fromPort>(.*?)<\/fromPort>/.exec(permXml);
                                const toPortMatch = /<toPort>(.*?)<\/toPort>/.exec(permXml);
                                
                                if (protocolMatch) {
                                    const permission: any = {
                                        IpProtocol: protocolMatch[1],
                                        FromPort: fromPortMatch ? fromPortMatch[1] : null,
                                        ToPort: toPortMatch ? toPortMatch[1] : null
                                    };
                                    
                                    // Parse IP ranges - these have nested <item> tags too
                                    const ipRangesMatch = /<ipRanges>(.*?)<\/ipRanges>/s.exec(permXml);
                                    if (ipRangesMatch) {
                                        const ipRangesXml = ipRangesMatch[1];
                                        const ipRangeItems = extractNestedItems(ipRangesXml);
                                        if (ipRangeItems.length > 0) {
                                            permission.IpRanges = [];
                                            ipRangeItems.forEach(ipXml => {
                                                const cidrMatch = /<cidrIp>(.*?)<\/cidrIp>/.exec(ipXml);
                                                if (cidrMatch) {
                                                    permission.IpRanges.push({ CidrIp: cidrMatch[1] });
                                                }
                                            });
                                        }
                                    }
                                    
                                    // Parse user ID group pairs
                                    const groupsMatch = /<groups>(.*?)<\/groups>/s.exec(permXml);
                                    if (groupsMatch) {
                                        const groupsXml = groupsMatch[1];
                                        const groupItems = extractNestedItems(groupsXml);
                                        if (groupItems.length > 0) {
                                            permission.UserIdGroupPairs = [];
                                            groupItems.forEach(grpXml => {
                                                const grpIdMatch = /<groupId>(.*?)<\/groupId>/.exec(grpXml);
                                                if (grpIdMatch) {
                                                    permission.UserIdGroupPairs.push({ GroupId: grpIdMatch[1] });
                                                }
                                            });
                                        }
                                    }
                                    
                                    securityGroup.IpPermissions.push(permission);
                                }
                            });
                        }
                    }
                    
                    result.SecurityGroups.push(securityGroup);
                }
            });
        }
    }
    
    return result;
}

/**
 * Extracts nested <item> elements using depth-counting to handle nested tags correctly
 * This is critical for EC2 XML responses where <item> tags can be nested
 */
function extractNestedItems(xml: string): string[] {
    const items: string[] = [];
    let currentIndex = 0;
    let itemStart = xml.indexOf('<item>', currentIndex);
    
    while (itemStart !== -1) {
        // Find the matching closing tag by counting open/close tags
        let depth = 1;
        let searchPos = itemStart + 6; // Start after '<item>'
        let itemEnd = -1;
        
        while (depth > 0 && searchPos < xml.length) {
            const nextOpen = xml.indexOf('<item>', searchPos);
            const nextClose = xml.indexOf('</item>', searchPos);
            
            if (nextClose === -1) break; // No more closing tags
            
            if (nextOpen !== -1 && nextOpen < nextClose) {
                // Found an opening tag before the next closing tag
                depth++;
                searchPos = nextOpen + 6;
            } else {
                // Found a closing tag
                depth--;
                if (depth === 0) {
                    itemEnd = nextClose + 7; // Include </item>
                }
                searchPos = nextClose + 7;
            }
        }
        
        if (itemEnd !== -1) {
            items.push(xml.substring(itemStart, itemEnd));
            currentIndex = itemEnd;
            itemStart = xml.indexOf('<item>', currentIndex);
        } else {
            break; // Malformed XML
        }
    }
    
    return items;
}

export function getDefaultVpc(region: string): string | null {
    try {
        const response = makeEC2Request(region, 'DescribeVpcs', {
            'Filter.1.Name': 'isDefault',
            'Filter.1.Value.1': 'true'
        });
        
        if (response.VpcId && response.IsDefault) {
            return response.VpcId;
        }

        return null;
    } catch (_error) {
        return null;
    }
}

export function findVpcByName(region: string, vpcName: string): string | null {
    try {
        const response = makeEC2Request(region, 'DescribeVpcs', {
            'Filter.1.Name': 'tag:Name',
            'Filter.1.Value.1': vpcName
        });
        
        if (response.VpcId) {
            return response.VpcId;
        }
        
        return null;
    } catch (_error) {
        return null;
    }
}

export function resolveSecurityGroupNames(region: string, groupNames: string[], vpcId?: string): string[] {
    if (groupNames.length === 0) {
        return [];
    }
    
    try {
        const params: Record<string, any> = {};
        
        // Add group name filters
        params['Filter.1.Name'] = 'group-name';
        groupNames.forEach((name, index) => {
            params[`Filter.1.Value.${index + 1}`] = name;
        });
        
        // If VPC ID is specified, filter by VPC
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
        const sgMatches = response.SecurityGroups || [];
        
        if (Array.isArray(sgMatches)) {
            sgMatches.forEach((sg: any) => {
                if (sg.GroupId) {
                    sgIds.push(sg.GroupId);
                }
            });
        }
        
        // If we didn't find any security groups and we were using a VPC filter, try without VPC filter
        if (sgIds.length === 0 && (vpcId || getDefaultVpc(region))) {
            const noVpcParams: Record<string, any> = {};
            noVpcParams['Filter.1.Name'] = 'group-name';
            groupNames.forEach((name, index) => {
                noVpcParams[`Filter.1.Value.${index + 1}`] = name;
            });
            const noVpcResponse = makeEC2Request(region, 'DescribeSecurityGroups', noVpcParams);
            const noVpcMatches = noVpcResponse.SecurityGroups || [];
            if (Array.isArray(noVpcMatches)) {
                noVpcMatches.forEach((sg: any) => {
                    if (sg.GroupId) {
                        sgIds.push(sg.GroupId);
                    }
                });
            }
        }
        
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
        
        const targetVpcId = vpcId || getDefaultVpc(region);
        
        if (targetVpcId) {
            params['Filter.2.Name'] = 'vpc-id';
            params['Filter.2.Value.1'] = targetVpcId;
        }

        const response = makeEC2Request(region, 'DescribeSecurityGroups', params);
        
        if (response.SecurityGroups && response.SecurityGroups.length > 0) {
            const securityGroups = Array.isArray(response.SecurityGroups) ? 
                response.SecurityGroups : [response.SecurityGroups];
            
            if (securityGroups.length > 0) {
                return securityGroups[0].GroupId;
            }
        }
        
        return null;
    } catch (_error) {
        return null;
    }
}

export function authorizeSecurityGroupIngress(region: string, groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
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

export function revokeSecurityGroupIngress(region: string, groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
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

export function updateSecurityGroupRules(region: string, groupId: string, port: number, allowedCidrs: string[], allowedSgNames: string[], vpcId?: string): void {
    try {
        const normalizedCidrs = normalizeCidrArray(allowedCidrs);
        
        // Query current AWS rules directly
        const currentAwsRules = getCurrentSecurityGroupRules(region, groupId, port);
        
        // Resolve template security group names to IDs
        const allowedSgIds = allowedSgNames.length > 0 ?
            resolveSecurityGroupNames(region, [...allowedSgNames], vpcId) : [];
        
        // Compare template vs AWS reality
        const cidrsToAdd = normalizedCidrs.filter(cidr => !currentAwsRules.cidrs.includes(cidr));
        const cidrsToRemove = currentAwsRules.cidrs.filter(cidr => !normalizedCidrs.includes(cidr));
        const sgIdsToAdd = allowedSgIds.filter(sgId => !currentAwsRules.sgIds.includes(sgId));
        const sgIdsToRemove = currentAwsRules.sgIds.filter(sgId => !allowedSgIds.includes(sgId));
        
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
        
    } catch (_error) {
        return { cidrs: [], sgIds: [] };
    }
}

export function deleteSecurityGroup(region: string, groupId: string): void {
    makeEC2Request(region, 'DeleteSecurityGroup', {
        GroupId: groupId
    });
}
