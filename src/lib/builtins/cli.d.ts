/**
 * CLI module for command line operations (provided by Goja runtime)
 */
declare module "cli" {
  /**
   * CLI operations interface
   */
  interface CLIModule {
    /**
     * Outputs data to the command line
     * @param args - Arguments to output
     */
    output(...args: any[]): void;
  }

  const cli: CLIModule;
  export default cli;
}
