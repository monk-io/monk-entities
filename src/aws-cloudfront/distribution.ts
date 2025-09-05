import { AWSCloudFrontEntity, AWSCloudFrontDefinition, AWSCloudFrontState } from "./base.ts";
import * as MonkecBase from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";
const action = MonkecBase.action;
import {
    validateDistributionConfig,
    buildDistributionConfig,
    formatDistributionState,
    generateCallerReference
} from "./common.ts";

export interface CloudFrontDistributionDefinition extends AWSCloudFrontDefinition {
    // Inherits all CloudFront definition properties
}

export interface CloudFrontDistributionState extends AWSCloudFrontState {
    // Inherits all CloudFront state properties
}

export class CloudFrontDistribution extends AWSCloudFrontEntity<CloudFrontDistributionDefinition, CloudFrontDistributionState> {
    
    // CloudFront distributions take 15-20 minutes to deploy, so we need longer polling
    static readiness = {
        period: 30,        // Check every 30 seconds
        initialDelay: 30,  // Wait 30 seconds before first check
        attempts: 40       // Up to 20 minutes of checking (40 * 30 seconds)
    };
    
    protected getDistributionId(): string {
        return this.state.distribution_id || '';
    }

    private extractArrayFromIndexedFields(obj: any, fieldName: string): any[] {
        // First check if the field is already a direct array
        if (obj[fieldName] && Array.isArray(obj[fieldName])) {
            return obj[fieldName];
        }
        
        // Otherwise, extract from indexed notation (field!0, field!1, etc.)
        const result: any[] = [];
        let index = 0;
        
        while (obj[`${fieldName}!${index}`] !== undefined) {
            let item = obj[`${fieldName}!${index}`];
            
            // For each extracted item, recursively process any nested indexed fields
            item = this.processNestedIndexedFields(item);
            
            result.push(item);
            index++;
        }
        
        // Filter out null/undefined values to prevent API errors
        return result.filter(item => item != null);
    }

    private processNestedIndexedFields(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }
        
        const processedObj = { ...obj };
        
        // Look for nested indexed fields and convert them to arrays
        const indexedFields = new Set<string>();
        
        // Find all indexed field patterns in the object
        for (const key in processedObj) {
            const match = key.match(/^(.+)!(\d+)$/);
            if (match) {
                const [, fieldName] = match;
                indexedFields.add(fieldName);
            }
        }
        
        // Process each indexed field found
        for (const fieldName of indexedFields) {
            const extractedArray = this.extractArrayFromIndexedFields(processedObj, fieldName);
            
            // Remove the indexed entries and add the array
            let index = 0;
            while (processedObj[`${fieldName}!${index}`] !== undefined) {
                delete processedObj[`${fieldName}!${index}`];
                index++;
            }
            
            if (extractedArray.length > 0) {
                processedObj[fieldName] = extractedArray;
            }
        }
        
