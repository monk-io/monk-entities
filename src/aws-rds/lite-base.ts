import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface RDSLiteDefinition {
	region: string;
}

export interface RDSLiteState {
	existing?: boolean;
}

export abstract class AWSRDSLiteEntity<
	TDefinition extends RDSLiteDefinition,
	TState extends RDSLiteState
> extends MonkEntity<TDefinition, TState> {

	protected region!: string;

	protected override before(): void {
		this.region = this.definition.region;
	}

	protected makeRDSRequest(action: string, params: Record<string, any> = {}): any {
		const url = `https://rds.${this.region}.amazonaws.com/`;

		const formParams: Record<string, string> = {
			'Action': action,
			'Version': '2014-10-31'
		};

		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			formParams[key] = String(value);
		}

		const formBody = Object.entries(formParams)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');

		const response = aws.post(url, {
			service: 'rds',
			region: this.region,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: formBody
		});

		if (response.statusCode >= 400) {
			let errorMessage = `AWS RDS API error: ${response.statusCode} ${response.status}`;
			try {
				const msg = /<Message>(.*?)<\/Message>/.exec(response.body);
				if (msg) errorMessage += ` - ${msg[1]}`;
				const code = /<Code>(.*?)<\/Code>/.exec(response.body);
				if (code) errorMessage += ` (${code[1]})`;
			} catch (_e) {
				errorMessage += ` - Raw: ${response.body}`;
			}
			throw new Error(errorMessage);
		}

		return response;
	}
}


