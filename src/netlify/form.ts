import { NetlifyEntity, NetlifyEntityDefinition, NetlifyEntityState } from "./netlify-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";

/**
 * Represents a Netlify form entity.
 * This entity allows interaction with Netlify forms via its API.
 * @interface FormDefinition
 */
export interface FormDefinition extends NetlifyEntityDefinition {
    /**
     * Site ID
     * @description The Netlify site ID that contains the form
     */
    site_id: string;

    /**
     * Form name
     * @description Name of the form to manage
     */
    name: string;
}

/**
 * Represents the mutable runtime state of a Netlify form entity.
 * This state can change during the entity's lifecycle.
 * @interface FormState
 */
export interface FormState extends NetlifyEntityState {
    /**
     * Form ID from Netlify
     * @description Unique identifier for the form
     */
    id?: string;

    /**
     * Site ID
     * @description The site this form belongs to
     */
    site_id?: string;

    /**
     * Form name
     * @description Name of the form
     */
    name?: string;

    /**
     * Form paths
     * @description Paths where the form is located
     */
    paths?: string[];

    /**
     * Submission count
     * @description Number of submissions to this form
     */
    submission_count?: number;

    /**
     * Form fields
     * @description Fields defined in the form
     */
    fields?: Array<{
        name: string;
        type: string;
    }>;

    /**
     * Created timestamp
     * @description When the form was created
     * @format date-time
     */
    created_at?: string;
}

/**
 * @description Netlify Form entity.
 * Manages form submissions for Netlify sites.
 * Forms collect user submissions from static HTML forms.
 * 
 * ## Secrets
 * - Reads: `secret_ref` - Netlify API token (defaults to `netlify-api-token`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Form ID
 * - `state.name` - Form name
 * - `state.submission_count` - Number of submissions
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `netlify/site` - The site containing this form
 */
export class Form extends NetlifyEntity<FormDefinition, FormState> {
    
    protected getEntityName(): string {
        return `Form ${this.definition.name} on site ${this.definition.site_id}`;
    }

    /** Create or find a Netlify form */
    override create(): void {
        // Check if form already exists
        const forms = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms`);
        
        const existingForm = forms.find((form: any) => form.name === this.definition.name);
        
        if (existingForm) {
            // Form already exists, set our state
            this.state = {
                id: existingForm.id,
                site_id: existingForm.site_id,
                name: existingForm.name,
                paths: existingForm.paths,
                submission_count: existingForm.submission_count,
                fields: existingForm.fields,
                created_at: existingForm.created_at,
                existing: true
            };
            cli.output(`Form ${this.definition.name} already exists on site ${this.definition.site_id}`);
            return;
        }

        // Forms are typically created automatically when HTML forms are deployed
        // This entity is mainly for managing existing forms
        throw new Error(`Form ${this.definition.name} not found on site ${this.definition.site_id}. Forms are created automatically when HTML forms are deployed.`);
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Forms are typically managed through HTML, not API updates
        cli.output("Forms are typically managed through HTML updates and redeploys");
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Form does not exist, nothing to delete");
            return;
        }
        
        this.deleteResource(`/sites/${this.definition.site_id}/forms/${this.state.id}`, "Form");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            const form = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms/${this.state.id}`);
            return !!form.id;
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    @action("get-form")
    getForm(): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const form = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms/${this.state.id}`);
        
        cli.output(`Form: ${form.name}`);
        cli.output(`ID: ${form.id}`);
        cli.output(`Site ID: ${form.site_id}`);
        cli.output(`Submission count: ${form.submission_count}`);
        cli.output(`Created: ${form.created_at}`);
        
        if (form.paths && form.paths.length > 0) {
            cli.output(`Paths: ${form.paths.join(", ")}`);
        }
        
        if (form.fields && form.fields.length > 0) {
            cli.output("Fields:");
            form.fields.forEach((field: any) => {
                cli.output(`  - ${field.name} (${field.type})`);
            });
        }
    }

    @action("list-submissions")
    listSubmissions(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const page = args?.page || "1";
        const perPage = args?.per_page || "10";
        const state = args?.state || "verified"; // verified or spam
        
        const submissions = this.makeRequest("GET", `/forms/${this.state.id}/submissions?page=${page}&per_page=${perPage}&state=${state}`);
        
        cli.output(`Submissions for form ${this.state.name} (${state}):`);
        submissions.forEach((submission: any, index: number) => {
            cli.output(`${index + 1}. ${submission.id} - ${submission.email || 'No email'} - ${submission.created_at}`);
        });
    }

    @action("get-submission")
    getSubmission(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const submissionId = args?.submission_id;
        if (!submissionId) {
            throw new Error("submission_id argument is required");
        }

        const submission = this.makeRequest("GET", `/submissions/${submissionId}`);
        
        cli.output(`Submission: ${submission.id}`);
        cli.output(`Number: ${submission.number}`);
        cli.output(`Email: ${submission.email || 'No email'}`);
        cli.output(`Name: ${submission.name || 'No name'}`);
        cli.output(`Created: ${submission.created_at}`);
        
        if (submission.data) {
            cli.output("Data:");
            Object.entries(submission.data).forEach(([key, value]) => {
                cli.output(`  ${key}: ${value}`);
            });
        }
    }

    @action("mark-submission-spam")
    markSubmissionSpam(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const submissionId = args?.submission_id;
        if (!submissionId) {
            throw new Error("submission_id argument is required");
        }

        this.makeRequest("PUT", `/submissions/${submissionId}/spam`);
        
        cli.output(`✅ Marked submission ${submissionId} as spam`);
    }

    @action("mark-submission-ham")
    markSubmissionHam(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const submissionId = args?.submission_id;
        if (!submissionId) {
            throw new Error("submission_id argument is required");
        }

        this.makeRequest("PUT", `/submissions/${submissionId}/ham`);
        
        cli.output(`✅ Marked submission ${submissionId} as verified`);
    }

    @action("delete-submission")
    deleteSubmission(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Form does not exist");
        }

        const submissionId = args?.submission_id;
        if (!submissionId) {
            throw new Error("submission_id argument is required");
        }

        this.makeRequest("DELETE", `/submissions/${submissionId}`);
        
        cli.output(`✅ Deleted submission ${submissionId}`);
    }

    @action("list-all-forms")
    listAllForms(): void {
        const forms = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms`);
        
        cli.output(`Forms on site ${this.definition.site_id}:`);
        forms.forEach((form: any, index: number) => {
            cli.output(`${index + 1}. ${form.name} (${form.id}) - ${form.submission_count} submissions`);
        });
    }
} 