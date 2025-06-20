/**
 * Parser module for querying XML, JSON, and HTML data (provided by Goja runtime)
 */
declare module "parser" {
  /**
   * Parser operations interface
   */
  interface ParserModule {
    /**
     * Queries XML data using XPath or similar query syntax
     * @param xml - The XML string to query
     * @param query - The query expression
     * @returns Array of matching results or parsed data
     */
    xmlQuery(xml: string, query: string): string[] | any;

    /**
     * Queries JSON data using JSONPath or similar query syntax
     * @param json - The JSON string to query
     * @param query - The query expression
     * @returns Array of matching results
     */
    jsonQuery(json: string, query: string): any[];

    /**
     * Queries HTML data using CSS selectors or similar query syntax
     * @param html - The HTML string to query
     * @param query - The query expression (CSS selector)
     * @returns Array of matching elements or parsed data
     */
    htmlQuery(html: string, query: string): string[] | any;
  }

  const parser: ParserModule;
  export default parser;
}
