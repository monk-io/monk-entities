import { AWSMQEntity, AWSMQDefinition, AWSMQState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
import cli from "cli";
import {
    validateBrokerName,
    validateEngineType,
    validateInstanceType,
    validateMaintenanceWindow,
    buildCreateBrokerParams,
    buildUpdateBrokerParams,
    formatBrokerState
} from "./common.ts";

export interface MQBrokerDefinition extends AWSMQDefinition {
    // All properties inherited from AWSMQDefinition
}

export interface MQBrokerState extends AWSMQState {
    // All properties inherited from AWSMQState
}

export class MQBroker extends AWSMQEntity<MQBrokerDefinition, MQBrokerState> {
    
    static readonly readiness = { period: 15, initialDelay: 15, attempts: 80 };

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
        
        return result.filter(item => item !== null && item !== undefined);
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

    protected getBrokerName(): string {
        return this.definition.broker_name;
    }

    override create(): void {
        // Process the definition to extract arrays from indexed fields (users!0, users!1, etc.)
        const processedDefinition = this.processNestedIndexedFields(this.definition);
        
        const brokerName = this.getBrokerName();
        console.log(`[MQ Create] Starting broker creation: ${brokerName}`);
        
        // Validate input parameters
        if (!validateBrokerName(brokerName)) {
            throw new Error(`Invalid broker name: ${brokerName}. Must be 1-50 alphanumeric characters or hyphens, cannot start/end with hyphen.`);
        }
        
        if (!validateEngineType(this.definition.engine_type)) {
            throw new Error(`Invalid engine type: ${this.definition.engine_type}. Must be ACTIVEMQ or RABBITMQ.`);
        }
        
        if (!validateInstanceType(this.definition.engine_type, this.definition.host_instance_type)) {
            throw new Error(`Invalid instance type: ${this.definition.host_instance_type} for engine ${this.definition.engine_type}.`);
        }
        
        if (this.definition.maintenance_window_start_time && !validateMaintenanceWindow(this.definition.maintenance_window_start_time)) {
            throw new Error(`Invalid maintenance window format: ${this.definition.maintenance_window_start_time}. Use format: ddd:hh24:mi`);
        }

        // Try to create the broker and handle conflict if it already exists
        try {
            // Build create parameters
            const params = buildCreateBrokerParams(processedDefinition);
            
            const response = this.createBroker(params);
            
            const brokerId = (response as any).brokerId || response.BrokerId;
            const brokerArn = (response as any).brokerArn || response.BrokerArn;
            
            if (brokerId) {
                // We created this broker, mark as not existing (can delete on cleanup)
                // Set initial state with broker ID - state will be updated in readiness check
                this.state.existing = false;
                this.state.broker_id = brokerId;
                this.state.broker_arn = brokerArn;
                // Note: broker_state will be set when we check readiness
            } else {
                throw new Error('AWS API returned success but no BrokerId');
            }
        } catch (error) {
            // Check if this is a "broker already exists" error
            if (error instanceof Error && (error.message.includes('ConflictException') || error.message.includes('409 Conflict') || error.message.includes('already exists'))) {
                // Try to find the existing broker by name
                const existingBroker = this.findBrokerByName(brokerName);
                if (existingBroker) {
                    // Found the existing broker, populate state
                    const brokerState = formatBrokerState(existingBroker, true); // true = pre-existing
                    Object.assign(this.state, brokerState);
                    cli.output(`✅ Found and managing existing broker ${brokerName} (ID: ${(existingBroker as any).brokerId || existingBroker.BrokerId})`);
                } else {
                    // Couldn't find the broker, set minimal state
                    this.state.existing = true;
                    cli.output(`⚠️ Broker ${brokerName} already exists but cannot be managed without additional permissions`);
                    cli.output(`Entity will track existence to prevent accidental deletion`);
                }
                return;
            }
            
            throw new Error(`Failed to create MQ broker ${brokerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override start(): void {
        // MQ brokers don't have a separate start operation like some other services
        // They are started automatically after creation and remain running
        this.updateStateFromAWS();
    }

    override stop(): void {
        // MQ brokers cannot be stopped, only deleted
        // This is a no-op for MQ brokers - they remain running until deleted
        this.updateStateFromAWS();
    }

    override update(): void {
        // Process the definition to extract arrays from indexed fields
        const processedDefinition = this.processNestedIndexedFields(this.definition);
        
        if (!this.state.broker_id) {
            throw new Error(`Cannot update MQ broker: broker not found in state`);
        }
        
        try {
            // Build update parameters from current definition
            const updateParams = buildUpdateBrokerParams(processedDefinition);
            
            // Only proceed with modification if there are parameters to update
            if (Object.keys(updateParams).length > 0) {
                const response = this.updateBroker(this.state.broker_id, updateParams);
                
                // Update state from the response
                if (response) {
                    const updatedState = formatBrokerState(response, this.state.existing);
                    Object.assign(this.state, updatedState);
                }
            } else {
                // Still update state from AWS to get current status
                this.updateStateFromAWS();
            }
        } catch (error) {
            throw new Error(`Failed to update MQ broker ${this.state.broker_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        // Only delete brokers that we created (existing = false)
        // If existing = true, it means the broker pre-existed and we should not delete it
        if (this.state.broker_id && !this.state.existing) {
            try {
                // Initiate broker deletion
                this.deleteBroker(this.state.broker_id);
                
                // Wait for the broker to be fully deleted
                cli.output(`Waiting for MQ broker ${this.state.broker_id} deletion to complete...`);
                const deletionComplete = this.waitForBrokerDeletion(this.state.broker_id, 40); // 40 attempts = ~20 minutes
                
                if (!deletionComplete) {
                    cli.output(`Warning: MQ broker ${this.state.broker_id} deletion did not complete within timeout.`);
                }
                
                // Reset state after successful deletion
                this.state.existing = false;
                this.state.broker_state = undefined;
                this.state.broker_id = undefined;
                
            } catch (error) {
                throw new Error(`Failed to delete MQ broker ${this.state.broker_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        } else if (this.state.existing) {
            // Pre-existing broker - do not delete, just reset our tracking
            this.state.broker_id = undefined;
            this.state.broker_state = undefined;
        }
    }

    override checkReadiness(): boolean {
        try {
            // If we don't have a broker ID in state, we're not ready
            if (!this.state.broker_id) {
                return false;
            }
            
            // Get current broker status from AWS
            const response = this.checkBrokerExists(this.state.broker_id);
            if (!response) {
                return false;
            }
            
            const state = (response as any).brokerState || response.BrokerState; // Handle both casings
            
            // Update our state with the latest broker information
            const brokerState = formatBrokerState(response, this.state.existing);
            Object.assign(this.state, brokerState);
            
            // Check for ready state
            if (state === 'RUNNING') {
                return true;
            }
            
            // If in failed state, throw error
            if (state === 'CREATION_FAILED') {
                throw new Error(`MQ broker ${this.state.broker_id} creation failed`);
            }
            
            // For any other state (CREATION_IN_PROGRESS, REBOOT_IN_PROGRESS, etc.), not ready yet
            return false;
        } catch (_error) {
            // If error checking readiness, not ready yet (will retry)
            return false;
        }
    }

    @action("get-broker-info")
    getBrokerInfo(_args?: MonkecBase.Args): void {
        try {
            // First check if we have state information
            if (!this.state.broker_id) {
                cli.output(`MQ broker not found in entity state`);
                throw new Error(`MQ broker not found`);
            }
            
            const response = this.checkBrokerExists(this.state.broker_id);
            if (!response) {
                cli.output(`MQ broker ${this.state.broker_id} not found in AWS`);
                throw new Error(`MQ broker ${this.state.broker_id} not found`);
            }

            // Update entity state with latest broker information
            const brokerState = formatBrokerState(response, this.state.existing);
            Object.assign(this.state, brokerState);

            // Output information in a structured format (AWS uses camelCase)
            cli.output("=== MQ Broker Information ===");
            cli.output(`Broker ID: ${(response as any).brokerId || response.BrokerId || 'N/A'}`);
            cli.output(`Broker Name: ${(response as any).brokerName || response.BrokerName || 'N/A'}`);
            cli.output(`State: ${(response as any).brokerState || response.BrokerState || 'unknown'}`);
            cli.output(`Engine: ${(response as any).engineType || response.EngineType || 'unknown'} ${(response as any).engineVersion || response.EngineVersion || ''}`);
            cli.output(`Instance Type: ${(response as any).hostInstanceType || response.HostInstanceType || 'N/A'}`);
            cli.output(`Deployment Mode: ${(response as any).deploymentMode || response.DeploymentMode || 'N/A'}`);
            cli.output(`Publicly Accessible: ${(response as any).publiclyAccessible !== undefined ? ((response as any).publiclyAccessible ? 'Yes' : 'No') : (response.PubliclyAccessible ? 'Yes' : 'No')}`);
            cli.output(`Auto Minor Version Upgrade: ${(response as any).autoMinorVersionUpgrade !== undefined ? ((response as any).autoMinorVersionUpgrade ? 'Yes' : 'No') : (response.AutoMinorVersionUpgrade ? 'Yes' : 'No')}`);
            
            const subnetIds = (response as any).subnetIds || response.SubnetIds;
            if (subnetIds && subnetIds.length > 0) {
                cli.output(`Subnets: ${subnetIds.join(', ')}`);
            }
            
            const securityGroups = (response as any).securityGroups || response.SecurityGroups;
            if (securityGroups && securityGroups.length > 0) {
                cli.output(`Security Groups: ${securityGroups.join(', ')}`);
            }
            
            const brokerInstances = (response as any).brokerInstances || response.BrokerInstances;
            if (brokerInstances && Array.isArray(brokerInstances) && brokerInstances.length > 0) {
                cli.output("Broker Instances:");
                brokerInstances.forEach((instance: any, index: number) => {
                    cli.output(`  Instance ${index + 1}:`);
                    const consoleURL = instance.consoleURL || instance.ConsoleURL;
                    if (consoleURL) {
                        cli.output(`    Console URL: ${consoleURL}`);
                    }
                    const endpoints = instance.endpoints || instance.Endpoints;
                    if (endpoints && endpoints.length > 0) {
                        cli.output(`    Endpoints:`);
                        endpoints.forEach((endpoint: string) => {
                            cli.output(`      - ${endpoint}`);
                        });
                    }
                    const ipAddress = instance.ipAddress || instance.IpAddress;
                    if (ipAddress) {
                        cli.output(`    IP Address: ${ipAddress}`);
                    }
                });
            }
            
            const logs = (response as any).logs || response.Logs;
            if (logs) {
                cli.output("Logging:");
                const general = logs.general !== undefined ? logs.general : logs.General;
                const audit = logs.audit !== undefined ? logs.audit : logs.Audit;
                cli.output(`  General: ${general ? 'Enabled' : 'Disabled'}`);
                cli.output(`  Audit: ${audit ? 'Enabled' : 'Disabled'}`);
            }
            
            // Update local state
            const state = formatBrokerState(response, this.state.existing);
            Object.assign(this.state, state);
            
            cli.output("=== End MQ Broker Information ===");
        } catch (error) {
            const errorMsg = `Failed to get broker info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("get-connection-info")
    getConnectionInfo(_args?: MonkecBase.Args): void {
        try {
            // First check if we have state information
            if (!this.state.broker_id) {
                cli.output(`MQ broker not found in entity state`);
                throw new Error(`MQ broker not found`);
            }
            
            const response = this.checkBrokerExists(this.state.broker_id);
            if (!response) {
                cli.output(`MQ broker ${this.state.broker_id} not found in AWS`);
                throw new Error(`MQ broker ${this.state.broker_id} not found`);
            }

            // Update entity state with latest broker information  
            const brokerState = formatBrokerState(response, this.state.existing);
            Object.assign(this.state, brokerState);
            
            cli.output("=== MQ Connection Information ===");
            cli.output(`Broker Name: ${(response as any).brokerName || response.BrokerName}`);
            cli.output(`Engine Type: ${(response as any).engineType || response.EngineType}`);
            
            const brokerInstances = (response as any).brokerInstances || response.BrokerInstances;
            if (brokerInstances && Array.isArray(brokerInstances) && brokerInstances.length > 0) {
                brokerInstances.forEach((instance: any, index: number) => {
                    cli.output(`Instance ${index + 1}:`);
                    
                    const consoleURL = instance.consoleURL || instance.ConsoleURL;
                    if (consoleURL) {
                        cli.output(`  Web Console: ${consoleURL}`);
                    }
                    
                    const endpoints = instance.endpoints || instance.Endpoints;
                    if (endpoints && endpoints.length > 0) {
                        cli.output(`  Connection Endpoints:`);
                        endpoints.forEach((endpoint: string) => {
                            cli.output(`    ${endpoint}`);
                            
                            // Parse endpoint for additional info
                            const endpointMatch = /^([^:]+):\/\/([^:]+):(\d+)$/.exec(endpoint);
                            if (endpointMatch) {
                                const protocol = endpointMatch[1];
                                const host = endpointMatch[2];
                                const port = endpointMatch[3];
                                
                                const engineType = (response as any).engineType || response.EngineType;
                                if (engineType === 'ACTIVEMQ') {
                                    if (protocol === 'ssl') {
                                        cli.output(`    ActiveMQ SSL: ssl://${host}:${port}`);
                                    } else if (protocol === 'tcp') {
                                        cli.output(`    ActiveMQ TCP: tcp://${host}:${port}`);
                                    } else if (protocol === 'stomp+ssl') {
                                        cli.output(`    STOMP+SSL: stomp+ssl://${host}:${port}`);
                                    }
                                } else if (response.EngineType === 'RABBITMQ') {
                                    if (protocol === 'amqps') {
                                        cli.output(`    AMQP+SSL: amqps://${host}:${port}`);
                                    } else if (protocol === 'amqp') {
                                        cli.output(`    AMQP: amqp://${host}:${port}`);
                                    }
                                }
                            }
                        });
                    }
                });
            } else {
                cli.output(`MQ broker endpoints not available yet`);
            }
            
            cli.output("=== End MQ Connection Information ===");
        } catch (error) {
            const errorMsg = `Failed to get connection info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("reboot-broker")
    rebootBrokerAction(_args?: MonkecBase.Args): void {
        try {
            // Check entity state first
            if (!this.state.broker_id) {
                cli.output(`MQ broker not found in entity state`);
                throw new Error(`MQ broker not found`);
            }
            
            cli.output("=== Rebooting MQ Broker ===");
            cli.output(`Broker ID: ${this.state.broker_id}`);
            
            super.rebootBroker(this.state.broker_id);
            
            // Update entity state after reboot - broker will be in REBOOT_IN_PROGRESS state
            const currentResponse = this.checkBrokerExists(this.state.broker_id);
            if (currentResponse) {
                const brokerState = formatBrokerState(currentResponse, this.state.existing);
                Object.assign(this.state, brokerState);
            }
            
            cli.output("Broker reboot initiated successfully");
            cli.output("Note: Reboot may take a few minutes to complete");
            cli.output("=== Reboot Completed ===");
            
        } catch (error) {
            const errorMsg = `Failed to reboot broker: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    private updateStateFromAWS(): void {
        if (!this.state.broker_id) {
            return;
        }
        
        try {
            const response = this.checkBrokerExists(this.state.broker_id);
            if (response) {
                const state = formatBrokerState(response, this.state.existing);
                Object.assign(this.state, state);
            } else {
                this.state.existing = false;
            }
        } catch (_error) {
            // Silently handle state update failures
        }
    }
} 