        return processedObj;
    }

    override create(): void {
        // Process the definition to extract arrays from indexed fields
        const processedDefinition = this.processNestedIndexedFields(this.definition);
        
        // Validate the distribution configuration
        const validationErrors = validateDistributionConfig(processedDefinition);
        if (validationErrors.length > 0) {
            throw new Error(`Invalid distribution configuration: ${validationErrors.join(', ')}`);
        }

        // Generate caller reference if not provided
        const callerReference = processedDefinition.caller_reference || generateCallerReference('monk-cf-dist');
        
        // Check if distribution already exists by trying to find it
        // Note: CloudFront doesn't have a direct way to check by caller reference,
        // so we'll assume it's a new distribution for now
        
        try {
            // Build distribution configuration
            const distributionConfig = buildDistributionConfig({
                ...processedDefinition,
                caller_reference: callerReference
            });
            
            // Create the distribution
            const response = this.createDistribution({ DistributionConfig: distributionConfig });
            
            if (!response || !response.Distribution) {
                throw new Error('Invalid response: No Distribution object returned');
            }

            // Ensure we have a valid distribution response before formatting state
            if (!response || !response.Distribution) {
                throw new Error(`Invalid CloudFront API response - no Distribution object found. Response: ${JSON.stringify(response, null, 2)}`);
            }

            // Store essential state
            const state = formatDistributionState(response.Distribution, response.ETag, false);
            Object.assign(this.state, state);
            
            // Trigger an immediate readiness check to ensure the readiness system is properly initialized
            this.checkReadiness();
        } catch (error) {
            throw new Error(`Failed to create CloudFront distribution: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override start(): void {
        // For CloudFront distributions, start means the entity is started
        // Readiness checking is handled automatically by Monk's readiness system
    }

    override stop(): void {
        // For CloudFront distributions, there's no specific stop operation
        // The distribution remains available until deleted
    }

    override update(): void {
        if (!this.state.distribution_id) {
            throw new Error('Distribution ID not available for update');
        }

        if (!this.state.etag) {
            throw new Error('ETag not available for update - cannot update without current ETag');
        }

        try {
            // Process the definition to extract arrays from indexed fields
            const processedDefinition = this.processNestedIndexedFields(this.definition);
            
            // Build updated distribution configuration
            const distributionConfig = buildDistributionConfig(processedDefinition);

            const response = this.updateDistribution(
                this.state.distribution_id,
                { DistributionConfig: distributionConfig },
                this.state.etag
            );

            // Update state with new information
            const updatedState = formatDistributionState(response.Distribution, response.ETag, this.state.existing);
            Object.assign(this.state, updatedState);
        } catch (error) {
            throw new Error(`Failed to update CloudFront distribution: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (!this.state.distribution_id) {
            return;
        }

        // Only delete distributions we created, not pre-existing ones
        if (this.state.existing) {
            // Just reset tracking
            this.state.distribution_id = undefined;
            this.state.etag = undefined;
            return;
        }

        try {
            // Step 1: Get current distribution status
            const currentDistribution = this.checkDistributionExists(this.state.distribution_id);
            if (!currentDistribution) {
// Debug removed Distribution ${this.state.distribution_id} not found, considering it already deleted`);
                this.clearState();
                return;
            }

            // Update state with latest info
// Debug removed Updating state with latest distribution information`);
            const formattedState = formatDistributionState(currentDistribution.Distribution, currentDistribution.ETag, this.state.existing);
            Object.assign(this.state, formattedState);

            const isEnabled = this.state.distribution_config_enabled;
            const currentStatus = currentDistribution.Distribution?.Status;
            
// Debug removed Current distribution status: Enabled=${isEnabled}, Status=${currentStatus}`);

            // Step 2: Auto-disable if enabled
            if (isEnabled) {
// Debug removed Distribution is enabled, automatically disabling...`);
                this.performDisable(currentDistribution);
                
                // Step 3: Wait for deployment after disable
// Debug removed Waiting for distribution to reach 'Deployed' status after disable...`);
                this.waitForDeployment();
            } else {
                // If already disabled, still check if it's deployed
                if (currentStatus !== 'Deployed') {
// Debug removed Distribution is disabled but status is '${currentStatus}', waiting for deployment...`);
                    this.waitForDeployment();
                }
            }

            // Step 4: Perform final deletion
// Debug removed Distribution is disabled and deployed, proceeding with deletion`);
            
            // Get fresh distribution info for final deletion
            const finalDistribution = this.checkDistributionExists(this.state.distribution_id);
            if (!finalDistribution) {
// Debug removed Distribution disappeared during process, considering deleted`);
                this.clearState();
                return;
            }

// Debug removed Deleting distribution with ETag: ${finalDistribution.ETag}`);
            this.deleteDistribution(this.state.distribution_id, finalDistribution.ETag);
            
            cli.output(`✅ CloudFront distribution deleted successfully`);
            
            // Clear state
            this.clearState();
            
        } catch (error) {
// Debug removed Delete distribution error:`, error);
            throw new Error(`Failed to delete CloudFront distribution: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private performDisable(_currentDistribution: any): void {
        try {
// Debug removed Using raw XML passthrough approach for disable`);
            
            // AWS-documented workflow: GetDistributionConfig -> modify Enabled -> UpdateDistribution
            if (!this.state.distribution_id) {
                throw new Error('No distribution ID available for disable operation');
            }
            const configResponse = this.getDistributionConfigForUpdate(this.state.distribution_id);
            if (!configResponse.ETag) {
                throw new Error('No ETag returned from GetDistributionConfig');
            }
            
// Debug removed GetDistributionConfig successful, ETag: ${configResponse.ETag}`);
            
            // Use raw XML passthrough approach - modify only Enabled field in AWS XML
            if (!configResponse.RawDistributionConfigXML) {
                throw new Error('No raw DistributionConfig XML available for passthrough approach');
            }
            
// Debug removed Original XML length: ${configResponse.RawDistributionConfigXML.length}`);
            
            // Modify only the Enabled field in the raw XML
            const modifiedXml = configResponse.RawDistributionConfigXML.replace(
                /<PriceClass>[^<]*<\/PriceClass>\s*<Enabled>true<\/Enabled>/,
                (match: string) => match.replace('<Enabled>true</Enabled>', '<Enabled>false</Enabled>')
            );
            
// Debug removed Modified XML - Enabled changed to false`);
// Debug removed Calling UpdateDistribution with raw modified XML`);
            
            const disableResponse = this.updateDistributionWithRawXML(
                this.state.distribution_id, // Already checked above
                modifiedXml,
                configResponse.ETag
            );

            // Update ETag for subsequent operations
            this.state.etag = disableResponse.ETag;
            this.state.distribution_config_enabled = false;
            
            cli.output(`✅ Distribution disable initiated successfully`);
            
        } catch (error) {
            const errorMsg = `Failed to disable distribution: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(`❌ ${errorMsg}`);
            cli.output(`📋 Manual workflow recommended:`);
            cli.output(`   1. Go to AWS Console: https://console.aws.amazon.com/cloudfront/v3/home#/distributions/${this.state.distribution_id}`);
            cli.output(`   2. Click "Disable" button`);
            cli.output(`   3. Wait for deployment to complete`);
            cli.output(`   4. Run: monk delete --force your-distribution`);
            throw new Error(errorMsg);
        }
    }

    private waitForDeployment(): void {
// Debug removed Waiting for CloudFront distribution to reach 'Deployed' status...`);
// Debug removed This typically takes 15-20 minutes for CloudFront distributions`);
        
        const maxAttempts = 60; // 60 attempts with 30s intervals = 30 minutes max
        const intervalSeconds = 30;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            attempts++;
// Debug removed Deployment check attempt ${attempts}/${maxAttempts}...`);
            
            try {
                if (!this.state.distribution_id) {
                    throw new Error('No distribution ID available during deployment wait');
                }
                const currentDistribution = this.checkDistributionExists(this.state.distribution_id);
                if (!currentDistribution) {
                    throw new Error('Distribution not found during deployment wait');
                }
                
                const status = currentDistribution.Distribution?.Status;
                
                if (status === 'Deployed') {
                    cli.output(`✅ Distribution has reached 'Deployed' status`);
                    // Update our state with latest info
                    const formattedState = formatDistributionState(currentDistribution.Distribution, currentDistribution.ETag, this.state.existing);
                    Object.assign(this.state, formattedState);
                    return;
                }
                
                if (attempts < maxAttempts) {
// Debug removed Status is '${status}', waiting ${intervalSeconds}s before next check...`);
                    // Simple sleep implementation
                    const start = Date.now();
                    while (Date.now() - start < intervalSeconds * 1000) {
                        // Busy wait - not ideal but works for our use case
                    }
                }
                
            } catch (error) {
// Debug removed Error during deployment wait:`, error);
                if (attempts < maxAttempts) {
// Debug removed Retrying in ${intervalSeconds}s...`);
                    const start = Date.now();
                    while (Date.now() - start < intervalSeconds * 1000) {
                        // Busy wait
                    }
                } else {
                    throw error;
                }
            }
        }
        
        throw new Error(`Distribution did not reach 'Deployed' status within ${maxAttempts * intervalSeconds / 60} minutes. Please wait longer and try deletion again.`);
    }

    override checkReadiness(): boolean {
        if (!this.state.distribution_id) {
// Debug removed No distribution ID found for readiness check`);
            return false;
        }

// Debug removed Checking readiness for distribution: ${this.state.distribution_id}`);

        try {
            const response = this.checkDistributionExists(this.state.distribution_id);
            if (!response) {
// Debug removed Distribution not found: ${this.state.distribution_id}`);
                return false;
            }

// Debug removed API response distribution object: ${JSON.stringify(response.Distribution, null, 2)}`);
// Debug removed Current state before update: ${JSON.stringify(this.state, null, 2)}`);

            // Update state from current information
            const updatedState = formatDistributionState(response.Distribution, response.ETag, this.state.existing);
// Debug removed Updated state to apply: ${JSON.stringify(updatedState, null, 2)}`);
            
            Object.assign(this.state, updatedState);
// Debug removed Current state after update: ${JSON.stringify(this.state, null, 2)}`);

            const isReady = this.state.distribution_status === 'Deployed';
// Debug removed Distribution status: ${this.state.distribution_status}, ready: ${isReady}`);
            
            return isReady;
        } catch (error) {
// Debug removed Readiness check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    // Custom actions

    @action("get-distribution-info")
    getDistributionInfo(_args?: MonkecBase.Args): void {
        if (!this.state.distribution_id) {
            cli.output('Distribution not created yet');
            throw new Error('Distribution not created yet');
        }

        try {
            const response = this.checkDistributionExists(this.state.distribution_id);
            if (!response) {
                cli.output(`Distribution ${this.state.distribution_id} not found`);
                throw new Error(`Distribution ${this.state.distribution_id} not found`);
            }

            const distributionInfo = {
                distribution_id: this.state.distribution_id,
                domain_name: this.state.domain_name,
                status: this.state.distribution_status,
                arn: this.state.distribution_arn,
                last_modified: this.state.last_modified_time,
                in_progress_invalidations: this.state.in_progress_invalidation_batches,
                etag: this.state.etag
            };

            cli.output('=== CloudFront Distribution Information ===');
            cli.output(JSON.stringify(distributionInfo, null, 2));
        } catch (error) {
            const errorMsg = `Failed to get distribution info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Parse complete DistributionConfig from GetDistribution XML response
     * This rebuilds the config using the same structure as CreateDistribution
     */
    @action("get-distribution-config")
    getDistributionConfig(_args?: MonkecBase.Args): void {
        if (!this.state.distribution_id) {
            cli.output('Distribution not created yet');
            throw new Error('Distribution not created yet');
        }

        try {
            const response = this.checkDistributionExists(this.state.distribution_id);
            if (!response) {
                cli.output(`Distribution ${this.state.distribution_id} not found`);
                throw new Error(`Distribution ${this.state.distribution_id} not found`);
            }

            cli.output('=== CloudFront Distribution Configuration ===');
            cli.output(JSON.stringify(response.Distribution?.DistributionConfig, null, 2));
        } catch (error) {
            const errorMsg = `Failed to get distribution config: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }


    @action("create-invalidation")
    createInvalidation(args?: MonkecBase.Args): void {
        if (!this.state.distribution_id) {
            cli.output('Distribution not created yet');
            throw new Error('Distribution not created yet');
        }

        const pathsArg = args?.paths;
        const paths: string[] = Array.isArray(pathsArg) ? pathsArg : (typeof pathsArg === 'string' ? [pathsArg] : ['/*']);
        const callerReference = args?.caller_reference as string || `invalidation-${Date.now()}`;

        if (!Array.isArray(paths) || paths.length === 0) {
            cli.output('At least one path is required for invalidation');
            throw new Error('At least one path is required for invalidation');
        }

        try {
            cli.output(`Creating invalidation for distribution ${this.state.distribution_id}`);
            cli.output(`Paths: ${paths.join(', ')}`);
            
            const invalidationResponse = this.createDistributionInvalidation(
                this.state.distribution_id,
                paths,
                callerReference
            );

            cli.output('=== Invalidation Created ===');
            cli.output(JSON.stringify(invalidationResponse, null, 2));
        } catch (error) {
            const errorMsg = `Failed to create invalidation: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("list-invalidations")
    listInvalidations(_args?: MonkecBase.Args): void {
        if (!this.state.distribution_id) {
            cli.output('Distribution not created yet');
            throw new Error('Distribution not created yet');
        }

        try {
            const invalidations = this.listDistributionInvalidations(this.state.distribution_id);
            
            cli.output('=== Distribution Invalidations ===');
            cli.output(JSON.stringify(invalidations, null, 2));
        } catch (error) {
            const errorMsg = `Failed to list invalidations: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    // Implementation of abstract methods from base class

    protected checkDistributionExists(distributionId: string): any {
        return this.makeCloudFrontRequest('GetDistribution', { Id: distributionId });
    }

    protected createDistribution(params: any): any {
        return this.makeCloudFrontRequest('CreateDistribution', params);
    }

    protected updateDistribution(distributionId: string, params: any, etag: string): any {
        return this.makeCloudFrontRequest('UpdateDistribution', {
            Id: distributionId,
            IfMatch: etag,
            ...params
        });
    }

    protected updateDistributionWithRawXML(distributionId: string, rawXml: string, etag: string): any {
        const url = `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}/config`;
        
// Debug removed UpdateDistribution with raw XML to: ${url}`);
// Debug removed ETag: ${etag}`);
// Debug removed Raw XML body:`, rawXml);
        
        const response = aws.put(url, {
            service: 'cloudfront',
            region: 'us-east-1',
            headers: {
                'Content-Type': 'application/xml',
                'If-Match': etag
            },
            body: rawXml
        });
        
// Debug removed UpdateDistribution response status: ${response.statusCode}`);
// Debug removed UpdateDistribution response headers:`, JSON.stringify(response.headers, null, 2));
        
        if (response.statusCode >= 400) {
            const error = this.parseCloudFrontResponse(response.body);
            throw new Error(`AWS CloudFront API error: ${response.statusCode} - ${error.Error?.Message} (${error.Error?.Code})`);
        }
        
        return this.parseCloudFrontResponse(response.body, response.headers);
    }

    protected deleteDistribution(distributionId: string, etag: string): any {
        return this.makeCloudFrontRequest('DeleteDistribution', {
            Id: distributionId,
            IfMatch: etag
        });
    }

    // Additional helper methods for custom actions

    private createDistributionInvalidation(distributionId: string, paths: string[], callerReference: string): any {
        const url = `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}/invalidation`;
        
        const invalidationXml = this.buildInvalidationXml(paths, callerReference);
        
// Debug removed Creating invalidation for distribution: ${distributionId}`);
// Debug removed Invalidation XML:`, invalidationXml);
        
        const response = aws.post(url, {
            service: 'cloudfront',
            region: 'us-east-1',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: invalidationXml
        });

// Debug removed Invalidation response:`, response.statusCode, response.body);

        if (response.statusCode >= 400) {
            this.handleCloudFrontError(response, 'CreateInvalidation');
        }

        return this.parseInvalidationResponse(response.body);
    }

    private listDistributionInvalidations(distributionId: string): any {
        const url = `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}/invalidation`;
        
// Debug removed Listing invalidations for distribution: ${distributionId}`);
        
        const response = aws.get(url, {
            service: 'cloudfront',
            region: 'us-east-1'
        });

// Debug removed List invalidations response:`, response.statusCode, response.body);

        if (response.statusCode >= 400) {
            this.handleCloudFrontError(response, 'ListInvalidations');
        }

        return this.parseInvalidationListResponse(response.body);
    }

    private buildInvalidationXml(paths: string[], callerReference: string): string {
        const pathsXml = paths.map(path => `      <member>${this.escapeXml(path)}</member>`).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">
  <Paths>
    <Quantity>${paths.length}</Quantity>
    <Items>
${pathsXml}
    </Items>
  </Paths>
  <CallerReference>${this.escapeXml(callerReference)}</CallerReference>
</InvalidationBatch>`;
    }

    private parseInvalidationResponse(xmlBody: string): any {
        const result: any = {};
        
        const invalidationMatch = /<Invalidation>([\s\S]*?)<\/Invalidation>/.exec(xmlBody);
        if (invalidationMatch) {
            const invalidationXml = invalidationMatch[1];
            
            const idMatch = /<Id>(.*?)<\/Id>/.exec(invalidationXml);
            if (idMatch) {
                result.id = idMatch[1];
            }
            
            const statusMatch = /<Status>(.*?)<\/Status>/.exec(invalidationXml);
            if (statusMatch) {
                result.status = statusMatch[1];
            }
            
            const createTimeMatch = /<CreateTime>(.*?)<\/CreateTime>/.exec(invalidationXml);
            if (createTimeMatch) {
                result.create_time = createTimeMatch[1];
            }
        }
        
        return result;
    }

    private parseInvalidationListResponse(xmlBody: string): any {
        const result: any = { invalidations: [] };
        
        const invalidationListMatch = /<InvalidationList>([\s\S]*?)<\/InvalidationList>/.exec(xmlBody);
        if (invalidationListMatch) {
            const listXml = invalidationListMatch[1];
            
            const invalidationMatches = listXml.match(/<InvalidationSummary>[\s\S]*?<\/InvalidationSummary>/g);
            if (invalidationMatches) {
                result.invalidations = invalidationMatches.map(invalidationXml => {
                    const invalidation: any = {};
                    
                    const idMatch = /<Id>(.*?)<\/Id>/.exec(invalidationXml);
                    if (idMatch) {
                        invalidation.id = idMatch[1];
                    }
                    
                    const statusMatch = /<Status>(.*?)<\/Status>/.exec(invalidationXml);
                    if (statusMatch) {
                        invalidation.status = statusMatch[1];
                    }
                    
                    const createTimeMatch = /<CreateTime>(.*?)<\/CreateTime>/.exec(invalidationXml);
                    if (createTimeMatch) {
                        invalidation.create_time = createTimeMatch[1];
                    }
                    
                    return invalidation;
                });
            }
        }
        
        return result;
    }

    private clearState(): void {
        this.state.distribution_id = undefined;
        this.state.distribution_arn = undefined;
        this.state.distribution_status = undefined;
        this.state.domain_name = undefined;
        this.state.etag = undefined;
        this.state.last_modified_time = undefined;
        this.state.creation_time = undefined;
        this.state.in_progress_invalidation_batches = undefined;
        this.state.existing = false;
    }
}
