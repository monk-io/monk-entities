import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";

export interface AWSDynamoDBDefinition {
    region: string;
}

export interface AWSDynamoDBState {
    existing?: boolean;
    table_name?: string;
    table_arn?: string;
    table_status?: string;
}

export interface DynamoDBErrorResponse {
    __type: string;
    message?: string;
}

export abstract class AWSDynamoDBEntity<
    TDefinition extends AWSDynamoDBDefinition,
    TState extends AWSDynamoDBState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected makeDynamoDBRequest(action: string, body: any): any {
        const url = `https://dynamodb.${this.region}.amazonaws.com/`;
        
        const options = {
            service: "dynamodb",
            region: this.region,
            headers: {
                "X-Amz-Target": `DynamoDB_20120810.${action}`,
                "Content-Type": "application/x-amz-json-1.0"
            },
            body: typeof body === 'string' ? body : JSON.stringify(body),
            timeout: 30
        };

        cli.output(`🔧 DEBUG: DynamoDB API Request`);
        cli.output(`   Action: ${action}`);
        cli.output(`   URL: ${url}`);
        cli.output(`   Region: ${this.region}`);
        cli.output(`   Headers: ${JSON.stringify(options.headers, null, 2)}`);
        cli.output(`   Body: ${options.body}`);
        cli.output(`   Options: ${JSON.stringify(options, null, 2)}`);

        try {
            cli.output(`🚀 Sending DynamoDB request using aws.post()...`);
            cli.output(`🔐 AWS module type: ${typeof aws}`);
            cli.output(`🔧 AWS post method type: ${typeof aws.post}`);
            const response = aws.post(url, options);
            
            cli.output(`📥 DynamoDB Response:`);
            cli.output(`   Status Code: ${response.statusCode}`);
            cli.output(`   Status: ${response.status}`);
            cli.output(`   Headers: ${JSON.stringify(response.headers || {}, null, 2)}`);
            cli.output(`   Body: ${response.body || 'No body'}`);
            cli.output(`   Response Type: ${typeof response.body}`);

            if (response.statusCode >= 400) {
                let errorMessage = `DynamoDB API error: ${response.statusCode} ${response.status}`;
                
                try {
                    const errorBody: DynamoDBErrorResponse = JSON.parse(response.body);
                    if (errorBody.message) {
                        errorMessage += ` - ${errorBody.message}`;
                    }
                    if (errorBody.__type) {
                        errorMessage += ` - Type: ${errorBody.__type}`;
                    }
                } catch (parseError) {
                    errorMessage += ` - Raw: ${response.body}`;
                }
                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return JSON.parse(response.body);
                } catch (error) {
                    throw new Error(`Failed to parse DynamoDB API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            return response;
        } catch (error) {
            throw new Error(`DynamoDB API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected async waitForTableStatus(tableName: string, targetStatus: string, maxAttempts: number = 30, delaySeconds: number = 5): Promise<void> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = this.makeDynamoDBRequest("DescribeTable", {
                    TableName: tableName
                });

                const currentStatus = response.Table?.TableStatus;

                if (currentStatus === targetStatus) {
                    return;
                }

                if (currentStatus === "DELETING" && targetStatus !== "DELETING") {
                    throw new Error(`Table ${tableName} is being deleted`);
                }

                if (attempt < maxAttempts) {
                    // Note: In real implementation, we'd need a proper sleep function
                    // For now, we'll just continue without delay in the monk runtime
                }
            } catch (error) {
                if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                    if (targetStatus === "DELETING" || targetStatus === "DELETED") {
                        return;
                    }
                }
                throw error;
            }
        }

        throw new Error(`Table ${tableName} did not reach ${targetStatus} status within ${maxAttempts * delaySeconds} seconds`);
    }

    protected tableExists(tableName: string): boolean {
        try {
            const response = this.makeDynamoDBRequest("DescribeTable", {
                TableName: tableName
            });
            return !!response.Table;
        } catch (error) {
            if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                return false;
            }
            throw error;
        }
    }

    protected getTableInfo(tableName: string): any {
        cli.output(`🔍 Getting table info for: ${tableName}`);
        try {
            cli.output(`📞 Calling DescribeTable API...`);
            const response = this.makeDynamoDBRequest("DescribeTable", {
                TableName: tableName
            });
            cli.output(`📋 Table info response: ${JSON.stringify(response.Table, null, 2)}`);
            return response.Table;
        } catch (error) {
            cli.output(`❌ Error getting table info: ${error instanceof Error ? error.message : 'Unknown error'}`);
            if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                cli.output(`ℹ️ Table ${tableName} not found (ResourceNotFoundException)`);
                return null;
            }
            cli.output(`🚨 Rethrowing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
} 