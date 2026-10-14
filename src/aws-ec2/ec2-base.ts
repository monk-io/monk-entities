import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSEC2Definition {
	/** @description AWS region, e.g. us-east-1 */
	region: string;
}

export interface AWSEC2State {
	/** @description Whether the resource existed before this entity managed it; such resources are left in place on delete */
	existing?: boolean;
}

export interface EC2Response {
	statusCode?: number;
	body?: string;
}

/**
 * The tag that says which Monk entity made a resource, so a create whose
 * response was lost finds what it made instead of making another.
 */
export const OWNER_TAG = "monk.io/owner";

/**
 * The AWS error code of an EC2 error, e.g. InvalidVpcID.NotFound; undefined
 * for anything else.
 */
export function ec2ErrorCode(err: unknown): string | undefined {
	if (typeof err !== "object" || err === null) return undefined;
	const code = (err as any).code;
	return typeof code === "string" ? code : undefined;
}

/**
 * A map of strings, such as tags, as given: Monk keeps a definition's maps
 * as a tree, so a key with slashes (kubernetes.io/role/elb) comes back
 * nested, and is joined up again here.
 */
export function flatStrings(m: Record<string, any> | undefined, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(m || {})) {
		const key = prefix ? `${prefix}/${k}` : k;
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			const inner = flatStrings(v, key);
			for (const ik of Object.keys(inner)) out[ik] = inner[ik];
		} else if (v !== undefined && v !== null) {
			out[key] = String(v);
		}
	}
	return out;
}

/** The text of the first <tag> element in xml, if any. */
export function xmlValue(xml: string, tag: string): string | undefined {
	const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
	return m ? m[1] : undefined;
}

/** The contents of each <item> directly in the first <set> element of xml. */
export function xmlItems(xml: string, set: string): string[] {
	const m = new RegExp(`<${set}>([\\s\\S]*?)</${set}>`).exec(xml);
	if (!m) return [];
	const items: string[] = [];
	const re = /<item>([\s\S]*?)<\/item>/g;
	let it: RegExpExecArray | null;
	while ((it = re.exec(m[1])) !== null) items.push(it[1]);
	return items;
}

export abstract class AWSEC2Entity<
	TDefinition extends AWSEC2Definition,
	TState extends AWSEC2State
> extends MonkEntity<TDefinition, TState> {

	protected region!: string;

	protected override before(): void {
		this.region = this.definition.region;
	}

	/**
	 * Makes an EC2 Query API request. Errors are thrown as an Error with
	 * the AWS error code (code) and how the request failed (status, kind),
	 * as monkec/resilience reads them.
	 */
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

		if (!response.statusCode) {
			throw this.failure(`AWS EC2 ${action} failed: ${response.error || 'no response'}`, "transport", 0, url, "", undefined);
		}
		if (response.statusCode >= 400) {
			const body = response.body || '';
			const code = xmlValue(body, 'Code');
			const message = xmlValue(body, 'Message');
			let text = `AWS EC2 ${action} failed: ${response.statusCode}`;
			if (message) text += ` - ${message}`;
			if (code) text += ` (${code})`;
			throw this.failure(text, "status", response.statusCode, url, body, code);
		}
		// A garbled answer must not read as an empty one.
		if ((response.body || '').indexOf(`<${action}Response`) < 0) {
			throw this.failure(`AWS EC2 ${action} answered with something that is not its response`, "malformed", response.statusCode, url, response.body || '', undefined);
		}

		return response;
	}

	private failure(message: string, kind: string, status: number, url: string, body: string, code: string | undefined): Error {
		const err: any = new Error(message);
		err.kind = kind;
		err.status = status;
		err.method = "POST";
		err.url = url;
		err.body = body;
		err.headers = {};
		if (code) err.code = code;
		return err;
	}

	/**
	 * Adds params in the EC2 query form: a list is Name.1, Name.2, ...;
	 * an object in a list is Name.1.Field.
	 */
	protected addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
		for (const [key, value] of Object.entries(params)) {
			const paramKey = prefix ? `${prefix}.${key}` : key;
			if (value === null || value === undefined) {
				continue;
			}
			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					if (typeof item === 'object') {
						this.addParamsToFormData(formParams, item, `${paramKey}.${index + 1}`);
					} else {
						formParams[`${paramKey}.${index + 1}`] = String(item);
					}
				});
			} else if (typeof value === 'object') {
				this.addParamsToFormData(formParams, value, paramKey);
			} else {
				formParams[paramKey] = String(value);
			}
		}
	}

	/** The tags a new resource gets: the definition's, and the owner tag. */
	protected ownTags(tags: Record<string, string> | undefined): Record<string, string> {
		const out = flatStrings(tags);
		out[OWNER_TAG] = this.path;
		return out;
	}

	/** TagSpecification params that tag a resource of type as it is created. */
	protected tagSpecification(resourceType: string, tags: Record<string, string>): Record<string, string> {
		const params: Record<string, string> = { 'TagSpecification.1.ResourceType': resourceType };
		let idx = 1;
		for (const [k, v] of Object.entries(tags)) {
			params[`TagSpecification.1.Tag.${idx}.Key`] = k;
			params[`TagSpecification.1.Tag.${idx}.Value`] = v;
			idx++;
		}
		return params;
	}

	/** Sets tags on a resource. */
	protected setTags(resourceId: string, tags: Record<string, string> | undefined): void {
		const flat = flatStrings(tags);
		if (Object.keys(flat).length === 0) return;
		const params: Record<string, string> = { 'ResourceId.1': resourceId };
		let idx = 1;
		for (const [k, v] of Object.entries(flat)) {
			params[`Tag.${idx}.Key`] = k;
			params[`Tag.${idx}.Value`] = v;
			idx++;
		}
		this.makeEC2Request('CreateTags', params);
	}

	/**
	 * The ID of the resource this entity made before, found by its owner tag
	 * with a Describe action: a create whose response was lost made it.
	 */
	protected findOwnId(describeAction: string, idElement: string): string | undefined {
		const resp = this.makeEC2Request(describeAction, this.ownerFilter());
		return xmlValue(resp.body || '', idElement);
	}

	/** Runs del, which counts as done if the resource is already gone (notFoundCode). */
	protected deleteIfExists(notFoundCode: string, del: () => void): void {
		try {
			del();
		} catch (err) {
			if (ec2ErrorCode(err) !== notFoundCode) throw err;
		}
	}

	/** Filter params that find resources this entity made, by its owner tag. */
	protected ownerFilter(): Record<string, string> {
		return { 'Filter.1.Name': `tag:${OWNER_TAG}`, 'Filter.1.Value.1': this.path };
	}
}
