/**
 * Helpers module for utility functions (provided by Goja runtime)
 */

/**
 * Creates an Error object with the specified message
 * @param message - The error message
 * @returns A new Error object
 */
declare function error(message: string): Error;

/**
 * Decodes a base64 encoded string
 * @param encoded - The base64 encoded string
 * @returns The decoded string
 */
declare function atob(encoded: string): string;

/**
 * Encodes a string to base64
 * @param plain - The plain text string
 * @returns The base64 encoded string
 */
declare function btoa(plain: string): string;

declare module "helpers" {
  /**
   * Helper utilities interface
   */
  interface HelpersModule {
    /**
     * Creates an Error object with the specified message
     * @param message - The error message
     * @returns A new Error object
     */
    error(message: string): Error;

    /**
     * Decodes a base64 encoded string
     * @param encoded - The base64 encoded string
     * @returns The decoded string
     */
    atob(encoded: string): string;

    /**
     * Encodes a string to base64
     * @param plain - The plain text string
     * @returns The base64 encoded string
     */
    btoa(plain: string): string;
  }

  const helpers: HelpersModule;
  export default helpers;
}
