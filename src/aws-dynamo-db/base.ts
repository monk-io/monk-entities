import { MonkEntity, action } from "monkec/base";
import aws from "cloud/aws";

// Re-export action decorator to avoid duplicate 'base' variable in compiled output
export { action };

export interface AWSDynamoDBDefinition {
    /** @description AWS region for the DynamoDB table */
    region: string;
}

export interface AWSDynamoDBState {
    /** @description Indicates if the table pre-existed before this entity managed it */
    existing?: boolean;
    /** @description Table name */
    table_name?: string;
    /** @description Table ARN */
    table_arn?: string;
    /** @description Current table status (e.g., ACTIVE) */
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

        try {
            const response = aws.post(url, options);

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

    protected waitForTableStatus(tableName: string, targetStatus: string, maxAttempts: number = 30, delaySeconds: number = 5): void {
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
                    // Implement proper delay using busy wait like other entities
                    const delayMs = delaySeconds * 1000;
                    const start = Date.now();
                    while (Date.now() - start < delayMs) {
                        // Busy wait
                    }
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
        try {
            const response = this.makeDynamoDBRequest("DescribeTable", {
                TableName: tableName
            });
            return response.Table;
        } catch (error) {
            if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                return null;
            }
            throw error;
        }
    }
} 