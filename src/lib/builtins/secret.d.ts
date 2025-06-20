/**
 * Secret management module for handling sensitive data (provided by Goja runtime)
 */
declare module "secret" {
  /**
   * Secret management interface
   */
  interface SecretModule {
    /**
     * Retrieves a secret value by key
     * @param key - The secret key
     * @returns The secret value or undefined if not found
     */
    get(key: string): string | undefined;

    /**
     * Sets a secret value
     * @param key - The secret key
     * @param value - The secret value
     */
    set(key: string, value: string): void;

    /**
     * Removes a secret
     * @param key - The secret key to remove
     */
    remove(key: string): void;

    /**
     * Generates a random string
     * @param length - The length of the random string
     * @returns A random string of the specified length
     */
    randString(length: number): string;
  }

  const secret: SecretModule;
  export default secret;
}
