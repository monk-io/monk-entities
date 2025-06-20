/**
 * Variables module for storing and retrieving runtime variables (provided by Goja runtime)
 */
declare module "vars" {
  /**
   * Variables management interface
   */
  interface VarsModule {
    /**
     * Gets a variable value
     * @param key - The variable key
     * @returns The variable value
     */
    get(key: string): any;

    /**
     * Sets a variable value
     * @param key - The variable key
     * @param value - The variable value
     */
    set(key: string, value: any): void;

    /**
     * Checks if a variable exists
     * @param key - The variable key
     * @returns True if the variable exists
     */
    has(key: string): boolean;
  }

  const vars: VarsModule;
  export default vars;
}
