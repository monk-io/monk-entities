import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSEC2Definition {
	region: string;
}

export interface AWSEC2State {
	existing?: boolean;
}

export interface EC2Response {
	statusCode?: number;
	body?: string;
}

export abstract class AWSEC2Entity<
	TDefinition extends AWSEC2Definition,
	TState extends AWSEC2State
> extends MonkEntity<TDefinition, TState> {

	protected region!: string;

	protected override before(): void {
		this.region = this.definition.region;
	}

	protected makeEC2Request(action: string, params: Record<string, any> = {}): EC2Response {
		const url = `https://ec2.${this.region}.amazonaws.com/`;

		const formParams: Record<string, string> = {
			'Action': action,
			'Version': '2016-11-15'
		};

		this.addParamsToFormData(formParams, params);

		const formBody = Object.entries(formParams)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');

		const response = aws.post(url, {
			service: 'ec2',
			region: this.region,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: formBody
		});

		if (response.statusCode >= 400) {
			let errorMessage = `AWS EC2 API error: ${response.statusCode} ${response.status}`;
			try {
				const messageMatch = /<Message>(.*?)<\/Message>/.exec(response.body);
				if (messageMatch) errorMessage += ` - ${messageMatch[1]}`;
				const codeMatch = /<Code>(.*?)<\/Code>/.exec(response.body);
				if (codeMatch) errorMessage += ` (${codeMatch[1]})`;
			} catch (_e) {
				errorMessage += ` - Raw: ${response.body}`;
			}
			throw new Error(errorMessage);
		}

		return response;
	}

	protected addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
		for (const [key, value] of Object.entries(params)) {
			const paramKey = prefix ? `${prefix}.${key}` : key;
			if (value === null || value === undefined) {
				continue;
			}
			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					if (typeof item === 'object') {
						this.addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
					} else {
						formParams[`${paramKey}.member.${index + 1}`] = String(item);
					}
				});
			} else if (typeof value === 'object') {
				this.addParamsToFormData(formParams, value, paramKey);
			} else {
				formParams[paramKey] = String(value);
			}
		}
	}
}


